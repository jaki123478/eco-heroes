<?php
declare(strict_types=1);
// Eco-Hero Admin Tools (single-file). Protected by SETUP_TOKEN from .env.
// Deploy at /public/admin-tools/index.php

session_name('eh_admin');
session_start();
error_reporting(E_ALL);
ini_set('display_errors', '0');

$envPath = __DIR__ . '/../../.env';
$env = [];
if (is_file($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if ($line === '' || str_starts_with(ltrim($line), '#')) continue;
        [$k, $v] = array_pad(explode('=', $line, 2), 2, '');
        $env[trim($k)] = trim($v, "\"' \t");
    }
}
$SETUP_TOKEN = $env['SETUP_TOKEN'] ?? '';
if ($SETUP_TOKEN === '') { http_response_code(500); exit('SETUP_TOKEN not configured'); }

// CSRF
if (!isset($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$CSRF = $_SESSION['csrf'];

function authed(): bool { return ($_SESSION['admin'] ?? false) === true; }

// Login
if (($_POST['action'] ?? '') === 'login') {
    $t = (string)($_POST['token'] ?? '');
    global $SETUP_TOKEN;
    if (hash_equals($SETUP_TOKEN, $t)) {
        $_SESSION['admin'] = true;
        header('Location: ?'); exit;
    }
    $LOGIN_ERR = 'Token non valido';
}
if (($_GET['logout'] ?? '') === '1') { session_destroy(); header('Location: ?'); exit; }

function pdo(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    global $env;
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            $env['DB_HOST'] ?? 'localhost', $env['DB_PORT'] ?? '3306', $env['DB_NAME'] ?? ''),
        $env['DB_USER'] ?? 'root', $env['DB_PASS'] ?? '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    return $pdo;
}

// API actions (require auth + CSRF)
function require_auth_csrf(): void {
    if (!authed()) { http_response_code(401); exit('Unauthorized'); }
    if (($_POST['csrf'] ?? '') !== ($_SESSION['csrf'] ?? '__none__')) { http_response_code(403); exit('Bad CSRF'); }
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action === 'query') {
    require_auth_csrf();
    header('Content-Type: application/json');
    try {
        $sql = (string)($_POST['sql'] ?? '');
        $stmt = pdo()->query($sql);
        $isSelect = stripos(ltrim($sql), 'SELECT') === 0 || stripos(ltrim($sql), 'SHOW') === 0
                  || stripos(ltrim($sql), 'DESC') === 0 || stripos(ltrim($sql), 'EXPLAIN') === 0;
        if ($isSelect && $stmt) {
            $rows = $stmt->fetchAll();
            echo json_encode(['ok' => true, 'rows' => $rows, 'count' => count($rows)]);
        } else {
            $aff = $stmt ? $stmt->rowCount() : 0;
            echo json_encode(['ok' => true, 'affected' => $aff]);
        }
    } catch (\Throwable $e) {
        echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

if ($action === 'stats') {
    require_auth_csrf();
    header('Content-Type: application/json');
    try {
        $tables = pdo()->query('SHOW TABLE STATUS')->fetchAll();
        echo json_encode(['ok' => true, 'tables' => $tables]);
    } catch (\Throwable $e) {
        echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

if ($action === 'phpinfo') {
    require_auth_csrf();
    phpinfo();
    exit;
}

if ($action === 'logs') {
    require_auth_csrf();
    header('Content-Type: text/plain; charset=utf-8');
    $logDir = realpath(__DIR__ . '/../../logs');
    if (!$logDir) { echo "no logs dir"; exit; }
    $f = (string)($_POST['file'] ?? '');
    $real = realpath($logDir . '/' . $f);
    if (!$real || strpos($real, $logDir) !== 0) {
        // List
        echo "Available logs:\n";
        foreach (glob($logDir . '/*.log') ?: [] as $g) echo basename($g) . " (" . filesize($g) . "B)\n";
        exit;
    }
    $sz = filesize($real);
    $offset = max(0, $sz - 65536);
    $fp = fopen($real, 'rb'); fseek($fp, $offset);
    echo fread($fp, 65536);
    fclose($fp);
    exit;
}

// ---------- HTML ----------
?><!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Eco-Hero Admin Tools</title>
<style>
:root { --bg:#0f1419; --fg:#e6edf3; --muted:#8b949e; --accent:#3fb950; --warn:#d29922; --err:#f85149; --card:#161b22; --border:#30363d; }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--fg); }
header { background:var(--card); border-bottom:1px solid var(--border); padding:12px 20px; display:flex; align-items:center; justify-content:space-between; }
header h1 { margin:0; font-size:18px; }
header .logout { color:var(--muted); text-decoration:none; font-size:13px; }
header .logout:hover { color:var(--err); }
main { max-width:1200px; margin:20px auto; padding:0 20px; }
.tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); margin-bottom:20px; }
.tab { padding:10px 16px; cursor:pointer; color:var(--muted); border-bottom:2px solid transparent; }
.tab.active { color:var(--accent); border-bottom-color:var(--accent); }
.tab:hover { color:var(--fg); }
.panel { display:none; }
.panel.active { display:block; }
.card { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:20px; margin-bottom:16px; }
.card h2 { margin:0 0 12px; font-size:15px; color:var(--accent); }
textarea, input[type=text], input[type=password] { width:100%; padding:10px 12px; background:#0d1117; color:var(--fg); border:1px solid var(--border); border-radius:6px; font-family:ui-monospace, monospace; font-size:13px; }
textarea { min-height:120px; resize:vertical; }
button { padding:8px 16px; background:var(--accent); color:#0f1419; border:none; border-radius:6px; font-weight:600; cursor:pointer; font-size:13px; }
button:hover { opacity:0.9; }
button.danger { background:var(--err); color:white; }
button.muted { background:#21262d; color:var(--fg); border:1px solid var(--border); }
.row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.kbd { background:#0d1117; border:1px solid var(--border); padding:2px 6px; border-radius:4px; font-family:ui-monospace,monospace; font-size:12px; }
.result { background:#0d1117; padding:12px; border-radius:6px; max-height:500px; overflow:auto; font-family:ui-monospace,monospace; font-size:12px; white-space:pre-wrap; word-break:break-all; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th, td { padding:6px 10px; border:1px solid var(--border); text-align:left; }
th { background:#0d1117; color:var(--muted); font-weight:600; }
.meta { color:var(--muted); font-size:12px; margin-top:8px; }
.error { color:var(--err); margin-top:8px; }
.login-box { max-width:400px; margin:80px auto; }
</style>
</head>
<body>

<?php if (!authed()): ?>
<main>
  <div class="card login-box">
    <h2>🔒 Eco-Hero Admin Tools</h2>
    <form method="post">
      <input type="hidden" name="action" value="login">
      <p style="color:var(--muted);font-size:13px;">Inserisci il <code>SETUP_TOKEN</code> definito in <code>.env</code> per accedere.</p>
      <input type="password" name="token" placeholder="SETUP_TOKEN" autocomplete="off" autofocus>
      <div class="row" style="margin-top:12px;">
        <button type="submit">Entra</button>
      </div>
      <?php if (!empty($LOGIN_ERR)): ?>
        <div class="error"><?= htmlspecialchars($LOGIN_ERR) ?></div>
      <?php endif; ?>
    </form>
  </div>
</main>
<?php else: ?>

<header>
  <h1>🌿 Eco-Hero Admin</h1>
  <a class="logout" href="?logout=1">Logout</a>
</header>

<main>
  <div class="tabs">
    <div class="tab active" data-tab="sql">SQL</div>
    <div class="tab" data-tab="stats">Stats DB</div>
    <div class="tab" data-tab="users">Utenti</div>
    <div class="tab" data-tab="logs">Logs</div>
    <div class="tab" data-tab="info">Server Info</div>
  </div>

  <!-- SQL -->
  <div class="panel active" data-panel="sql">
    <div class="card">
      <h2>SQL Console</h2>
      <textarea id="sql" placeholder="SELECT * FROM users LIMIT 10;"></textarea>
      <div class="row" style="margin-top:8px;">
        <button onclick="runSql()">Esegui</button>
        <button class="muted" onclick="setSql('SHOW TABLES;')">SHOW TABLES</button>
        <button class="muted" onclick="setSql('SELECT * FROM users LIMIT 20;')">utenti</button>
        <button class="muted" onclick="setSql('SELECT * FROM collection_points;')">isole</button>
        <button class="muted" onclick="setSql('SELECT * FROM waste_rules LIMIT 30;')">regole</button>
        <button class="muted" onclick="setSql('SELECT * FROM sv_leaderboard ORDER BY score DESC LIMIT 20;')">leaderboard</button>
      </div>
      <div class="meta">Le query <code>SELECT</code>/<code>SHOW</code> mostrano risultati; <code>INSERT/UPDATE/DELETE/DDL</code> mostrano righe interessate.</div>
      <div id="sqlResult" class="result" style="margin-top:12px;display:none;"></div>
    </div>
  </div>

  <!-- Stats -->
  <div class="panel" data-panel="stats">
    <div class="card">
      <h2>Tabelle nel database</h2>
      <button onclick="loadStats()">Aggiorna</button>
      <div id="statsResult" style="margin-top:12px;"></div>
    </div>
  </div>

  <!-- Users -->
  <div class="panel" data-panel="users">
    <div class="card">
      <h2>Gestione utenti</h2>
      <button onclick="runSql('SELECT id,email,username,role_level,xp,level,comune,last_login_at,created_at FROM users ORDER BY id DESC LIMIT 50;')">Elenca ultimi 50</button>
      <div class="meta">Per cambiare ruolo: <code>UPDATE users SET role_level=3 WHERE email='...';</code> (3=Admin, 4=SuperAdmin)</div>
      <div class="meta">Per resettare password (hash bcrypt): genera in console SQL → <code>UPDATE users SET password_hash='...' WHERE id=...;</code></div>
    </div>
  </div>

  <!-- Logs -->
  <div class="panel" data-panel="logs">
    <div class="card">
      <h2>Log applicativi (ultimi 64KB)</h2>
      <div class="row">
        <input type="text" id="logFile" placeholder="app_2026-05.log" style="flex:1;">
        <button onclick="loadLog()">Carica</button>
        <button class="muted" onclick="document.getElementById('logFile').value='';loadLog()">Lista file</button>
      </div>
      <div id="logResult" class="result" style="margin-top:12px;"></div>
    </div>
  </div>

  <!-- Info -->
  <div class="panel" data-panel="info">
    <div class="card">
      <h2>Server / PHP Info</h2>
      <button onclick="loadInfo()">Mostra phpinfo()</button>
      <div id="infoResult" style="margin-top:12px;"></div>
    </div>
  </div>
</main>

<script>
const CSRF = <?= json_encode($CSRF) ?>;

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.querySelector(`.panel[data-panel="${t.dataset.tab}"]`).classList.add('active');
}));

function setSql(s) { document.getElementById('sql').value = s; }

async function runSql(forcedSql) {
  const sql = forcedSql || document.getElementById('sql').value.trim();
  if (!sql) return;
  if (forcedSql) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'sql'));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === 'sql'));
    setSql(forcedSql);
  }
  const isWrite = /^\s*(update|delete|insert|drop|truncate|alter|create)/i.test(sql);
  if (isWrite && !confirm('Eseguire query di scrittura?\n\n' + sql)) return;
  const r = await fetch('', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: 'action=query&csrf=' + encodeURIComponent(CSRF) + '&sql=' + encodeURIComponent(sql)
  });
  const j = await r.json();
  const el = document.getElementById('sqlResult');
  el.style.display = 'block';
  if (!j.ok) { el.textContent = '❌ ' + j.error; return; }
  if (j.rows !== undefined) {
    if (j.rows.length === 0) { el.textContent = '(0 righe)'; return; }
    const cols = Object.keys(j.rows[0]);
    let h = `<table><thead><tr>${cols.map(c => '<th>' + c + '</th>').join('')}</tr></thead><tbody>`;
    for (const row of j.rows) h += '<tr>' + cols.map(c => '<td>' + (row[c] === null ? '<i style="color:#666">null</i>' : String(row[c]).replace(/</g,'&lt;')) + '</td>').join('') + '</tr>';
    h += '</tbody></table><div class="meta">' + j.count + ' righe</div>';
    el.innerHTML = h;
  } else {
    el.textContent = '✅ righe interessate: ' + j.affected;
  }
}

async function loadStats() {
  const r = await fetch('', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'action=stats&csrf=' + encodeURIComponent(CSRF) });
  const j = await r.json();
  const el = document.getElementById('statsResult');
  if (!j.ok) { el.textContent = '❌ ' + j.error; return; }
  let h = '<table><thead><tr><th>Tabella</th><th>Righe</th><th>Dati (KB)</th><th>Indici (KB)</th><th>Engine</th></tr></thead><tbody>';
  for (const t of j.tables) {
    h += `<tr><td>${t.Name}</td><td>${t.Rows}</td><td>${Math.round((t.Data_length||0)/1024)}</td><td>${Math.round((t.Index_length||0)/1024)}</td><td>${t.Engine}</td></tr>`;
  }
  h += '</tbody></table>';
  el.innerHTML = h;
}

async function loadLog() {
  const file = document.getElementById('logFile').value.trim();
  const r = await fetch('', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'action=logs&csrf=' + encodeURIComponent(CSRF) + '&file=' + encodeURIComponent(file) });
  document.getElementById('logResult').textContent = await r.text();
}

async function loadInfo() {
  const r = await fetch('', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'action=phpinfo&csrf=' + encodeURIComponent(CSRF) });
  document.getElementById('infoResult').innerHTML = '<iframe style="width:100%;height:600px;border:0;background:white;border-radius:6px;" srcdoc=\'' + (await r.text()).replace(/'/g, '&#39;') + '\'></iframe>';
}
</script>

<?php endif; ?>
</body>
</html>
