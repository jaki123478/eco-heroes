const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  { local: '../../server-backup/src/Core/Middleware.php', remote: '/src/Core/Middleware.php' },
  { local: '../../server-backup/src/Controllers/AuthController.php', remote: '/src/Controllers/AuthController.php' },
  { local: '../../server-backup/public/assets/js/eco-map.js', remote: '/public/assets/js/eco-map.js' },
];

async function main() {
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(path.resolve(__dirname, u.local), u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy show_limits completato!');
  } finally {
    client.close();
  }
}

main().catch(e => {
  console.error('ERR:', e.message);
  process.exit(1);
});
