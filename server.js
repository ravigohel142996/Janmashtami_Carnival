const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for HTTPS detection on Railway/Render
app.set('trust proxy', 1);

// --- Credentials (override via environment variables in production) ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin123';
const ADMIN_PASS = process.env.ADMIN_PASS || 'JBS@811R';
const GATE_USER  = process.env.GATE_USER  || 'gate123';
const GATE_PASS  = process.env.GATE_PASS  || 'JBS@811R';

// Static auth tokens (sufficient for this event scale — not exposed in frontend)
const ADMIN_TOKEN = 'ADMIN_TKN_JBS811R_2026';
const GATE_TOKEN  = 'GATE_TKN_JBS811R_2026';

// --- Plan → Amount map (single source of truth — never trust client amount) ---
const PLAN_AMOUNT_MAP = {
  '₹100 One Day': 100,
  '₹500 Two Day Resident': 500
};

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Database setup ---
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Error opening database:', err);
  else {
    console.log('Connected to SQLite database at:', DB_PATH);
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    // Create table — utr_number is nullable (optional field)
    db.run(`
      CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reg_code TEXT UNIQUE NOT NULL,
        plan TEXT NOT NULL,
        primary_name TEXT NOT NULL,
        age INTEGER,
        gender TEXT NOT NULL DEFAULT '',
        mobile TEXT NOT NULL,
        city TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_mobile TEXT NOT NULL,
        utr_number TEXT NOT NULL DEFAULT '',
        status TEXT DEFAULT 'pending',
        checked_in INTEGER DEFAULT 0,
        checked_in_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: if utr_number column exists as NOT NULL without default, handle gracefully
    // (SQLite ALTER TABLE is limited, but CREATE TABLE IF NOT EXISTS handles new installs)
  });
}

// --- Registration code generator ---
function generateRegCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `JK2026-${rand}`;
}

// --- Auth Middlewares ---

// Full admin only
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${ADMIN_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
}

// Gate staff OR admin
function requireGateOrAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${ADMIN_TOKEN}` || authHeader === `Bearer ${GATE_TOKEN}`) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Staff login required.' });
}

// Determine role from token (used in routes that need role-aware responses)
function getRoleFromToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${ADMIN_TOKEN}`) return 'admin';
  if (authHeader === `Bearer ${GATE_TOKEN}`) return 'gate';
  return null;
}

// ============================================================
// PUBLIC ROUTES
// ============================================================

// 1. User Registration Submission
app.post('/api/register', (req, res) => {
  const { plan, primary_name, age, gender, mobile, city, payment_mobile, utr_number } = req.body;

  // --- Server-side required field validation ---
  if (!plan || !primary_name || !gender || !mobile || !city || !payment_mobile) {
    return res.status(400).json({ error: 'Missing required fields: name, gender, mobile, city, payer mobile and plan are required.' });
  }

  // --- Validate mobile (basic 10-digit check) ---
  const mobileCleaned = mobile.replace(/\D/g, '');
  if (mobileCleaned.length < 10) {
    return res.status(400).json({ error: 'Invalid mobile number. Must be at least 10 digits.' });
  }

  // --- Compute amount server-side — NEVER trust client ---
  const amount = PLAN_AMOUNT_MAP[plan];
  if (!amount) {
    return res.status(400).json({ error: 'Invalid plan selected.' });
  }

  // --- UTR is optional — default to empty string ---
  const utrValue = (utr_number || '').toString().trim();

  // --- Attempt up to 5 times to generate a unique reg code ---
  let attempts = 0;
  const tryInsert = () => {
    attempts++;
    if (attempts > 5) {
      return res.status(500).json({ error: 'Could not generate unique registration code. Please try again.' });
    }

    const regCode = generateRegCode();
    const query = `
      INSERT INTO registrations (reg_code, plan, primary_name, age, gender, mobile, city, amount, payment_mobile, utr_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [
      regCode,
      plan.trim(),
      primary_name.trim(),
      age ? parseInt(age) : null,
      gender.trim(),
      mobileCleaned,
      city.trim(),
      amount,
      (payment_mobile || '').replace(/\D/g, '') || mobileCleaned,
      utrValue
    ], function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT' && err.message.includes('reg_code')) {
          // Collision on reg_code — retry with new code
          return tryInsert();
        }
        console.error('Registration DB Error:', err);
        return res.status(500).json({ error: 'Failed to record registration. Please try again.' });
      }

      return res.json({
        success: true,
        message: 'Registration submitted successfully! Payment is pending admin approval.',
        reg_code: regCode,
        plan,
        amount
      });
    });
  };

  tryInsert();
});

// 2. Public Registration Status Lookup (by reg_code or mobile)
app.get('/api/registration/lookup', (req, res) => {
  const query = (req.query.query || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }

  const sql = `
    SELECT id, reg_code, plan, primary_name, age, gender, mobile, city, amount, utr_number, status, checked_in, checked_in_at, created_at
    FROM registrations
    WHERE UPPER(reg_code) = UPPER(?) OR mobile = ?
    ORDER BY id DESC
  `;

  db.all(sql, [query, query], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No registration found.' });
    }
    res.json({ success: true, registrations: rows });
  });
});

