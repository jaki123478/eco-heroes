const https = require('https');

const url = 'https://ecoheroes.smartvibecoding.it/';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (debug-probe)' }}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('---');
    const lines = data.split('\n');
    lines.forEach((l, i) => {
      if (l.includes('eco-chatbot') || l.includes('chatbot.css') || l.includes('service-worker') || l.includes('<title')) {
        console.log(`L${i+1}: ${l.trim()}`);
      }
    });
  });
}).on('error', e => console.error('ERR', e.message));
