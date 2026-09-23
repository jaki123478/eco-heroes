// Test la stessa query usata dall'endpoint /admin/online (lato MySQL puro).
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'server-backup', '.env') });
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST_EXT || 'mysql.gb.stackcp.com',
    port: parseInt(process.env.DB_PORT_EXT || '43018'),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  // FIX: PHP imposta SET time_zone='+00:00' (UTC) sulla connessione.
  // Il mio Node script senza questo settaggio vedeva NOW() in system local
  // (CET = UTC+1) mentre last_login_at è salvato come UTC → offset 60 min
  // costante. Allineamo la sessione a UTC come fa PHP.
  await c.execute("SET time_zone = '+00:00'");

  // Session info
  const [tz] = await c.execute("SELECT NOW() AS nw, UTC_TIMESTAMP() AS utc_now, @@session.time_zone AS sess_tz, @@global.time_zone AS glob_tz");
  console.log('Session info:');
  console.log('  NOW():       ', tz[0].nw);
  console.log('  UTC_TIME:    ', tz[0].utc_now);
  console.log('  session_tz:  ', tz[0].sess_tz);
  console.log('  global_tz:   ', tz[0].glob_tz);

  // Query identica all'endpoint /admin/online (con MySQL date math, no JS)
  const [online] = await c.execute(`
    SELECT username, role_level, last_login_at,
           (last_login_at > (NOW() - INTERVAL 60 MINUTE)) AS is_online,
           TIMESTAMPDIFF(MINUTE, last_login_at, NOW()) AS mins_ago_mysql
    FROM users
    WHERE role_level >= 3 AND deleted_at IS NULL
    ORDER BY last_login_at DESC
  `);
  console.log('\nQuery /admin/online (60 min window):');
  online.forEach(a => {
    console.log('  ', a.username.padEnd(12),
      '| last_login=', a.last_login_at,
      '| mysql_diff_min=', a.mins_ago_mysql,
      '| ONLINE=', a.is_online ? '🟢 SI' : '⚪ no');
  });
  await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
