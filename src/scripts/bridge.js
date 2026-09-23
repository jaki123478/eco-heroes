// Upload a single file via FTP, fetch a URL, optionally download the resulting file,
// then delete the uploaded script. Used as a one-shot bridge to run server-side PHP.
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { createFtpClient } = require('../config/ftp');

async function fetchText(url, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });
}

async function main() {
  const args = require('minimist-lite')
    ? require('minimist-lite')(process.argv.slice(2))
    : (() => {
        const a = {};
        process.argv.slice(2).forEach(s => {
          const m = s.match(/^--([^=]+)=(.+)$/);
          if (m) a[m[1]] = m[2];
        });
        return a;
      })();

  const local = args.upload;
  const remote = args.remote;
  const callUrl = args.call;
  const download = args.download;
  const saveAs = args['save-as'] || (download ? path.basename(download) : null);
  const cleanup = (args.cleanup || '').split(',').filter(Boolean);

  if (!local || !remote) {
    console.error('Usage: --upload=<localFile> --remote=<remotePath> [--call=<url>] [--download=<remotePath>] [--save-as=<localFile>] [--cleanup=<remoteA,remoteB>]');
    process.exit(1);
  }

  const client = await createFtpClient();
  try {
    console.log(`📤 Upload ${local} → ${remote}`);
    // Ensure remote dir exists
    const remoteDir = path.posix.dirname(remote);
    if (remoteDir && remoteDir !== '/' && remoteDir !== '.') {
      try { await client.ensureDir(remoteDir); } catch (e) { /* ignore */ }
      await client.cd('/');
    }
    await client.uploadFrom(local, remote);
    console.log('   OK');

    if (callUrl) {
      console.log(`🌐 GET ${callUrl}`);
      const { status, body } = await fetchText(callUrl);
      console.log(`   HTTP ${status}`);
      console.log('   body:', body.slice(0, 800));
    }

    if (download) {
      const out = path.resolve(saveAs);
      console.log(`📥 Download ${download} → ${out}`);
      const dir = path.dirname(out);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await client.downloadTo(out, download);
      console.log(`   OK (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
    }

    for (const r of cleanup) {
      try {
        await client.remove(r);
        console.log(`🗑️  Removed ${r}`);
      } catch (e) {
        console.warn(`   ⚠️  Cannot remove ${r}: ${e.message}`);
      }
    }
  } finally {
    client.close();
  }
}

main().catch(err => { console.error('ERR:', err.message); process.exit(1); });
