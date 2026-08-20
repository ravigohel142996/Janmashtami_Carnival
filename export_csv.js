const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const db = new sqlite3.Database('./database.db');

db.all('SELECT * FROM registrations ORDER BY id ASC', [], (err, rows) => {
  if (err) { console.error(err); return; }

  const esc = (v) => '"' + String(v || '').replace(/"/g, '""') + '"';

  const headers = ['ID','Reg Code','Plan','Name','Age','Gender','Mobile','City','Amount (Rs)','Payment Mobile','UTR Ref','Status','Checked In','Checked In At','Registered At'];

  const csvRows = rows.map(r => [
    r.id,
    esc(r.reg_code),
    esc(r.plan),
    esc(r.primary_name),
    r.age || '',
    esc(r.gender),
    esc(r.mobile),
    esc(r.city),
    r.amount,
    esc(r.payment_mobile),
    esc(r.utr_number),
    esc(r.status),
    r.checked_in ? 'YES' : 'NO',
    esc(r.checked_in_at),
    esc(r.created_at)
  ].join(','));

  const csv = [headers.join(','), ...csvRows].join('\n');
  fs.writeFileSync('registrations_export.csv', csv, 'utf8');
  console.log('CSV exported successfully: registrations_export.csv');
  console.log('Total records:', rows.length);
  db.close();
});
