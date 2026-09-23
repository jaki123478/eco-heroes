const https = require('https');

const body = JSON.stringify({
  history: [{ role: 'user', text: 'Cosa ne pensi della partita di stasera?' }],
  systemPrompt: 'Sei EcoHeroes, assistente ecologico.',
});

const opts = {
  hostname: 'ecoheroes.smartvibecoding.it',
  path: '/api/v1/chat-proxy',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'Mozilla/5.0 (debug-probe)',
  },
};

const req = https.request(opts, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
    console.log('BODY:', d.slice(0, 1000));
  });
});
req.on('error', e => console.error('ERR full:', e));
req.write(body);
req.end();
