const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  {
    local: path.resolve(__dirname, '../../server-backup/src/Controllers/TtsController.php'),
    remote: '/src/Controllers/TtsController.php',
  },
  {
    local: path.resolve(__dirname, '../../server-backup/src/routes.php'),
    remote: '/src/routes.php',
  },
  {
    local: path.resolve(__dirname, '../../server-backup/src/Views/app.php'),
    remote: '/src/Views/app.php',
  },
];

async function main() {
  const client = await createFtpClient();
  try {
    // Assicura la directory di cache
    try { await client.ensureDir('/storage/tts'); console.log('Cache dir OK'); }
    catch (e) { console.warn('cache dir:', e.message); }
    await client.cd('/');

    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(u.local, u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy completato.');
  } finally {
    client.close();
  }
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
