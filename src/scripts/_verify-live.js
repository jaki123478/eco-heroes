const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache','Pragma':'no-cache' }}, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode, body:d}));
    }).on('error', reject);
  });
}

(async () => {
  // Bust eventuale cache CDN
  const url = `https://ecoheroes.smartvibecoding.it/assets/js/eco-chatbot.min.js?v=${Date.now()}`;
  const r = await fetch(url);
  console.log('GET', url);
  console.log('status:', r.status, 'bytes:', r.body.length);

  // Verifica che il loader live usi TextDecoder (fix UTF-8)
  const usesTextDecoder = r.body.includes('TextDecoder');
  console.log('loader UTF-8 fix presente:', usesTextDecoder ? '✓ sì' : '✗ NO — emoji saranno corrotte');

  const pMatch = r.body.match(/var p=\[([\s\S]*?)\]\.join\(''\);/);
  const aMatch = r.body.match(/var a="([^"]+)";/);
  const bMatch = r.body.match(/var b="([^"]+)";/);
  if (!pMatch || !aMatch || !bMatch) { console.error('Loader live non parsabile'); process.exit(1); }
  const p = JSON.parse("[" + pMatch[1] + "]").join('');
  const a = aMatch[1];
  const b = bMatch[1];

  const buf = Buffer.from(p, 'base64');
  const bytes = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    bytes[i] = buf[i] ^ b.charCodeAt(i % b.length) ^ a.charCodeAt(i % a.length);
  }
  const decoded = new TextDecoder('utf-8').decode(bytes);
  console.log('decoded:', decoded.length, 'chars');
  // Verifica emoji/unicode preservati: almeno 3 dei marker attesi devono esserci.
  const markers = ['può', '…', '·', '🤖'];
  const found = markers.filter(m => decoded.indexOf(m) >= 0);
  console.log(`unicode preservati: ${found.length >= 3 ? '✓ sì' : '✗ NO'} (${found.join(' ')})`);
  try {
    new Function(decoded);
    console.log('✓ LIVE chatbot decoded sintassi OK — il chatbot partirà nel browser');
  } catch (e) {
    console.error('✗ LIVE chatbot SINTASSI ROTTA:', e.message);
    process.exit(1);
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
