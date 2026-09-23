// Probe HTTP/HTTPS con Host: header diversi per scoprire vhost reali
const https = require('https');
const http = require('http');

const HOST_LIST = [
  'smartvibecoding.it', 'www.smartvibecoding.it',
  'ecoheroes.smartvibecoding.it', 'sustainavibe.smartvibecoding.it',
  'app.smartvibecoding.it', 'api.smartvibecoding.it',
  'admin.smartvibecoding.it', 'staging.smartvibecoding.it',
  'dev.smartvibecoding.it', 'test.smartvibecoding.it',
  'demo.smartvibecoding.it', 'blog.smartvibecoding.it',
  'shop.smartvibecoding.it', 'cdn.smartvibecoding.it',
  'webmail.smartvibecoding.it', 'mail.smartvibecoding.it',
  'sustainavibe.smartvibecoding.it', 'eco.smartvibecoding.it',
  'vibe.smartvibecoding.it', 'smart.smartvibecoding.it',
  'old.smartvibecoding.it', 'beta.smartvibecoding.it',
  'docs.smartvibecoding.it', 'help.smartvibecoding.it',
  'portal.smartvibecoding.it', 'dashboard.smartvibecoding.it',
  'panel.smartvibecoding.it',
];

function probe(host, useHttps = true) {
  return new Promise(resolve => {
    const opts = {
      hostname: host,
      port: useHttps ? 443 : 80,
      path: '/',
      method: 'GET',
      timeout: 8000,
      headers: {
        Host: host,
        'User-Agent': 'Mozilla/5.0',
      },
      rejectUnauthorized: false,
    };
    const mod = useHttps ? https : http;
    const req = mod.request(opts, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => {
        const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
        resolve({
          host, status: res.statusCode,
          server: res.headers.server || '',
          location: res.headers.location || '',
          length: body.length,
          title: titleMatch ? titleMatch[1].trim().slice(0, 80) : '',
          fingerprint: body.slice(0, 300).replace(/\s+/g, ' ').trim().slice(0, 200),
        });
      });
    });
    req.on('error', e => resolve({ host, status: 0, error: e.code || e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ host, status: 0, error: 'timeout' }); });
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('Host'.padEnd(40), 'St   Title / Server / Note');
  console.log('-'.repeat(120));
  const results = [];
  for (const h of HOST_LIST) {
    const r = await probe(h, true);
    results.push(r);
    let note = r.title || r.error || (r.fingerprint || '').slice(0, 60);
    if (r.location) note = `→ ${r.location}`;
    const srv = (r.server || '').toString().slice(0, 20).padEnd(20);
    console.log(h.padEnd(40), String(r.status).padEnd(4), `[${srv}] ${note}`);
    await sleep(800); // gentle, evita rate-limit StackCP front
  }
  console.log();
  // raggruppa per "fingerprint"
  const groups = {};
  for (const r of results) {
    if (r.status === 0) continue;
    const key = (r.title || '') + '|' + (r.length || 0);
    (groups[key] = groups[key] || []).push(r.host);
  }
  console.log('=== Gruppi (stesso titolo + lunghezza body) ===');
  Object.entries(groups).forEach(([k, hosts]) => {
    if (hosts.length > 1) console.log(`  [${k}]\n    ` + hosts.join('\n    '));
    else console.log(`  UNIQUE [${k}]\n    ${hosts[0]}`);
  });
}

main();
