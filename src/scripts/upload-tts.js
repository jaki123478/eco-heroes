const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  {
    local: path.resolve(__dirname, '../../server-backup/public/assets/js/app.js'),
    remote: '/public/assets/js/app.js',
  },
  {
    local: path.resolve(__dirname, '../../server-backup/src/Views/app.php'),
    remote: '/src/Views/app.php',
  },
];

async function main() {
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      console.log(`Upload ${u.local}`);
      console.log(`    -> ${u.remote}`);
      await client.uploadFrom(u.local, u.remote);
      console.log('    OK');
    }
    console.log('\nTutto caricato.');
  } finally {
    client.close();
  }
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
