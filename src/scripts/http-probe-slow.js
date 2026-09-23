// Probe HTTP super lento (6s tra richieste) per non triggerare il QoS shared hosting.
const https = require('https');

const HOSTS = [
  'smartvibecoding.it', 'www.smartvibecoding.it',
  'ecoheroes.smartvibecoding.it', 'sustainavibe.smartvibecoding.it',
  'app.smartvibecoding.it', 'api.smartvibecoding.it',
  'admin.smartvibecoding.it', 'blog.smartvibecoding.it',
  'shop.smartvibecoding.it', 'webmail.smartvibecoding.it',
  'cpanel.smartvibecoding.it', 'docs.smartvibecoding.it',
  'staging.smartvibecoding.it', 'dev.smartvibecoding.it',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function probe(host) {
  return new Promise(resolve => {
    const req = https.request({
      hostname: host, port: 443, path: '/', method: 'GET',
      timeout: 15000, rejectUnauthorized: false,
      headers: { Host: host, 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => {
        const title = (body.match(/<title[^>]*>([^<]+)<\/title>/i) || [, ''])[1].trim().slice(0, 90);
        resolve({
          host, status: res.statusCode,
          server: res.headers.server || '',
          location: res.headers.location || '',
          length: body.length,
          title,
          h1: (body.match(/<h1[^>]*>([^<]+)<\/h1>/i) || [, ''])[1].trim().slice(0, 80),
        });
      });
    });
    req.on('error', e => resolve({ host, status: 0, error: e.code || e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ host, status: 0, error: 'timeout' }); });
    req.end();
  });
}

async function main() {
  console.log(`Probing ${HOSTS.length} host @ 6s interval (~${HOSTS.length * 6}s totali)...\n`);
  console.log('Host'.padEnd(38), 'St ', 'Title / Note');
  console.log('-'.repeat(110));
  const out = [];
  for (let i = 0; i < HOSTS.length; i++) {
    const h = HOSTS[i];
    const r = await probe(h);
    out.push(r);
    let note = r.title || r.location ? `→ ${r.location}` : (r.h1 || r.error || `${r.length}B`);
    if (r.title) note = r.title;
    else if (r.location) note = `→ ${r.location}`;
    else note = r.h1 || r.error || `${r.length}B`;
    console.log(h.padEnd(38), String(r.status).padEnd(3), note);
    if (i < HOSTS.length - 1) await sleep(6000);
  }
  console.log('\n=== Sintesi ===');
  const live = out.filter(r => r.status === 200);
  const redirects = out.filter(r => r.status >= 300 && r.status < 400);
  const errors = out.filter(r => r.status >= 500 || r.status === 0);
  const notfound = out.filter(r => r.status === 404 || r.status === 403);
  console.log(`Live (200): ${live.length}`);
  console.log(`Redirect (3xx): ${redirects.length}`);
  console.log(`Not found / forbidden: ${notfound.length}`);
  console.log(`Errori / 5xx: ${errors.length}`);
  console.log('\n=== Subdomain REALI (200 con titolo) ===');
  const groups = {};
  live.forEach(r => {
    const k = r.title || `len:${r.length}`;
    (groups[k] = groups[k] || []).push(r.host);
  });
  Object.entries(groups).forEach(([title, hosts]) => {
    console.log(`  "${title}"`);
    hosts.forEach(h => console.log(`     → ${h}`));
  });
}

main();
