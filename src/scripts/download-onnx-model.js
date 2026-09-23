// =============================================================================
//  Scarica il modello ONNX MobileNetV2 (ONNX Model Zoo ufficiale, ~14 MB)
//  e lo carica sul server tramite FTP in /public/assets/models/.
// =============================================================================
const path = require('path');
const fs = require('fs');
const https = require('https');
const { createFtpClient } = require('../config/ftp');

// MobileNetV2 12, ImageNet 1000-class, input [1,3,224,224], normalizzazione standard.
// Hosted dall'organizzazione ONNX su GitHub (stabile da anni).
const MODEL_URL = 'https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx';
const LOCAL_PATH = path.resolve(__dirname, '../../server-backup/public/assets/models/garbage_classifier.onnx');
const REMOTE_PATH = '/public/assets/models/garbage_classifier.onnx';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const fileDir = path.dirname(dest);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'curl/8' } }, res => {
      // Follow redirect (GitHub usa 302 → objects.githubusercontent.com)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let downloaded = 0;
      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', chunk => {
        downloaded += chunk.length;
        if (total) {
          const pct = ((downloaded / total) * 100).toFixed(1);
          process.stdout.write(`\r📥 ${(downloaded/1024/1024).toFixed(1)} / ${(total/1024/1024).toFixed(1)} MB (${pct}%)`);
        }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(() => { process.stdout.write('\n'); resolve(); }); });
    });
    req.on('error', err => { file.close(); fs.unlinkSync(dest); reject(err); });
  });
}

(async () => {
  console.log('Modello: MobileNetV2-12 (ImageNet 1000-class, ~14 MB)');
  console.log('URL:    ', MODEL_URL);
  console.log('Locale: ', LOCAL_PATH);
  console.log('Remoto: ', REMOTE_PATH);
  console.log('');

  // 1) Download
  if (fs.existsSync(LOCAL_PATH) && fs.statSync(LOCAL_PATH).size > 1024 * 1024) {
    console.log(`✓ Già scaricato (${(fs.statSync(LOCAL_PATH).size/1024/1024).toFixed(1)} MB)`);
  } else {
    console.log('Scarico il modello da GitHub…');
    await download(MODEL_URL, LOCAL_PATH);
    const sz = fs.statSync(LOCAL_PATH).size;
    console.log(`✓ Download completato: ${(sz/1024/1024).toFixed(1)} MB`);
    if (sz < 1024 * 1024) throw new Error('Il file scaricato è troppo piccolo, probabilmente un errore');
  }

  // 2) Upload via FTP
  console.log('\nUpload via FTP…');
  const c = await createFtpClient();
  try {
    try { await c.ensureDir(path.dirname(REMOTE_PATH)); await c.cd('/'); } catch (_) {}
    c.trackProgress(info => {
      if (info.type === 'upload') {
        process.stdout.write(`\r📤 ${(info.bytes/1024/1024).toFixed(1)} MB`);
      }
    });
    await c.uploadFrom(LOCAL_PATH, REMOTE_PATH);
    c.trackProgress();
    console.log('\n✓ Upload completato.');
  } finally {
    c.close();
  }
})().catch(e => { console.error('\n❌ ERRORE:', e.message); process.exit(1); });
