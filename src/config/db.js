const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

// Pool di connessioni MySQL (riutilizza le connessioni in modo efficiente)
const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               parseInt(process.env.DB_PORT) || 3306,
  database:           process.env.DB_NAME,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  connectionLimit:    parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  queueLimit:         0,
  connectTimeout:     10000,
});

/**
 * Esegue una query sul database.
 * @param {string} sql - La query SQL
 * @param {Array} params - I parametri per la query (opzionale)
 * @returns {Promise<Array>} - I risultati
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Testa la connessione al database.
 */
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Database MySQL connesso con successo!');
    console.log(`   Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`   Database: ${process.env.DB_NAME}`);
    conn.release();
  } catch (err) {
    console.error('❌ Errore connessione al database:', err.message);
    // Prova con il server alternativo
    console.log('🔄 Provo con il server alternativo...');
    try {
      const poolAlt = mysql.createPool({
        host:     process.env.DB_HOST_ALT,
        port:     3306,
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      });
      const conn = await poolAlt.getConnection();
      console.log('✅ Connesso al server alternativo!');
      conn.release();
    } catch (err2) {
      console.error('❌ Anche il server alternativo non risponde:', err2.message);
    }
  }
}

// Se eseguito direttamente (test), prova la connessione
if (require.main === module) {
  testConnection();
}

module.exports = { pool, query, testConnection };
