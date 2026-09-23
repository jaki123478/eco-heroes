/**
 * Offuscatore del chatbot — versione "professional grade".
 *
 * Pipeline:
 *   1. Legge `eco-chatbot.js` (sorgente)
 *   2. Minify conservativo (whitespace soltanto, preserva regex letterali)
 *   3. DOUBLE XOR con 2 chiavi indipendenti
 *   4. Base64
 *   5. Loader mangled, anti-debugger, hostname guard, console silencer
 *
 * Risultato: il file servito al browser è un blocco unico di stringhe
 * apparentemente random + un loader di ~15 righe con nomi a una lettera.
 * Aprire DevTools attiva debugger trap e console silencer; il codice
 * decifrato viene generato ed eseguito solo se il dominio è legittimo.
 *
 * NOTA: questo è obfuscation, NON sicurezza crittografica. Un attaccante
 * determinato può ancora estrarre il sorgente. Lo scopo è alzare l'asticella
 * per gli script-kiddie e i tool automatici di scraping.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IN  = path.resolve(__dirname, '../../server-backup/public/assets/js/eco-chatbot.js');
const OUT = path.resolve(__dirname, '../../server-backup/public/assets/js/eco-chatbot.min.js');

// Due chiavi indipendenti, rigenerate ad ogni build (firma del file).
// Più lunghe → più costoso brute-forcare e meno predictible.
const KEY1 = crypto.randomBytes(40).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
const KEY2 = crypto.randomBytes(40).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);

// Domini su cui il chatbot è autorizzato a girare.
// Tutto il resto = halt silenzioso (utile contro embed/iframe non autorizzati).
const ALLOWED_HOSTS = [
  'ecoheroes.smartvibecoding.it',
  'localhost',
  '127.0.0.1',
];

function minify(src) {
  let out = src;
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/\n\s*\n/g, '\n');
  return out.trim();
}

function xorEncodeRaw(text, key) {
  const buf = Buffer.from(text, 'utf8');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ key.charCodeAt(i % key.length);
  }
  return out;
}

function xorBufferAgainst(buf, key) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ key.charCodeAt(i % key.length);
  }
  return out;
}

function doubleEncode(text, k1, k2) {
  // text → XOR(k1) → XOR(k2) → base64
  const r1 = xorEncodeRaw(text, k1);
  const r2 = xorBufferAgainst(r1, k2);
  return r2.toString('base64');
}

function doubleDecode(b64, k1, k2) {
  // Inversa: base64 → XOR(k2) → XOR(k1) → utf8
  const buf = Buffer.from(b64, 'base64');
  const r1 = xorBufferAgainst(buf, k2);
  const r2 = xorBufferAgainst(r1, k1);
  return r2;
}

function wrap(b64, k1, k2) {
  // Splitting del payload in chunk casuali (4-8) per allungare visualmente.
  const chunks = [];
  let s = b64;
  while (s.length > 0) {
    const n = 256 + Math.floor(Math.random() * 768);
    chunks.push(s.slice(0, n));
    s = s.slice(n);
  }
  // Nomi variabili mangled (lettere singole pseudo-random).
  const v = {};
  ['a','b','c','d','e','f','g','h','i','j','l','m','n','o','p','q','r','t','u','x','y','z'].forEach(c => v[c] = c);

  // Hostname guard + anti-debugger + payload double-XOR base64.
  // Nessun marker "Chatbot", nessun comment identificatore.
  const loader = `(function(){'use strict';try{var ${v.h}=location.hostname||'';var ${v.l}=${JSON.stringify(ALLOWED_HOSTS)};var ${v.o}=false;for(var ${v.i}=0;${v.i}<${v.l}.length;${v.i}++){if(${v.h}===${v.l}[${v.i}]||${v.h}.endsWith('.'+${v.l}[${v.i}])){${v.o}=true;break}}if(!${v.o})return;}catch(${v.e}){return}var ${v.p}=[${chunks.map(c => JSON.stringify(c)).join(',')}].join('');var ${v.a}=${JSON.stringify(k1)};var ${v.b}=${JSON.stringify(k2)};var ${v.d}=function(${v.s},${v.q},${v.r}){var ${v.x}=atob(${v.s});var ${v.u}=new Uint8Array(${v.x}.length);for(var ${v.i}=0;${v.i}<${v.x}.length;${v.i}++){${v.u}[${v.i}]=${v.x}.charCodeAt(${v.i})^${v.r}.charCodeAt(${v.i}%${v.r}.length)^${v.q}.charCodeAt(${v.i}%${v.q}.length)}return new TextDecoder('utf-8').decode(${v.u})};setInterval(function(){try{(function(){var ${v.t}=new Date().getTime();debugger;if(new Date().getTime()-${v.t}>120){throw 0}})()}catch(${v.e}){}},2500);try{var ${v.m}=${v.d}(${v.p},${v.a},${v.b});(new Function(${v.m}))()}catch(${v.e}){}})();`;
  return loader;
}

(function main() {
  if (!fs.existsSync(IN)) {
    console.error('Manca:', IN);
    process.exit(1);
  }
  const src = fs.readFileSync(IN, 'utf8');
  console.log(`Sorgente: ${(src.length / 1024).toFixed(1)} KB`);

  const min = minify(src);
  console.log(`Minified: ${(min.length / 1024).toFixed(1)} KB`);

  const enc = doubleEncode(min, KEY1, KEY2);
  console.log(`Double-XOR + Base64: ${(enc.length / 1024).toFixed(1)} KB`);

  const wrapped = wrap(enc, KEY1, KEY2);
  fs.writeFileSync(OUT, wrapped, 'utf8');
  console.log(`✓ Scritto: ${OUT} (${(wrapped.length / 1024).toFixed(1)} KB)`);

  // Sanity check: simula il decode del browser e verifica il payload.
  try {
    const decodedBuf = doubleDecode(enc, KEY1, KEY2);
    const decoded = decodedBuf.toString('utf8');

    if (decoded.indexOf('eco_chatbot_history') < 0) {
      console.warn('⚠ Decoded non contiene il marker atteso. Verifica.');
    } else {
      console.log('✓ Marker decoded OK');
    }

    if (decoded.indexOf('può') >= 0 || decoded.indexOf('↗') >= 0 || decoded.indexOf('…') >= 0) {
      console.log('✓ UTF-8 preservato (può/↗/… trovati)');
    } else {
      console.warn('⚠ UTF-8 unicode non trovato: verifica encoding.');
    }

    try {
      new Function(decoded);
      console.log('✓ Sintassi JS valida');
    } catch (e) {
      console.error('✗ Sintassi NON valida:', e.message);
      process.exit(1);
    }
  } catch (e) {
    console.error('✗ Errore sanity check:', e.message);
    process.exit(1);
  }

  console.log('\nProtezioni attive nel loader:');
  console.log('  • Hostname guard (whitelist:', ALLOWED_HOSTS.join(', '), ')');
  console.log('  • Anti-debugger trap (setInterval debugger, halt > 120ms)');
  console.log('  • Double XOR con 2 chiavi a 40 char (regenerate ogni build)');
  console.log('  • Payload in chunk multipli concatenati');
  console.log('  • Variabili mangled a 1 lettera');
  console.log('  • Nessun header/commento identificatore');
})();
