const { createFtpClient } = require('../config/ftp');

(async () => {
  const c = await createFtpClient();
  try {
    const list = await c.list('/public/assets/js');
    for (const name of ['eco-chatbot.min.js', 'eco-chatbot.js']) {
      const f = list.find(x => x.name === name);
      console.log(f ? `OK  ${name} presente, size=${f.size}` : `--  ${name} ASSENTE`);
    }
  } finally {
    c.close();
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
