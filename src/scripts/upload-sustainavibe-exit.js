const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  { local: path.resolve(__dirname, '../../server-backup/sustainavibe/public/views/play.php'),
    remote: '/sustainavibe/public/views/play.php' },
  { local: path.resolve(__dirname, '../../server-backup/sustainavibe/public/game-engine/play.js'),
    remote: '/sustainavibe/public/game-engine/play.js' },
  { local: path.resolve(__dirname, '../../server-backup/sustainavibe/public/index.php'),
    remote: '/sustainavibe/public/index.php' },
];

async function main() {
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(u.local, u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy completato.');
  } finally { client.close(); }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
