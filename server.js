const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for HTTPS detection on Railway/Render
app.set('trust proxy', 1);

// Admin Credentials (can be overridden via env vars for production)
const ADMIN_USER = process.env.ADMIN_USER || "admin123";
const ADMIN_PASS = process.env.ADMIN_PASS || "JBS@811R";

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database setup - use env variable for path or default to local
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Error opening database:', err);
  else {
    console.log('Connected to SQLite database.');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reg_code TEXT UNIQUE NOT NULL,
        plan TEXT NOT NULL,
        primary_name TEXT NOT NULL,
        age INTEGER,
        gender TEXT,
        mobile TEXT NOT NULL,
        city TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_mobile TEXT NOT NULL,
        utr_number TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        checked_in INTEGER DEFAULT 0,
        checked_in_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });
}

function generateRegCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `JK2026-${rand}`;
}

// 1. User Submit Registration
app.post('/api/register', (req, res) => {
  const { plan, primary_name, age, gender, mobile, city, amount, payment_mobile, utr_number } = req.body;

  if (!primary_name || !mobile || !utr_number || !plan) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const regCode = generateRegCode();
  const query = `
    INSERT INTO registrations (reg_code, plan, primary_name, age, gender, mobile, city, amount, payment_mobile, utr_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [regCode, plan, primary_name, age || null, gender || '', mobile, city, amount, payment_mobile, utr_number], function(err) {
    if (err) {
      console.error('Registration DB Error:', err);
      return res.status(500).json({ error: 'Failed to record registration.' });
    }

    return res.json({
      success: true,
      message: 'Registration submitted! Payment status is pending admin approval.',
      reg_code: regCode
    });
  });
});

// 2. Public Registration Status Lookup
app.get('/api/registration/lookup', (req, res) => {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }

  const sql = `
    SELECT id, reg_code, plan, primary_name, age, gender, mobile, city, amount, utr_number, status, checked_in, checked_in_at, created_at
    FROM registrations
    WHERE UPPER(reg_code) = UPPER(?) OR mobile = ?
    ORDER BY id DESC
  `;

  db.all(sql, [query.trim(), query.trim()], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'No registration found.' });
    }
    res.json({ success: true, registrations: rows });
  });
});

// 3. Generate QR Code API
app.get('/api/qr/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const host = req.get('host');
    const protocol = req.protocol;
    // Encode direct checkin link into QR so phone camera / Google Lens opens web page instead of plain search
    const targetUrl = `${protocol}://${host}/admin.html?scan=${code}`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      color: { dark: '#062c30', light: '#fdfbf7' },
      width: 280
    });
    res.type('image/png');
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, 'base64');
    res.send(imgBuffer);
  } catch (err) {
    res.status(500).send('Error generating QR');
  }
});

// 4. Admin Auth Login API
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true, token: 'ADMIN_AUTH_TOKEN_JBS811R' });
  }
  return res.status(401).json({ success: false, error: 'Invalid Username or Password' });
});

// Admin Auth Middleware
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader === 'Bearer ADMIN_AUTH_TOKEN_JBS811R') {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
}

// 5. Admin - List All Registrations
app.get('/api/admin/registrations', requireAdminAuth, (req, res) => {
  db.all(`SELECT * FROM registrations ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, registrations: rows });
  });
});

// 6. Admin - Confirm / Reject Payment Status
app.post('/api/admin/registration/status', requireAdminAuth, (req, res) => {
  const { id, status } = req.body;
  if (!id || !['confirmed', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid ID or status' });
  }

  db.run(`UPDATE registrations SET status = ? WHERE id = ?`, [status, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: `Registration updated to ${status}` });
  });
});

// 7. Admin Gate QR Scanner Check-in API
app.post('/api/admin/checkin', requireAdminAuth, (req, res) => {
  let { reg_code } = req.body;
  if (!reg_code) return res.status(400).json({ error: 'Reg Code required' });

  // Extract registration code if input is a full scanned URL
  reg_code = reg_code.trim();
  if (reg_code.includes('scan=')) {
    reg_code = reg_code.split('scan=')[1].split('&')[0];
  } else if (reg_code.includes('code=')) {
    reg_code = reg_code.split('code=')[1].split('&')[0];
  }

  db.get(`SELECT * FROM registrations WHERE UPPER(reg_code) = UPPER(?)`, [reg_code], (err, reg) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!reg) return res.status(404).json({ success: false, message: 'Invalid Registration Code / QR' });

    if (reg.status !== 'confirmed') {
      return res.json({ success: false, message: `Payment status is ${reg.status.toUpperCase()}. Entry Denied!` });
    }

    if (reg.checked_in) {
      return res.json({ success: false, message: `Already Checked-In at ${reg.checked_in_at}` });
    }

    const nowStr = new Date().toLocaleString();
    db.run(`UPDATE registrations SET checked_in = 1, checked_in_at = ? WHERE id = ?`, [nowStr, reg.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        success: true,
        message: 'Entry Approved! Welcome to Janmashtami 2026.',
        registrant: reg
      });
    });
  });
});

// 8. Admin - Event Analytics & Headcount Stats API
app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
  db.all(`SELECT plan, status, checked_in, amount FROM registrations`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let total = rows.length;
    let confirmed = 0;
    let pending = 0;
    let rejected = 0;
    let totalRevenue = 0;
    let checkedInTotal = 0;
    let checkedInOneDay = 0;
    let checkedInTwoDay = 0;

    rows.forEach(r => {
      if (r.status === 'confirmed') {
        confirmed++;
        totalRevenue += (r.amount || 0);
      } else if (r.status === 'pending') {
        pending++;
      } else if (r.status === 'rejected') {
        rejected++;
      }

      if (r.checked_in) {
        checkedInTotal++;
        if (r.plan && r.plan.includes('100')) {
          checkedInOneDay++;
        } else {
          checkedInTwoDay++;
        }
      }
    });

    res.json({
      success: true,
      stats: {
        total,
        confirmed,
        pending,
        rejected,
        totalRevenue,
        checkedInTotal,
        checkedInOneDay,
        checkedInTwoDay
      }
    });
  });
});

// 9. Single Receipt Details API
app.get('/api/receipt/:code', (req, res) => {
  const code = req.params.code;
  db.get(`SELECT * FROM registrations WHERE UPPER(reg_code) = UPPER(?)`, [code.trim()], (err, reg) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!reg) return res.status(404).json({ error: 'Pass receipt not found' });
    res.json({ success: true, registration: reg });
  });
});


app.listen(PORT, () => {
  console.log(`Janmashtami Registration Server running on http://localhost:${PORT}`);
});
