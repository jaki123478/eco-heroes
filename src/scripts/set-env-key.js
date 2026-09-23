// Aggiorna .env del server FTP aggiungendo/sostituendo GEMINI_API_KEY
// e GOOGLE_TTS_API_KEY (stessa key se l'utente l'ha generata da AI Studio
// con accesso a Cloud TTS abilitato sul progetto).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createFtpClient } = require('../config/ftp');

const KEY = process.argv[2];
if (!KEY) { console.error('Usage: node set-env-key.js <API_KEY>'); process.exit(1); }

function upsert(envText, name, value) {
  const lines = envText.split(/\r?\n/);
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*#/.test(lines[i])) continue;
    const m = lines[i].match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] === name) { lines[i] = `${name}=${value}`; found = true; break; }
  }
  if (!found) {
    if (lines[lines.length - 1] !== '') lines.push('');
    lines.push(`${name}=${value}`);
  }
  return lines.join('\n');
}

async function main() {
  const tmp = path.join(os.tmpdir(), 'eco-env-' + Date.now());
  const client = await createFtpClient();
  try {
    // 1. Scarica .env attuale
    await client.downloadTo(tmp, '/.env');
    let env = fs.readFileSync(tmp, 'utf8');
    console.log(`Letto .env: ${env.length} bytes, ${env.split('\n').length} righe`);

    // 2. Aggiunge/sostituisce le chiavi
    env = upsert(env, 'GEMINI_API_KEY', KEY);
    env = upsert(env, 'GEMINI_MODEL',   'gemini-1.5-flash');
    env = upsert(env, 'GOOGLE_TTS_API_KEY', KEY);
    env = upsert(env, 'GOOGLE_TTS_VOICE_IT', 'it-IT-Neural2-C');
    env = upsert(env, 'GOOGLE_TTS_VOICE_IT_FALLBACK', 'it-IT-Neural2-A');
    fs.writeFileSync(tmp, env);

    // 3. Upload
    await client.uploadFrom(tmp, '/.env');
    console.log('OK .env aggiornato sul server');
  } finally {
    client.close();
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
