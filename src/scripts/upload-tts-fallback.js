const path = require('path');
const { createFtpClient } = require('../config/ftp');

async function main() {
  const client = await createFtpClient();
  try {
    const local = path.resolve(__dirname, '../../server-backup/src/Controllers/TtsController.php');
    const remote = '/src/Controllers/TtsController.php';
    console.log(`Upload ${remote}`);
    await client.uploadFrom(local, remote);
    console.log('OK');
  } finally {
    client.close();
  }
}
main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
