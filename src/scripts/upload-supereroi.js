const path = require('path');
const { createFtpClient } = require('../config/ftp');
async function main() {
    const client = await createFtpClient();
    try {
        await client.uploadFrom(path.resolve(__dirname, '../../server-backup/public/games/supereroi.html'), '/public/games/supereroi.html');
        console.log('Uploaded supereroi.html');
    } finally {
        client.close();
    }
}
main().catch(console.error);
