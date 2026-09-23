const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  { local: '../../server-backup/public/assets/css/scan-pro.css',    remote: '/public/assets/css/scan-pro.css' },
  { local: '../../server-backup/public/assets/js/app.js',           remote: '/public/assets/js/app.js' },
  { local: '../../server-backup/src/Views/app.php',                 remote: '/src/Views/app.php' },
];

async function main() {
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(path.resolve(__dirname, u.local), u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy scan-pro completato.');
  } finally { client.close(); }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
