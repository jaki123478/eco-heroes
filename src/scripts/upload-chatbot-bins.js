const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  {
    local: path.resolve(__dirname, '../../server-backup/src/Utils/WasteOperators.php'),
    remote: '/src/Utils/WasteOperators.php',
  },
  {
    local: path.resolve(__dirname, '../../server-backup/src/Controllers/ChatbotController.php'),
    remote: '/src/Controllers/ChatbotController.php',
  },
];

async function main() {
  const client = await createFtpClient();
  try {
    await client.cd('/');
    for (const u of UPLOADS) {
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(u.local, u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy chatbot bin colors completato.');
  } finally {
    client.close();
  }
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
