const { createFtpClient } = require('../config/ftp');

async function main() {
  const client = await createFtpClient();
  try {
    console.log('🔍 Elenco della cartella /sustainavibe sul server FTP...');
    const list = await client.list('/sustainavibe');
    console.log(`📄 Trovati ${list.length} elementi in /sustainavibe:`);
    list.forEach(f => {
      console.log(`   - ${f.type === 2 ? '📁' : '📄'} ${f.name} (${f.size || 0} bytes)`);
    });
  } catch (err) {
    console.error('❌ Errore durante la scansione di /sustainavibe:', err.message);
  } finally {
    client.close();
  }
}

main();
