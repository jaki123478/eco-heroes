const path = require('path');
const fs = require('fs');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  { local: '../../server-backup/src/Cron/backup-db.php',   remote: '/src/Cron/backup-db.php' },
  { local: '../../server-backup/src/Cron/retention.php',   remote: '/src/Cron/retention.php' },
  { local: '../../server-backup/public/.htaccess',         remote: '/public/.htaccess' },
];

// Immagini duplicate (identiche al -fixed) e non referenziate da alcun template/JS
const DELETIONS = [
  '/public/assets/img/icon-192x192.png',
  '/public/assets/img/screen-narrow.png',
  '/public/assets/img/screen-wide.png',
];

async function main() {
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(path.resolve(__dirname, u.local), u.remote);
      console.log('    OK');
    }
    for (const r of DELETIONS) {
      try {
        await client.remove(r);
        console.log(`Delete ${r}    OK`);
      } catch (e) {
        console.warn(`Delete ${r}    SKIP (${e.message})`);
      }
    }
    // Cancella anche localmente
    for (const r of DELETIONS) {
      const local = path.resolve(__dirname, '../../server-backup' + r);
      try { fs.unlinkSync(local); console.log(`Local rm ${r}  OK`); }
      catch (_) { /* ignore */ }
    }
    console.log('\nCleanup + cron deploy completato.');
  } finally { client.close(); }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
