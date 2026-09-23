// Confronto remoto vs locale: per ogni file remoto verifica esistenza + dimensione locale.
// Per file di testo "piccoli" (< 64KB) scarica e calcola hash sha256.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createFtpClient } = require('../config/ftp');

const LOCAL_ROOT = path.resolve(__dirname, '../../server-backup');
const HASH_MAX = 64 * 1024;

async function listRecursive(client, dir, out = []) {
  const list = await client.list(dir);
  for (const f of list) {
    const p = dir === '/' ? `/${f.name}` : `${dir}/${f.name}`;
    if (f.type === 2) {
      await listRecursive(client, p, out);
    } else if (f.type === 1) {
      out.push({ path: p, size: f.size, modifiedAt: f.modifiedAt });
    }
  }
  return out;
}

function localPath(remote) {
  return path.join(LOCAL_ROOT, remote.replace(/^\//, ''));
}

function sha256File(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

async function downloadToBuffer(client, remote) {
  const tmp = path.join(LOCAL_ROOT, '.__tmp_diff');
  await client.downloadTo(tmp, remote);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return buf;
}

async function main() {
  const client = await createFtpClient();
  try {
    console.log('🔍 Listing remoto...');
    const remote = await listRecursive(client, '/');
    console.log(`   ${remote.length} file remoti\n`);

    const missing = [], extra = [], sizeDiff = [], hashDiff = [], ok = [];
    const remoteSet = new Set(remote.map(r => r.path));

    // Files locali che NON esistono sul server (extra)
    function walkLocal(dir, base = '') {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith('.__tmp_diff')) continue;
        if (name === '_inventory.json') continue;
        const full = path.join(dir, name);
        const rel = (base + '/' + name).replace(/\\/g, '/');
        const st = fs.statSync(full);
        if (st.isDirectory()) walkLocal(full, rel);
        else if (!remoteSet.has(rel)) extra.push({ path: rel, size: st.size });
      }
    }
    walkLocal(LOCAL_ROOT);

    for (const r of remote) {
      const lp = localPath(r.path);
      if (!fs.existsSync(lp)) { missing.push(r); continue; }
      const lsz = fs.statSync(lp).size;
      if (r.size != null && lsz !== r.size) {
        sizeDiff.push({ path: r.path, remoteSize: r.size, localSize: lsz });
        continue;
      }
      // hash per i piccoli
      if (r.size <= HASH_MAX) {
        const remoteBuf = await downloadToBuffer(client, r.path);
        const localHash = sha256File(lp);
        const remoteHash = crypto.createHash('sha256').update(remoteBuf).digest('hex');
        if (localHash !== remoteHash) {
          hashDiff.push({ path: r.path, size: r.size, localHash, remoteHash });
          continue;
        }
      }
      ok.push(r.path);
    }

    console.log('=== REPORT DIFF ===');
    console.log(`✅ Uguali: ${ok.length}`);
    console.log(`❓ Solo remoti (mancanti in locale): ${missing.length}`);
    missing.forEach(f => console.log(`   - ${f.path}  (${f.size}B)`));
    console.log(`📁 Solo locali (extra rispetto al server): ${extra.length}`);
    extra.forEach(f => console.log(`   - ${f.path}  (${f.size}B)`));
    console.log(`⚠️  Dimensione diversa: ${sizeDiff.length}`);
    sizeDiff.forEach(f => console.log(`   - ${f.path}  remote=${f.remoteSize}  local=${f.localSize}`));
    console.log(`🔄 Hash diverso (stessa dimensione, contenuto diverso): ${hashDiff.length}`);
    hashDiff.forEach(f => console.log(`   - ${f.path}  (${f.size}B)`));

    const report = { generatedAt: new Date().toISOString(), totals: {
      remote: remote.length, ok: ok.length, missing: missing.length,
      extra: extra.length, sizeDiff: sizeDiff.length, hashDiff: hashDiff.length
    }, missing, extra, sizeDiff, hashDiff };
    const reportPath = path.join(LOCAL_ROOT, '_diff_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📝 Report completo: ${reportPath}`);
  } finally {
    client.close();
  }
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
