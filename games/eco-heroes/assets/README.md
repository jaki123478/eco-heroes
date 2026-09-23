# Eco-Heroes: Pixel Quest — sprite & sfondo opzionali

Il gioco funziona **senza** questi file: disegna tutto su canvas (mondo, eroe,
nemici). Se metti qui i file con questi nomi esatti, il gioco li usa
**automaticamente** (nessuna modifica al codice):

| File            | Cosa fa                                              |
|-----------------|------------------------------------------------------|
| `map.png`       | **Sfondo dell'area di gioco** (640×480). Se presente sostituisce il mondo disegnato. Es. una delle tue immagini reference. |
| `eco-hero.png`  | Sprite del Tech-Scavenger (~24×28 px)                |
| `trash.png`     | Rifiuto collezionabile (~20×20 px)                   |
| `smog.png`      | Blob di smog tossico (~28×28 px)                     |
| `tree.png`      | Albero / ostacolo (32×32 px, 1 tile)                 |

## Usare una tua foto come mappa
1. Salva l'immagine come **`map.png`** in questa cartella (idealmente 640×480 o
   proporzione 4:3).
2. Ricarica il gioco: la foto diventa lo sfondo dell'area di gioco.

⚠️ Le **collisioni** usano sempre la griglia interna 20×15 (TILE 32px) definita
in `game.js` → `buildWorld()`. Con uno sfondo-foto, l'eroe collide con la griglia
logica, non con i pixel della foto: se vuoi farli combaciare, adatta la mappa in
`buildWorld()` alla tua immagine.

## Note
- Pixel art: i file vengono scalati "nearest" (niente sfocatura).
- Un singolo frame per file (niente sprite-sheet): `drawImage` diretto.
- Percorsi nella costante `SPRITE_SRC` in `game.js`.
