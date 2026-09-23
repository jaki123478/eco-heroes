const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  { local: '../../server-backup/sustainavibe/src/API/TeamTaskController.php',   remote: '/sustainavibe/src/API/TeamTaskController.php' },
  { local: '../../server-backup/sustainavibe/src/API/TeamController.php',       remote: '/sustainavibe/src/API/TeamController.php' },
  { local: '../../server-backup/sustainavibe/public/index.php',                 remote: '/sustainavibe/public/index.php' },
  { local: '../../server-backup/sustainavibe/public/game-engine/play.js',       remote: '/sustainavibe/public/game-engine/play.js' },
  { local: '../../server-backup/sustainavibe/public/assets/css/game.css',       remote: '/sustainavibe/public/assets/css/game.css' },
];

async function main() {
  const c = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await c.uploadFrom(path.resolve(__dirname, u.local), u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy team-tasks completato.');
  } finally { c.close(); }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