// 3. Generate Pass QR Code Image
app.get('/api/qr/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const host = req.get('host');
    const protocol = req.protocol;
    // QR encodes the admin check-in URL so scanning with camera opens the gate check-in flow
    const targetUrl = `${protocol}://${host}/admin.html?scan=${code}`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      color: { dark: '#062c30', light: '#fdfbf7' },
      width: 300,
      margin: 2
    });
    res.type('image/png');
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    res.send(Buffer.from(base64Data, 'base64'));
  } catch (err) {
    res.status(500).send('Error generating QR');
  }
});

// 4. Single Receipt Details (public — needed for user to view their pass)
app.get('/api/receipt/:code', (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  db.get(`SELECT * FROM registrations WHERE UPPER(reg_code) = ?`, [code], (err, reg) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!reg) return res.status(404).json({ error: 'Pass receipt not found' });
    // Do NOT expose payment_mobile or utr_number in public receipt response
    const { payment_mobile: _pm, ...safeReg } = reg;
    res.json({ success: true, registration: safeReg });
  });
});

// ============================================================
// STAFF AUTH
// ============================================================

// 5. Admin / Gate Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true, token: ADMIN_TOKEN, role: 'admin' });
  }

  if (username === GATE_USER && password === GATE_PASS) {
    return res.json({ success: true, token: GATE_TOKEN, role: 'gate' });
  }

  return res.status(401).json({ success: false, error: 'Invalid username or password.' });
});

// ============================================================
// ADMIN-ONLY ROUTES
// ============================================================

// 6. List All Registrations (admin only)
app.get('/api/admin/registrations', requireAdminAuth, (req, res) => {
  db.all(`SELECT * FROM registrations ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, registrations: rows });
  });
});

// 7. Update Registration Payment Status (admin only)
app.post('/api/admin/registration/status', requireAdminAuth, (req, res) => {
  const { id, status } = req.body;
  if (!id || !['confirmed', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid ID or status value.' });
  }

  db.run(`UPDATE registrations SET status = ? WHERE id = ?`, [status, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Registration not found.' });
    res.json({ success: true, message: `Registration status updated to ${status}` });
  });
});

// ============================================================
// GATE + ADMIN SHARED ROUTES
// ============================================================

// 8. Gate QR Scanner Check-in (gate or admin)
app.post('/api/admin/checkin', requireGateOrAdminAuth, (req, res) => {
  let { reg_code } = req.body;
  if (!reg_code) return res.status(400).json({ error: 'Registration code required.' });

  // Extract code from full scanned URL if needed
  reg_code = reg_code.trim();
  if (reg_code.includes('scan=')) {
    reg_code = reg_code.split('scan=')[1].split('&')[0];
  } else if (reg_code.includes('code=')) {
    reg_code = reg_code.split('code=')[1].split('&')[0];
  }
  reg_code = reg_code.toUpperCase();

  db.get(`SELECT * FROM registrations WHERE UPPER(reg_code) = ?`, [reg_code], (err, reg) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!reg) return res.status(404).json({ success: false, message: '❌ Invalid QR / Registration Code not found.' });

    if (reg.status !== 'confirmed') {
      return res.json({
        success: false,
        message: `❌ Payment status is ${reg.status.toUpperCase()}. Entry denied — payment not confirmed.`
      });
    }

    if (reg.checked_in) {
      return res.json({
        success: false,
        message: `⚠️ Already checked in at ${reg.checked_in_at}. Possible duplicate entry attempt.`
      });
    }

    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    db.run(
      `UPDATE registrations SET checked_in = 1, checked_in_at = ? WHERE id = ?`,
      [nowStr, reg.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          success: true,
          message: '✅ Entry Approved! Welcome to Janmashtami 2026.',
          registrant: {
            reg_code: reg.reg_code,
            primary_name: reg.primary_name,
            plan: reg.plan,
            mobile: reg.mobile,
            city: reg.city,
            gender: reg.gender,
            age: reg.age
          }
        });
      }
    );
  });
});

// 9. Event Analytics & Headcount Stats (role-aware response)
app.get('/api/admin/stats', requireGateOrAdminAuth, (req, res) => {
  const role = getRoleFromToken(req);

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

    const baseStats = { total, confirmed, checkedInTotal, checkedInOneDay, checkedInTwoDay };

    // Gate role only sees headcount — not financials or pending queue
    if (role === 'gate') {
      return res.json({ success: true, stats: baseStats });
    }

    // Admin sees everything
    return res.json({
      success: true,
      stats: { ...baseStats, pending, rejected, totalRevenue }
    });
  });
});

// ============================================================
app.listen(PORT, () => {
  console.log(`🦚 Janmashtami Registration Server running on http://localhost:${PORT}`);
  console.log(`   DB: ${DB_PATH}`);
  console.log(`   Admin: ${ADMIN_USER} | Gate: ${GATE_USER}`);
});
