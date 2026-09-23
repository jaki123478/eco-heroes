// Deploy KB Eco-Scan: carica tutti i file relativi alla nuova feature.
const path = require('path');
const fs = require('fs');
const { createFtpClient } = require('../config/ftp');

const FILES = [
  ['server-backup/src/Controllers/ScanKbController.php', '/src/Controllers/ScanKbController.php'],
  ['server-backup/src/Controllers/WebController.php',     '/src/Controllers/WebController.php'],
  ['server-backup/src/routes.php',                        '/src/routes.php'],
  ['server-backup/src/Views/admin-scan-kb.php',           '/src/Views/admin-scan-kb.php'],
  ['server-backup/src/Views/app.php',                     '/src/Views/app.php'],
  ['server-backup/public/assets/js/eco-scan-ml.js',       '/public/assets/js/eco-scan-ml.js'],
  ['server-backup/public/assets/js/eco-scan.js',          '/public/assets/js/eco-scan.js'],
  ['server-backup/public/assets/js/admin-scan-kb.js',     '/public/assets/js/admin-scan-kb.js'],
  ['server-backup/public/assets/data/seed-wikimedia.json','/public/assets/data/seed-wikimedia.json'],
];

(async () => {
  const c = await createFtpClient();
  try {
    // Assicura /public/assets/data esista
    try { await c.ensureDir('/public/assets/data'); await c.cd('/'); }
    catch (e) { /* ignore */ }

    for (const [l, r] of FILES) {
      const full = path.resolve(__dirname, '..', '..', l);
      if (!fs.existsSync(full)) { console.log('SKIP (missing):', full); continue; }
      const sz = fs.statSync(full).size;
      console.log('Upload', r, '(', (sz/1024).toFixed(1), 'KB)');
      await c.uploadFrom(full, r);
      console.log('  OK');
    }
    console.log('\nDeploy completato.');
  } finally {
    c.close();
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
