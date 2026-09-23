const path = require('path');
const { createFtpClient } = require('../config/ftp');

const UPLOADS = [
  // SEO
  { local: '../../server-backup/src/Controllers/SeoController.php', remote: '/src/Controllers/SeoController.php' },
  { local: '../../server-backup/src/Views/landing.php',             remote: '/src/Views/landing.php' },
  // Routes
  { local: '../../server-backup/src/routes.php',                    remote: '/src/routes.php' },
  // PWA install
  { local: '../../server-backup/public/assets/js/pwa-install.js',   remote: '/public/assets/js/pwa-install.js' },
  { local: '../../server-backup/src/Views/app.php',                 remote: '/src/Views/app.php' },
  // Admin dashboard
  { local: '../../server-backup/src/Controllers/AdminController.php', remote: '/src/Controllers/AdminController.php' },
  { local: '../../server-backup/src/Views/admin-dashboard.php',     remote: '/src/Views/admin-dashboard.php' },
];

async function main() {
  const client = await createFtpClient();
  try {
    for (const u of UPLOADS) {
      const local = path.resolve(__dirname, u.local);
      console.log(`Upload ${u.remote}`);
      await client.uploadFrom(local, u.remote);
      console.log('    OK');
    }
    console.log('\nDeploy completato.');
  } finally { client.close(); }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
