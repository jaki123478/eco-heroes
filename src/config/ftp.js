const ftp = require('basic-ftp');
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

/**
 * Crea e restituisce un client FTP già connesso.
 * Ricordati di chiamare client.close() al termine!
 */
async function createFtpClient() {
  const client = new ftp.Client();
  client.ftp.verbose = false; // Metti true per il debug

  await client.access({
    host:     process.env.FTP_HOST,
    user:     process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    port:     parseInt(process.env.FTP_PORT) || 21,
    secure:   process.env.FTP_SECURE === 'true',
  });

  return client;
}

/**
 * Carica un file sul server FTP.
 * @param {string} localPath  - Percorso locale del file
 * @param {string} remotePath - Percorso remoto di destinazione
 */
async function uploadFile(localPath, remotePath) {
  const client = await createFtpClient();
  try {
    console.log(`📤 Upload: ${localPath} → ${remotePath}`);
    await client.uploadFrom(localPath, remotePath);
    console.log(`✅ Upload completato!`);
  } finally {
    client.close();
  }
}

/**
 * Scarica un file dal server FTP.
 * @param {string} remotePath - Percorso remoto del file
 * @param {string} localPath  - Percorso locale dove salvarlo
 */
async function downloadFile(remotePath, localPath) {
  const client = await createFtpClient();
  try {
    // Crea la directory locale se non esiste
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    console.log(`📥 Download: ${remotePath} → ${localPath}`);
    await client.downloadTo(localPath, remotePath);
    console.log(`✅ Download completato!`);
  } finally {
    client.close();
  }
}

/**
 * Carica un'intera directory sul server FTP.
 * @param {string} localDir  - Directory locale
 * @param {string} remoteDir - Directory remota di destinazione
 */
async function uploadDirectory(localDir, remoteDir) {
  const client = await createFtpClient();
  try {
    console.log(`📤 Upload directory: ${localDir} → ${remoteDir}`);
    await client.uploadFromDir(localDir, remoteDir);
    console.log(`✅ Directory caricata con successo!`);
  } finally {
    client.close();
  }
}

/**
 * Lista i file in una directory remota.
 * @param {string} remoteDir - Directory remota (default: /)
 * @returns {Promise<Array>} - Lista dei file
 */
async function listFiles(remoteDir = '/') {
  const client = await createFtpClient();
  try {
    const list = await client.list(remoteDir);
    return list;
  } finally {
    client.close();
  }
}

/**
 * Testa la connessione FTP.
 */
async function testConnection() {
  try {
    const client = await createFtpClient();
    console.log('✅ FTP connesso con successo!');
    console.log(`   Host: ${process.env.FTP_HOST}`);
    console.log(`   User: ${process.env.FTP_USER}`);

    const list = await client.list('/');
    console.log(`   File nella root (${list.length} elementi):`);
    list.slice(0, 10).forEach(f => console.log(`   - ${f.type === 2 ? '📁' : '📄'} ${f.name}`));

    client.close();
  } catch (err) {
    console.error('❌ Errore connessione FTP:', err.message);
  }
}

// Se eseguito direttamente (test), prova la connessione
if (require.main === module) {
  testConnection();
}

module.exports = { createFtpClient, uploadFile, downloadFile, uploadDirectory, listFiles, testConnection };
