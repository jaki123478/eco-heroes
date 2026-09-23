const path = require('path');
const fs = require('fs');
const { createFtpClient } = require('../config/ftp');

const LOCAL_DEST = path.resolve(__dirname, '../../server-backup');

async function listRecursive(client, remoteDir, results = []) {
  let list;
  try {
    list = await client.list(remoteDir);
  } catch (e) {
    console.warn(`⚠️  Skip ${remoteDir}: ${e.message}`);
    return results;
  }
  for (const f of list) {
    const remotePath = remoteDir === '/' ? `/${f.name}` : `${remoteDir}/${f.name}`;
    if (f.type === 2) {
      // directory
      results.push({ type: 'dir', path: remotePath });
      await listRecursive(client, remotePath, results);
    } else if (f.type === 1 || f.type === 0) {
      // file or unknown
      results.push({ type: 'file', path: remotePath, size: f.size });
    } else if (f.type === 3) {
      // symlink
      results.push({ type: 'link', path: remotePath, target: f.link });
    }
  }
  return results;
}

async function main() {
  const client = await createFtpClient();
  try {
    console.log('🔍 Scansione completa del server FTP...\n');
    const remote = await listRecursive(client, '/');

    const files = remote.filter(r => r.type === 'file');
    const dirs = remote.filter(r => r.type === 'dir');
    const links = remote.filter(r => r.type === 'link');

    console.log(`📊 Trovati sul server:`);
    console.log(`   ${dirs.length} cartelle`);
    console.log(`   ${files.length} file`);
    if (links.length) console.log(`   ${links.length} symlink`);

    const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
    console.log(`   Dimensione totale: ${(totalSize / 1024 / 1024).toFixed(2)} MB\n`);

    // Confronta con locale
    const missing = [];
    for (const f of files) {
      const localPath = path.join(LOCAL_DEST, f.path.replace(/^\//, ''));
      if (!fs.existsSync(localPath)) {
        missing.push(f);
      } else {
        const localSize = fs.statSync(localPath).size;
        if (f.size && localSize !== f.size) {
          missing.push({ ...f, reason: `size mismatch (local=${localSize}, remote=${f.size})` });
        }
      }
    }

    if (missing.length === 0) {
      console.log('✅ Tutti i file remoti sono presenti in locale, nessuno mancante.');
    } else {
      console.log(`⚠️  ${missing.length} file mancanti o incompleti, riscarico...\n`);
      for (const f of missing) {
        const localPath = path.join(LOCAL_DEST, f.path.replace(/^\//, ''));
        const dir = path.dirname(localPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        try {
          await client.downloadTo(localPath, f.path);
          console.log(`   ✅ ${f.path} (${(f.size / 1024).toFixed(1)} KB)${f.reason ? ' [' + f.reason + ']' : ''}`);
        } catch (e) {
          console.error(`   ❌ ${f.path}: ${e.message}`);
        }
      }
    }

    // Salva inventario completo
    const inventory = {
      generatedAt: new Date().toISOString(),
      host: process.env.FTP_HOST,
      totalDirs: dirs.length,
      totalFiles: files.length,
      totalSizeBytes: totalSize,
      files: files.map(f => ({ path: f.path, size: f.size })),
      dirs: dirs.map(d => d.path),
      symlinks: links,
    };
    fs.writeFileSync(path.join(LOCAL_DEST, '_inventory.json'), JSON.stringify(inventory, null, 2));
    console.log(`\n📝 Inventario salvato in server-backup/_inventory.json`);
  } catch (err) {
    console.error('❌ Errore:', err.message);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

main();
