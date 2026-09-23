// Scarica la lista standard ImageNet 1000 class names da PyTorch hub e la
// salva come JSON, poi la carica via FTP sul server.
const path = require('path');
const fs = require('fs');
const https = require('https');
const { createFtpClient } = require('../config/ftp');

const URL = 'https://raw.githubusercontent.com/pytorch/hub/master/imagenet_classes.txt';
const LOCAL_JSON = path.resolve(__dirname, '../../server-backup/public/assets/data/imagenet-classes.json');
const REMOTE_JSON = '/public/assets/data/imagenet-classes.json';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'curl/8' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchText(res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
  });
}

(async () => {
  console.log('Scarico ImageNet class names…');
  const txt = await fetchText(URL);
  const classes = txt.split('\n').map(l => l.trim()).filter(Boolean);
  console.log(`Trovate ${classes.length} classi (atteso 1000)`);
  if (classes.length !== 1000) throw new Error('Numero classi inatteso');

  fs.mkdirSync(path.dirname(LOCAL_JSON), { recursive: true });
  fs.writeFileSync(LOCAL_JSON, JSON.stringify(classes));
  console.log('Salvato:', LOCAL_JSON, '(', fs.statSync(LOCAL_JSON).size, 'byte)');

  console.log('\nUpload via FTP…');
  const c = await createFtpClient();
  try {
    try { await c.ensureDir(path.dirname(REMOTE_JSON)); await c.cd('/'); } catch (_) {}
    await c.uploadFrom(LOCAL_JSON, REMOTE_JSON);
    console.log('OK →', REMOTE_JSON);
  } finally { c.close(); }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
