# Eco-Heroes: Pixel Quest — HANDOFF (per nuova chat)

## Cos'è
Mini-gioco 2D top-down (vanilla JS + Canvas) dentro l'app Eco-Hero.
- Path locale: `C:\Users\Jaki1\Desktop\ecoheroes\server-backup\public\games\eco-heroes\`
- 3 file: `index.html`, `game.js` (~1100 righe), `style.css` + `assets/`
- Online: https://ecoheroes.smartvibecoding.it/games/eco-heroes/index.html

## Hosting & Deploy (IMPORTANTE)
- Hosting **StackCP solo PHP**, deploy **FTP-only**. Niente server Node in produzione.
- Deploy: `cd C:\Users\Jaki1\Desktop\ecoheroes` → `node scratch/deploy-pixelquest.js` (carica via FTP tutta la cartella del gioco + `src/Views/app.php`).
- Dopo OGNI deploy: **Ctrl+F5** (hard refresh) per bypassare la cache.
- Cache busting: `game.js?v=N` in index.html (ora **v=34**) → bumpa a ogni modifica di game.js. Gli sprite caricano con `?v=15` (in `loadSprites`, riga ~100) → bumpa SOLO se rigeneri uno sprite con lo stesso nome file.
- Verificare il deploy: WebFetch di `game.js?cb=qualcosa` e cerca una stringa nuova.

## FATTO
### 1. Voci dialoghi (gratis, NESSUNA API a pagamento)
- 11 battute pre-generate con **edge-tts** (voci neurali IT, gratis, senza key) → MP3 statici in `assets/voices/` + `manifest.json`. 5 voci-personaggio.
- `dialogueVoice.js` (`window.EcoVoice`) riproduce l'MP3 dal manifest; fallback Web Speech. In game.js: effetto typewriter + prompt "SPAZIO/continua" a fine voce.
- Rigenera: `pip install edge-tts` → `python scratch/gen-game-voices.py`. Test: `node scratch/verify-voices.js`.

### 2. Ritratti dialoghi animati (sprite sheet)
- Eco-Engineer + Tech-Scavenger nei dialoghi: idle animato (respiro+bob+dondolio+blink) da sheet pre-renderizzato: `assets/eco-engineer-sheet.png`, `eco-hero-sheet.png`. In game.js: `const SHEETS` + `drawSheetAnim` (in `drawStory`).
- REGOLA: lo sprite ha la faccia DISEGNATA dentro → NON disegnare bocche/occhi sopra (crea doppioni). Animare SOLO con frame pre-renderizzati.

### 3. Personaggio giocabile = Tech-Scavenger (NUOVO, da concept HD)
- Concept HD: `C:\Users\Jaki1\Downloads\ChatGPT Image 9 giu 2026, 11_08_46.png` (1448x1086, turnaround + pose azione).
- Pose estratte: `scratch/extract-poses.py` → `scratch/poses/{front,aim,vacuum,victory}.png` (toglie sfondo crema).
- Sprite sheet **96x96** in `assets/characters/tech-scavenger/`:
  - `idle.png` (6f), `walk.png` (8f) → `scratch/anim-techscav.py`
  - `aim.png` (4f), `vacuum.png` (8f), `victory.png` (6f) → `scratch/anim-techscav-actions.py`
- Integrato in `drawHero` (game.js ~835): stati **victory > vacuum (`p.vacuuming`) > walk (movimento) > idle**. Frame 96x96 ancorato ai piedi: `sc=h*1.92/92`, `feetY=95`, `cx=48`, flip per `dir===2` (sinistra).
- victory: a livello completato (`game.victoryT=1.2` in `advanceLevel`, decrementato in `update`).

## DA FARE (Milestone 3, opzionale)
- **aim.png** è caricato ma senza trigger (il gioco non ha un input "mira" separato). Idea: mostrare aim tenendo Spazio da fermo.
- **Effetti vacuum completi** (dallo script dell'utente): nozzle glow dedicato, beam curvo luminoso, rinculo extra, particelle cyan/verdi, smog tirato verso l'ugello. Ora c'è la posa vacuum (con scintille nello sprite) + l'aspiratore esistente (`drawVacuum` ~874).
- Facing vacuum/aim su/giù: ora mostra la posa di profilo verso destra. Per perfezione servirebbero pose up/down.
- Tech-Scavenger nei DIALOGHI usa ancora `eco-hero-sheet.png` (low-res): si può rigenerare la idle-dialogo dal nuovo front HD.

## File chiave in game.js
- `SPRITE_SRC` (~93) — elenco sprite. `SPEAKERS` (~203) — personaggi dialoghi.
- `drawHero` (~830) — rendering player (idle/walk/vacuum/victory).
- `drawStory` (~915) — schermata dialogo + ritratto animato.
- `SHEETS`/`drawSheetAnim` (~895) — animazioni ritratti. `drawVacuum` (~874) — aspiratore.
- `advanceLevel` (~553), `update` (~564), `frame` (~1090).

## Gotchas / preferenze utente
- Animare i personaggi con FRAME pre-renderizzati (mai disegnare faccia/bocca sopra lo sprite).
- "Macchia chiara" ai piedi del Tech-Scavenger = canister metallico (parte del personaggio, NON sfondo).
- Solo soluzioni AI GRATIS (no API a pagamento), niente chiavi nel frontend.
- **Rispondere all'utente in ITALIANO.**
- Memoria persistente già aggiornata: vedi `project_ecohero_game_voices.md`.
