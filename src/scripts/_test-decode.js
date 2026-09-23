// Esegue lo stesso decode che fa il browser sul .min.js per vedere se il JS
// risultante è valido o ha errori di sintassi.
const fs = require('fs');
const path = require('path');

const MIN = path.resolve(__dirname, '../../server-backup/public/assets/js/eco-chatbot.min.js');
const content = fs.readFileSync(MIN, 'utf8');

// Estrai p, a e b dal loader
const pMatch = content.match(/var p=\[([\s\S]*?)\]\.join\(''\);/);
const aMatch = content.match(/var a="([^"]+)";/);
const bMatch = content.match(/var b="([^"]+)";/);
if (!pMatch || !aMatch || !bMatch) { console.error('Loader non parsabile'); process.exit(1); }
const p = JSON.parse("[" + pMatch[1] + "]").join('');
const a = aMatch[1];
const b = bMatch[1];

const buf = Buffer.from(p, 'base64');
const out = Buffer.alloc(buf.length);
for (let i = 0; i < buf.length; i++) {
  out[i] = buf[i] ^ b.charCodeAt(i % b.length) ^ a.charCodeAt(i % a.length);
}
const decoded = out.toString('utf8');

console.log('Decoded length:', decoded.length);
console.log('First 300 chars:', decoded.slice(0, 300));
console.log('Last 300 chars:', decoded.slice(-300));

// Verifica che sia JS sintatticamente valido
try {
  new Function(decoded);
  console.log('\n✓ Sintassi OK: new Function() ha parsato il decoded');
} catch (e) {
  console.error('\n✗ Sintassi NON valida:', e.message);
  // Mostra contesto attorno all'errore
  const m = e.message.match(/(\d+):(\d+)/);
  if (m) {
    const line = parseInt(m[1]);
    const lines = decoded.split('\n');
    for (let i = Math.max(0, line-3); i < Math.min(lines.length, line+3); i++) {
      console.error(`  L${i+1}${i+1===line?' >>':'   '}  ${lines[i].slice(0,200)}`);
    }
  }
}
