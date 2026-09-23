// =============================================================================
//  Migration: aggiunge sistema task per squadre + leaderboard persistente
// =============================================================================
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const DB = {
  host:     process.env.DB_PROD_HOST,
  port:     parseInt(process.env.DB_PROD_PORT, 10) || 3306,
  user:     process.env.DB_PROD_USER,
  password: process.env.DB_PROD_PASSWORD,
  database: process.env.DB_PROD_NAME,
  multipleStatements: true,
};

if (!DB.host || !DB.user || !DB.password || !DB.database) {
  console.error('ERRORE: variabili DB_PROD_* mancanti in .env');
  process.exit(1);
}

const TASKS = [
  // FACILE (50-100 XP)
  { code: 'first_recycle',  title: 'Primo passo',           icon: '🌱', diff: 'facile', xp:  60,  metric: 'recycled_total', target: 5,    desc: 'Riciclate 5 oggetti come squadra' },
  { code: 'ethical_starter',title: 'Coscienza ecologica',   icon: '🌿', diff: 'facile', xp:  80,  metric: 'ethical_total',  target: 200,  desc: 'Cumulate 200 punti etici totali' },
  { code: 'team_assemble',  title: 'Squadra in formazione', icon: '🤝', diff: 'facile', xp:  50,  metric: 'members_count',  target: 2,    desc: 'Raggiungete 2 membri nella squadra' },
  { code: 'first_match',    title: 'Esordio',               icon: '⚔️', diff: 'facile', xp: 100,  metric: 'matches_played', target: 1,    desc: 'Giocate la vostra prima sfida fra squadre' },

  // MEDIO (200-300 XP)
  { code: 'recycle_master', title: 'Maestri del riciclo',   icon: '♻️', diff: 'medio',  xp: 250,  metric: 'recycled_total', target: 50,   desc: 'Riciclate 50 oggetti come squadra' },
  { code: 'energy_saver',   title: 'Risparmio energetico',  icon: '⚡', diff: 'medio',  xp: 220,  metric: 'energy_total',   target: 500,  desc: 'Salvate 500 punti di energia totali' },
  { code: 'first_victory',  title: 'Prima vittoria',        icon: '🏆', diff: 'medio',  xp: 300,  metric: 'matches_won',    target: 1,    desc: 'Vincete la prima sfida fra squadre' },
  { code: 'big_team',       title: 'Squadra forte',         icon: '👥', diff: 'medio',  xp: 200,  metric: 'members_count',  target: 5,    desc: 'Raggiungete 5 membri nella squadra' },

  // DIFFICILE (500-800 XP)
  { code: 'world_savior',   title: 'Salvatori del pianeta', icon: '🌍', diff: 'difficile', xp: 600, metric: 'recycled_total', target: 200, desc: 'Riciclate 200 oggetti come squadra' },
  { code: 'elite_squad',    title: 'Squadra Elite',         icon: '💎', diff: 'difficile', xp: 700, metric: 'ethical_total',  target: 2000, desc: 'Cumulate 2000 punti etici totali' },
  { code: 'victory_streak', title: 'Striscia vincente',     icon: '🥇', diff: 'difficile', xp: 800, metric: 'matches_won',    target: 3,    desc: 'Vincete 3 sfide fra squadre' },

  // LEGGENDARIO (1500-3000 XP)
  { code: 'eco_supreme',    title: 'Eco-Hero Supremo',      icon: '🔱', diff: 'leggendario', xp: 2000, metric: 'recycled_total', target: 1000, desc: 'Riciclate 1000 oggetti come squadra' },
  { code: 'recycle_king',   title: 'Re del riciclo',        icon: '👑', diff: 'leggendario', xp: 2500, metric: 'ethical_total',  target: 5000, desc: 'Cumulate 5000 punti etici totali' },
  { code: 'perfect_squad',  title: 'Squadra perfetta',      icon: '🌟', diff: 'leggendario', xp: 3000, metric: 'matches_won',    target: 10,   desc: 'Vincete 10 sfide fra squadre' },
];

const DDL = `
-- 1. Aggiungi campi score persistenti a sv_teams (idempotente)
ALTER TABLE sv_teams
  ADD COLUMN IF NOT EXISTS total_score INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_completed INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rank_at_last_update INT UNSIGNED DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX IF NOT EXISTS idx_score (total_score DESC);

-- 2. Catalogo task (definizioni statiche, modificabile via admin)
CREATE TABLE IF NOT EXISTS sv_team_task_catalog (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(40)  NOT NULL,
  title       VARCHAR(120) NOT NULL,
  description TEXT         NOT NULL,
  icon        VARCHAR(8)   NOT NULL DEFAULT '⭐',
  difficulty  ENUM('facile','medio','difficile','leggendario') NOT NULL,
  xp_reward   INT UNSIGNED NOT NULL,
  metric      VARCHAR(40)  NOT NULL,
  target      INT UNSIGNED NOT NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_code (code),
  KEY idx_active (active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. Progresso/completamento task per squadra
CREATE TABLE IF NOT EXISTS sv_team_task_progress (
  team_id      INT UNSIGNED NOT NULL,
  task_id      INT UNSIGNED NOT NULL,
  progress     INT UNSIGNED NOT NULL DEFAULT 0,
  status       ENUM('locked','in_progress','completed','claimed') NOT NULL DEFAULT 'in_progress',
  started_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME     DEFAULT NULL,
  claimed_at   DATETIME     DEFAULT NULL,
  PRIMARY KEY (team_id, task_id),
  KEY idx_team (team_id),
  KEY idx_status (status),
  CONSTRAINT fk_ttp_team FOREIGN KEY (team_id) REFERENCES sv_teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_ttp_task FOREIGN KEY (task_id) REFERENCES sv_team_task_catalog(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
`;

async function main() {
  console.log('Connessione DB...');
  const c = await mysql.createConnection(DB);
  try {
    console.log('Applico DDL...');
    await c.query(DDL);
    console.log('  schema ok');

    // Seed catalogo task (insert idempotente via ON DUPLICATE KEY)
    console.log('Seed task catalog...');
    for (let i = 0; i < TASKS.length; i++) {
      const t = TASKS[i];
      await c.execute(
        `INSERT INTO sv_team_task_catalog (code, title, description, icon, difficulty, xp_reward, metric, target, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title=VALUES(title), description=VALUES(description), icon=VALUES(icon),
           difficulty=VALUES(difficulty), xp_reward=VALUES(xp_reward),
           metric=VALUES(metric), target=VALUES(target), sort_order=VALUES(sort_order)`,
        [t.code, t.title, t.desc, t.icon, t.diff, t.xp, t.metric, t.target, i]
      );
    }
    console.log(`  ${TASKS.length} task inseriti/aggiornati`);

    // Verifica
    const [rows] = await c.query('SELECT COUNT(*) AS n FROM sv_team_task_catalog');
    console.log(`Task totali in catalogo: ${rows[0].n}`);
    const [teams] = await c.query('SELECT id, name, total_score, tasks_completed FROM sv_teams');
    console.log(`Squadre esistenti: ${teams.length}`);
    teams.forEach(t => console.log(`  - ${t.name}: score=${t.total_score} tasks=${t.tasks_completed}`));
    console.log('\nMigration completata.');
  } finally {
    await c.end();
  }
}
main().catch(e => { console.error('ERR:', e.message, e.code || ''); process.exit(1); });
