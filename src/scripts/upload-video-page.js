const path = require('path');
const { createFtpClient } = require('../config/ftp');

const LOCAL_FILE = path.resolve(__dirname, '../../server-backup/src/Views/video.php');
const REMOTE_PATH = '/src/Views/video.php';

async function main() {
  console.log(`🚀 Connessione all'FTP per il deploy di video.php...`);
  const client = await createFtpClient();
  try {
    console.log(`📤 Upload di: ${LOCAL_FILE}`);
    console.log(`   Destinazione remota: ${REMOTE_PATH}`);
    
    // Esegue l'upload sovrascrivendo il file esistente sul server
    await client.uploadFrom(LOCAL_FILE, REMOTE_PATH);
    
    console.log('✅ Deploy completato con successo su ftp.smartvibecoding.it!');
  } catch (err) {
    console.error('❌ Errore durante il deploy:', err.message);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

main();
