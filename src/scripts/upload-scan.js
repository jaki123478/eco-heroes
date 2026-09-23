const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  { local: '../../server-backup/src/Controllers/ScanAiController.php', remote: '/src/Controllers/ScanAiController.php' },
  { local: '../../server-backup/src/routes.php',                       remote: '/src/routes.php' },
  { local: '../../server-backup/public/assets/js/eco-scan.js',         remote: '/public/assets/js/eco-scan.js' },
  { local: '../../server-backup/public/assets/js/scan-live.js',        remote: '/public/assets/js/scan-live.js' },
  { local: '../../server-backup/public/assets/js/eye-control-mp.js',   remote: '/public/assets/js/eye-control-mp.js' },
  { local: '../../server-backup/src/Views/app.php',                    remote: '/src/Views/app.php' },
];

async function main() {
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(path.resolve(__dirname, u.local), u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy completato.');
  } finally { client.close(); }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
