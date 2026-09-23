const path = require('path');
const fs = require('fs');
const { createFtpClient } = require('../config/ftp');

const LOCAL_DEST = path.resolve(__dirname, '../../server-backup');
const REMOTE_ROOT = '/';

async function main() {
  if (!fs.existsSync(LOCAL_DEST)) fs.mkdirSync(LOCAL_DEST, { recursive: true });

  const client = await createFtpClient();
  client.trackProgress(info => {
    if (info.type === 'download') {
      process.stdout.write(`\r📥 ${info.name}  ${(info.bytes / 1024).toFixed(1)} KB`);
    }
  });

  try {
    console.log(`📂 Destinazione locale: ${LOCAL_DEST}`);
    console.log(`🌐 Origine remota: ${REMOTE_ROOT}`);
    console.log('⏳ Scaricamento ricorsivo in corso...\n');

    const start = Date.now();
    await client.downloadToDir(LOCAL_DEST, REMOTE_ROOT);
    const seconds = ((Date.now() - start) / 1000).toFixed(1);

    client.trackProgress();
    console.log(`\n\n✅ Download completato in ${seconds}s`);
    console.log(`   Cartella locale: ${LOCAL_DEST}`);
  } catch (err) {
    console.error('\n❌ Errore durante il download:', err.message);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

main();
