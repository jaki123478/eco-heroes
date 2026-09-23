const path = require('path');
const { createFtpClient } = require('../config/ftp');

async function main() {
  const client = await createFtpClient();
  try {
    const local = path.resolve(__dirname, '../../server-backup/public/tour.html');
    const remote = '/public/tour.html';
    console.log(`Upload ${local} -> ${remote}`);
    await client.uploadFrom(local, remote);
    console.log('OK');
  } finally {
    client.close();
  }
}

main().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });
