const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  { local: '../../server-backup/src/Utils/Security.php', remote: '/src/Utils/Security.php' },
  { local: '../../server-backup/src/Controllers/ChatbotController.php', remote: '/src/Controllers/ChatbotController.php' },
  { local: '../../server-backup/src/Controllers/TtsController.php', remote: '/src/Controllers/TtsController.php' },
  { local: '../../server-backup/src/routes.php', remote: '/src/routes.php' },
  { local: '../../server-backup/public/assets/js/eco-chatbot.js', remote: '/public/assets/js/eco-chatbot.js' }
];

async function main() {
  console.log('📡 Avvio deploy file Chatbot via FTP...\n');
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      const local = path.resolve(__dirname, u.local);
      console.log(`Caricamento: ${u.remote}`);
      await client.uploadFrom(local, u.remote);
      console.log('    [OK]');
    }
    console.log('\n✅ Deploy completato con successo!');
  } catch (error) {
    console.error('❌ Errore durante il deploy:', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
