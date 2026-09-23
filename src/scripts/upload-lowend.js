const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  { local: '../../server-backup/public/assets/js/device-perf.js',      remote: '/public/assets/js/device-perf.js' },
  { local: '../../server-backup/public/assets/js/eye-control-mp.js',   remote: '/public/assets/js/eye-control-mp.js' },
  { local: '../../server-backup/public/assets/js/eco-scan.js',         remote: '/public/assets/js/eco-scan.js' },
  { local: '../../server-backup/public/assets/css/mobile-fixes.css',   remote: '/public/assets/css/mobile-fixes.css' },
  { local: '../../server-backup/src/Views/app.php',                    remote: '/src/Views/app.php' },
  { local: '../../server-backup/src/Views/landing.php',                remote: '/src/Views/landing.php' },
];

async function main() {
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(path.resolve(__dirname, u.local), u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy low-end mode completato.');
  } finally { client.close(); }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
