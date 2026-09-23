const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (debug-probe)' }}, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, length: data.length }));
    }).on('error', reject);
  });
}

(async () => {
  const urls = [
    'https://ecoheroes.smartvibecoding.it/assets/js/eco-chatbot.min.js?v=1779820827',
    'https://ecoheroes.smartvibecoding.it/assets/css/chatbot.css?v=1779795186',
    'https://ecoheroes.smartvibecoding.it/assets/js/eco-chatbot.js',
  ];
  for (const u of urls) {
    const r = await fetch(u);
    const head = r.body.slice(0, 200).replace(/\n/g, '\\n');
    console.log(`\n${u}\n  status=${r.status}  bytes=${r.length}  ctype=${r.headers['content-type']||'?'}`);
    console.log(`  preview: ${head}`);
  }
})().catch(e => console.error('ERR', e.message));
