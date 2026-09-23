require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const { testConnection: testDb } = require('./config/db');
const { testConnection: testFtp } = require('./config/ftp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================
// ROUTES DI ESEMPIO
// =====================

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    project: 'EcoHeroes',
    timestamp: new Date().toISOString(),
  });
});

// Puoi aggiungere qui le tue route
// app.use('/api/users', require('./routes/users'));
// app.use('/api/ftp',   require('./routes/ftp'));

// =====================
// AVVIO SERVER
// =====================
async function start() {
  console.log('\n🌿 =====================');
  console.log('   EcoHeroes Server');
  console.log('🌿 =====================\n');

  // Testa le connessioni all'avvio
  console.log('🔌 Test connessioni...\n');
  await testDb();
  console.log();
  await testFtp();
  console.log();

  app.listen(PORT, () => {
    console.log(`🚀 Server avviato su http://localhost:${PORT}`);
    console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start();
