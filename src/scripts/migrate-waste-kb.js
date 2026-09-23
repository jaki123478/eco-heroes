// Esegue migration_waste_knowledge.sql sul DB di produzione.
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const SQL_FILE = path.resolve(__dirname, '../../server-backup/database/migration_waste_knowledge.sql');

(async () => {
  if (!process.env.DB_PROD_HOST) {
    console.error('DB_PROD_* mancanti in .env');
    process.exit(1);
  }
  const sql = fs.readFileSync(SQL_FILE, 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_PROD_HOST,
    port: parseInt(process.env.DB_PROD_PORT, 10),
    user: process.env.DB_PROD_USER,
    password: process.env.DB_PROD_PASSWORD,
    database: process.env.DB_PROD_NAME,
    multipleStatements: true,
    connectTimeout: 15000,
  });
  try {
    console.log('Eseguo migration...');
    await conn.query(sql);
    const [[wk]] = await conn.query('SELECT COUNT(*) AS n FROM waste_knowledge');
    const [[rq]] = await conn.query('SELECT COUNT(*) AS n FROM scan_review_queue');
    console.log(`OK — waste_knowledge: ${wk.n} righe, scan_review_queue: ${rq.n} righe`);
  } finally {
    await conn.end();
  }
})().catch(e => {
  console.error('ERR:', e.message);
  process.exit(1);
});
