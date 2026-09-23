// Diagnostica admin online: legge .env del server, query MySQL, stampa stato.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'server-backup', '.env') });
const mysql = require('mysql2/promise');

(async () => {
  console.log('DB:', process.env.DB_HOST + ':' + (process.env.DB_PORT||'3306') + '/' + process.env.DB_NAME);
  const c = await mysql.createConnection({
    host: process.env.DB_HOST_EXT || 'mysql.gb.stackcp.com',
    port: parseInt(process.env.DB_PORT_EXT || '43018'),
    user: process.env.DB_USER,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  // 1) Tutti gli admin
  const [admins] = await c.execute(
    "SELECT id, username, email, role_level, last_login_at, deleted_at " +
    "FROM users WHERE role_level >= 3 ORDER BY role_level DESC, username"
  );
  console.log('\n=== Admin nel DB (role>=3) ===');
  if (!admins.length) { console.log('NESSUNO!'); }
  admins.forEach(a => {
    const ll = a.last_login_at;
    const minsAgo = ll ? Math.round((Date.now() - new Date(ll).getTime()) / 60000) : null;
    console.log(
      '#' + a.id, '|',
      (a.username||'').padEnd(12),
      '| role=' + a.role_level,
      '| last_login=' + (ll ? new Date(ll).toLocaleString('it-IT') : 'MAI'),
      ll ? '(' + minsAgo + ' min fa)' : '',
      a.deleted_at ? '[DELETED]' : '',
      '| email=' + (a.email||'-')
    );
  });
  // 2) Online con finestra 60 min (come fa il chatbot)
  const [online] = await c.execute(
    "SELECT username, role_level, last_login_at FROM users " +
    "WHERE role_level >= 3 AND deleted_at IS NULL " +
    "AND last_login_at > (NOW() - INTERVAL 60 MINUTE) " +
    "ORDER BY last_login_at DESC"
  );
  console.log('\n=== ONLINE (finestra 60 min) ===');
  if (!online.length) console.log('NESSUNO è considerato online (last_login_at > 60 min fa).');
  online.forEach(a => console.log('🟢', a.username, '(' + (a.role_level>=4?'SuperAdmin':'Admin') + ')'));
  // 3) Sanity NOW() server
  const [now] = await c.execute('SELECT NOW() AS nw');
  console.log('\nServer NOW():', new Date(now[0].nw).toLocaleString('it-IT'));
  console.log('PC locale:    ', new Date().toLocaleString('it-IT'));
  await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
