<?php
declare(strict_types=1);
// One-shot DB dump bridge. Requires ?token=<SETUP_TOKEN> matching .env.
// Writes a .sql file next to itself, then output a download link.
// Delete this file after use.

error_reporting(E_ALL);
ini_set('display_errors', '1');
set_time_limit(0);
ini_set('memory_limit', '512M');

$envPath = __DIR__ . '/../.env';
if (!is_file($envPath)) { http_response_code(500); exit('ENV not found at ' . $envPath); }
$env = [];
foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if ($line === '' || str_starts_with(ltrim($line), '#')) continue;
    [$k, $v] = array_pad(explode('=', $line, 2), 2, '');
    $env[trim($k)] = trim($v, "\"' \t");
}
$token = $_GET['token'] ?? '';
if (!isset($env['SETUP_TOKEN']) || !hash_equals($env['SETUP_TOKEN'], $token)) {
    http_response_code(403); exit('Forbidden');
}

$host = $env['DB_HOST'] ?? 'localhost';
$port = (int)($env['DB_PORT'] ?? 3306);
$name = $env['DB_NAME'] ?? '';
$user = $env['DB_USER'] ?? 'ecoheroes';
$pass = $env['DB_PASS'] ?? '';

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_NUM,
]);
$pdo->exec("SET NAMES utf8mb4");

$tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);

$out = "-- Eco-Hero dump\n-- Generated: " . date('c') . "\n-- Database: $name\n\n";
$out .= "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n";

foreach ($tables as $t) {
    $create = $pdo->query("SHOW CREATE TABLE `$t`")->fetch(PDO::FETCH_NUM)[1];
    $out .= "DROP TABLE IF EXISTS `$t`;\n$create;\n\n";

    $rows = $pdo->query("SELECT * FROM `$t`");
    $cols = [];
    $colMeta = [];
    for ($i = 0; $i < $rows->columnCount(); $i++) {
        $m = $rows->getColumnMeta($i);
        $cols[] = "`" . $m['name'] . "`";
        $colMeta[$i] = $m['native_type'] ?? '';
    }
    $batch = [];
    while ($row = $rows->fetch(PDO::FETCH_NUM)) {
        $vals = [];
        foreach ($row as $i => $v) {
            if ($v === null) { $vals[] = 'NULL'; continue; }
            if (is_int($v) || is_float($v)) { $vals[] = $v; continue; }
            $vals[] = $pdo->quote((string)$v);
        }
        $batch[] = '(' . implode(',', $vals) . ')';
        if (count($batch) >= 200) {
            $out .= "INSERT INTO `$t` (" . implode(',', $cols) . ") VALUES\n" . implode(",\n", $batch) . ";\n";
            $batch = [];
        }
    }
    if ($batch) {
        $out .= "INSERT INTO `$t` (" . implode(',', $cols) . ") VALUES\n" . implode(",\n", $batch) . ";\n";
    }
    $out .= "\n";
}
$out .= "SET FOREIGN_KEY_CHECKS = 1;\n";

$file = __DIR__ . '/_dump_' . date('Ymd_His') . '.sql';
file_put_contents($file, $out);
$gz = $file . '.gz';
file_put_contents($gz, gzencode($out, 6));

header('Content-Type: application/json');
echo json_encode([
    'ok' => true,
    'tables' => count($tables),
    'sql_bytes' => strlen($out),
    'gz_bytes' => filesize($gz),
    'sql_file' => basename($file),
    'gz_file' => basename($gz),
]);
