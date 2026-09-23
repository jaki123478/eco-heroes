# Login IMAP a StackMail per leggere ultime 10 email - READ ONLY
# Usa credenziali da .env (FTP_USER / FTP_PASSWORD perche su 20i StackCP
# le mailbox condividono spesso credenziali con FTP user dello stesso nome).

import imaplib
import email
from email.header import decode_header
import sys
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parents[2] / '.env'

def load_env(path):
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def decode_mime_str(s):
    if s is None:
        return ''
    parts = decode_header(s)
    out = []
    for chunk, enc in parts:
        if isinstance(chunk, bytes):
            try:
                out.append(chunk.decode(enc or 'utf-8', errors='replace'))
            except Exception:
                out.append(chunk.decode('utf-8', errors='replace'))
        else:
            out.append(chunk)
    return ''.join(out)

def try_host(host, user, password):
    print(f'\n>>> Tentativo {host}:993 con user "{user}" ...')
    try:
        M = imaplib.IMAP4_SSL(host, 993, timeout=20)
        M.login(user, password)
        print('  ✅ Login OK')
        return M
    except Exception as e:
        print(f'  ❌ {type(e).__name__}: {e}')
        return None

def main():
    env = load_env(ENV_PATH)
    # Candidati mailbox + credenziali
    # FTP user e' "eco@ecoheroes.smartvibecoding.it" + password FTP
    user = env.get('FTP_USER', 'eco@ecoheroes.smartvibecoding.it')
    pw = env.get('FTP_PASSWORD', '')
    if not pw:
        print('Manca FTP_PASSWORD in .env')
        sys.exit(1)

    # Server IMAP candidati per 20i / StackCP / StackMail
    candidates = [
        'mail.smartvibecoding.it',
        'imap.stackmail.com',
        'mx.stackmail.com',
        'mail.stackmail.com',
    ]

    M = None
    used_host = None
    for h in candidates:
        M = try_host(h, user, pw)
        if M:
            used_host = h
            break

    if not M:
        print('\nNessun host IMAP ha accettato il login. Possibili motivi:')
        print('  - mailbox non esiste / password diversa')
        print('  - host IMAP diverso (controlla pannello)')
        sys.exit(2)

    print(f'\n=== LIST cartelle (server: {used_host}) ===')
    typ, data = M.list()
    if typ == 'OK':
        for raw in data[:50]:
            print(f'  {raw.decode("utf-8", errors="replace")}')

    print('\n=== SELECT INBOX ===')
    typ, data = M.select('INBOX', readonly=True)
    if typ != 'OK':
        print(f'  Errore select: {data}')
        M.logout(); return
    total = int(data[0])
    print(f'  Totale messaggi: {total}')

    if total == 0:
        print('\n  (inbox vuota)')
        M.logout(); return

    print('\n=== Ultime 10 email ===')
    start = max(1, total - 9)
    typ, msgs = M.fetch(f'{start}:{total}', '(BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])')
    if typ != 'OK':
        print(f'  Errore fetch: {msgs}')
        M.logout(); return

    for raw in msgs:
        if not isinstance(raw, tuple):
            continue
        meta, body = raw
        try:
            msg = email.message_from_bytes(body)
            print('---')
            print(f'  Date:    {msg.get("Date", "")}')
            print(f'  From:    {decode_mime_str(msg.get("From", ""))}')
            print(f'  To:      {decode_mime_str(msg.get("To", ""))}')
            print(f'  Subject: {decode_mime_str(msg.get("Subject", ""))}')
        except Exception as e:
            print(f'  (parse error: {e})')

    M.logout()
    print('\nLogout OK')

if __name__ == '__main__':
    main()
