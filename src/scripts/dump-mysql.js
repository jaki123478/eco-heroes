const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const HOSTS = [
  { host: process.env.DB_PROD_HOST,     port: parseInt(process.env.DB_PROD_PORT, 10) || 3306 },
  { host: process.env.DB_PROD_HOST_ALT, port: 3306 },
].filter(h => h.host);
const DB_NAME = process.env.DB_PROD_NAME;
const DB_USER = process.env.DB_PROD_USER;
const DB_PASS = process.env.DB_PROD_PASSWORD;
const OUT_DIR = path.resolve(__dirname, '../../server-backup/database');

if (!DB_NAME || !DB_USER || !DB_PASS || HOSTS.length === 0) {
  console.error('ERRORE: variabili DB_PROD_* mancanti in .env');
  process.exit(1);
}

function esc(v) {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return v.toString();
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0')}'`;
}

async function tryConnect() {
  for (const h of HOSTS) {
    try {
      console.log(`Provo ${h.host}:${h.port}...`);
      const conn = await mysql.createConnection({
        host: h.host,
        port: h.port,
        user: DB_USER,
        password: DB_PASS,
        database: DB_NAME,
        connectTimeout: 15000,
        multipleStatements: false,
      });
      await conn.ping();
      console.log(`OK ${h.host}`);
      return conn;
    } catch (e) {
      console.log(`  FAIL: ${e.code || e.message}`);
    }
  }
  throw new Error('Tutti gli host MySQL hanno fallito');
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const conn = await tryConnect();
  try {
    const [tablesRows] = await conn.query('SHOW TABLES');
    const tables = tablesRows.map(r => Object.values(r)[0]);
    console.log(`Tabelle trovate: ${tables.length}`);

    let out = `-- Ecoheroes dump\n-- Generated: ${new Date().toISOString()}\n-- Database: ${DB_NAME}\n\n`;
    out += `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`;

    for (const t of tables) {
      process.stdout.write(`  - ${t}... `);
      const [createRows] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
      const createStmt = createRows[0]['Create Table'] || createRows[0]['Create View'];
      out += `DROP TABLE IF EXISTS \`${t}\`;\n${createStmt};\n\n`;

      const [rows, fields] = await conn.query(`SELECT * FROM \`${t}\``);
      const colList = fields.map(f => `\`${f.name}\``).join(',');
      const batchSize = 200;
      let count = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const vals = chunk.map(r => `(${fields.map(f => esc(r[f.name])).join(',')})`);
        out += `INSERT INTO \`${t}\` (${colList}) VALUES\n${vals.join(',\n')};\n`;
        count += chunk.length;
      }
      out += '\n';
      console.log(`${count} righe`);
    }

    out += `SET FOREIGN_KEY_CHECKS = 1;\n`;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outFile = path.join(OUT_DIR, `dump_${stamp}.sql`);
    fs.writeFileSync(outFile, out, 'utf8');
    console.log(`\nDump salvato: ${outFile}`);
    console.log(`Dimensione: ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('ERRORE:', err.message);
  process.exit(1);
});
