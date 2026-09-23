// Tenta di esplorare path che vanno oltre la home dell'utente FTP.
// Su molti hosting condivisi il jail è soft, quindi parent traversal o
// path assoluti possono rivelare altri siti/sandbox accessibili.

const { createFtpClient } = require('../config/ftp');

async function safeList(client, p) {
  try {
    const list = await client.list(p);
    return { ok: true, path: p, count: list.length, items: list.map(f => ({
      name: f.name, type: f.type === 2 ? 'dir' : 'file', size: f.size, mod: f.modifiedAt
    })) };
  } catch (e) {
    return { ok: false, path: p, error: e.message };
  }
}

async function safePwd(client) {
  try {
    return (await client.send('PWD')).message;
  } catch (e) { return 'ERR ' + e.message; }
}

async function main() {
  const client = await createFtpClient();
  client.ftp.verbose = false;
  const tries = [
    '/', '..', '../', '../..', '/home', '/var', '/var/www', '/srv',
    '/usr/local/web', '/data', '/sites', '/web',
    '/public_html', '/www', '/htdocs',
    // hosting-specifici per 20i/StackCP
    '/wp-content', '/wp-admin', '/sites-enabled',
    // path tipici di sotto-account StackCP
    '/sites/smartvibecoding.it',
    '/sites/smartvibecoding.it/public_html',
  ];

  console.log('== PWD iniziale ==');
  console.log(await safePwd(client));
  console.log();

  // Prova CDUP per salire
  console.log('== CDUP test (mi sposto sopra e ascolto cosa vedo) ==');
  for (let i = 0; i < 5; i++) {
    try {
      const r = await client.send('CDUP');
      const pwd = await safePwd(client);
      console.log(`  step ${i+1}: CDUP -> ${r.message}  pwd=${pwd}`);
      const list = await client.list('.');
      console.log(`    contenuto (${list.length}):`);
      list.slice(0, 30).forEach(f => console.log(`     - ${f.type === 2 ? 'DIR ' : 'FILE'} ${f.name}  (${f.size}B)`));
      if (list.length === 0) break;
    } catch (e) {
      console.log(`  step ${i+1}: CDUP error: ${e.message}`);
      break;
    }
  }
  console.log();

  // Torna a /
  try { await client.cd('/'); } catch {}

  console.log('== Path assoluti ==');
  for (const p of tries) {
    const r = await safeList(client, p);
    if (r.ok) {
      console.log(`✅ ${p}  (${r.count} elementi)`);
      r.items.slice(0, 15).forEach(it => console.log(`   - ${it.type} ${it.name}  (${it.size}B)`));
    } else {
      console.log(`❌ ${p}  ${r.error}`);
    }
  }

  client.close();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
