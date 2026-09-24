/**
 * Eco-Heroes — Controllo oculare (hands-free) v2
 * ----------------------------------------------------------------------------
 * Privacy (HARD):
 *  - Frame camera elaborati SOLO in RAM nel browser
 *  - MAI upload di video/volto a un server
 *  - MAI scrittura di immagini facciali, landmark o modelli su
 *    localStorage / IndexedDB / disco
 *  - Offset di calibrazione: solo in memoria di sessione (RAM)
 *  - Su stop/unload: stop track, clear canvas, revoke stream
 *
 * Occhio destro = occhio DESTRO ANATOMICO del giocatore (MediaPipe eyeBlinkRight).
 * La webcam selfie non cambia l'etichetta anatomica dei blendshape.
 *
 * Richiede http://localhost (o https): getUserMedia spesso fallisce su file://.
 */
(function () {
  'use strict';

  // ---- Tuning (v2) --------------------------------------------------------
  const DWELL_MS = 900;
  const DEAD_ZONE = 0.10;          // zona morta (canvas-center normalizzato)
  const MOVE_GAIN = 1.85;          // sensibilità dopo dead-zone
  const CARDINAL_SNAP = 0.32;      // se |x| o |y| domina, snappa all'asse
  const OUTLIER_PX = 140;          // scarta salti grezzi troppo grandi (jitter)
  const CURSOR_SIZE = 18;
  // One Euro Filter — meno jitter, lag contenuto
  const EURO_MIN_CUTOFF = 1.2;
  const EURO_BETA = 0.007;
  const EURO_D_CUTOFF = 1.0;
  // Occhiolino destro → aspiratore (hold)
  const WINK_ON = 0.55;            // eyeBlinkRight sopra → chiuso
  const WINK_OFF = 0.32;           // sotto → aperto (isteresi)
  const LEFT_OPEN_MAX = 0.42;      // left deve restare abbastanza aperto (wink, non blink)
  const WINK_ENGAGE_MS = 160;      // ignora blink corti
  const WINK_CONFIRM_MAX_MS = 520; // in dialogo: wink breve = Continua

  // Landmark MediaPipe Face Mesh (iris + naso) — fallback se blendshape assenti
  const IDX_NOSE = 1;
  const IDX_L_IRIS = 468;
  const IDX_R_IRIS = 473;
  // EAR fallback (occhio destro anatomico)
  const R_EYE = { o: 33, i: 133, t1: 159, t2: 158, b1: 145, b2: 153 };
  const L_EYE = { o: 263, i: 362, t1: 386, t2: 385, b1: 374, b2: 380 };

  const state = {
    enabled: false,
    starting: false,
    stream: null,
    video: null,
    canvas: null,
    landmarker: null,
    raf: 0,
    gx: 0, gy: 0,
    rawX: 0, rawY: 0,
    hasGaze: false,
    calOffsetX: 0, calOffsetY: 0,
    calibrated: false,
    axisX: 0, axisY: 0,
    vacuum: false,       // OR di wink + dwell
    winkVacuum: false,
    dwellVacuum: false,
    confirmPulse: false,
    dwellTarget: null,
    dwellStart: 0,
    // wink machine
    rightClosed: false,
    winkCandidateSince: 0,
    winkEngaged: false,
    winkEngageAt: 0,
    winkConfirmArmed: false,
    ctx: { state: 'title', playerCssX: 0, playerCssY: 0, canvasRect: null },
    fileProtocol: typeof location !== 'undefined' && location.protocol === 'file:',
    lastTrackTs: 0,
  };

  // ---- One Euro Filter ----------------------------------------------------
  function lowPass(prev, x, alpha) {
    if (prev == null || !isFinite(prev)) return x;
    return alpha * x + (1 - alpha) * prev;
  }
  function alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / Math.max(dt, 1e-3));
  }
  function createEuro() {
    return { x: null, dx: null, lastT: null };
  }
  function euroFilter(f, value, tSec) {
    if (f.lastT == null) {
      f.lastT = tSec; f.x = value; f.dx = 0;
      return value;
    }
    const dt = Math.max(0.001, Math.min(0.05, tSec - f.lastT));
    f.lastT = tSec;
    const dPrev = f.dx == null ? 0 : f.dx;
    const dx = (value - (f.x == null ? value : f.x)) / dt;
    f.dx = lowPass(dPrev, dx, alpha(EURO_D_CUTOFF, dt));
    const cutoff = EURO_MIN_CUTOFF + EURO_BETA * Math.abs(f.dx);
    f.x = lowPass(f.x, value, alpha(cutoff, dt));
    return f.x;
  }
  const euroX = createEuro();
  const euroY = createEuro();

  let ui = {};
  function $(id) { return document.getElementById(id); }

  function ensureUI() {
    if ($('eco-eye-root')) { cacheUI(); return; }
    const root = document.createElement('div');
    root.id = 'eco-eye-root';
    root.innerHTML = [
      '<div id="eco-eye-consent" class="eco-eye-modal" hidden>',
      '  <div class="eco-eye-panel" role="dialog" aria-labelledby="eco-eye-consent-title" aria-modal="true">',
      '    <h2 id="eco-eye-consent-title">Controllo oculare</h2>',
      '    <p>Guida l\'eroe <b>con lo sguardo</b>. <b>Chiudi l\'occhio destro</b> (occhiolino) e tienilo chiuso per <b>aspirare</b> / laser — come tenere premuto Spazio.</p>',
      '    <p>Nei dialoghi puoi fissare <b>Continua</b> oppure fare un occhiolino destro breve.</p>',
      '    <p class="eco-eye-privacy"><b>Privacy:</b> la webcam viene usata <b>solo in questo browser</b>, in memoria. ',
      'Nessuna immagine del volto, nessun landmark e nessun video vengono salvati su disco, localStorage o inviati a un server.</p>',
      '    <p id="eco-eye-file-warn" class="eco-eye-warn" hidden>',
      '      Per il controllo oculare apri il gioco via <b>http://localhost</b> (la fotocamera spesso non funziona con <code>file://</code>).',
      '    </p>',
      '    <div class="eco-eye-actions">',
      '      <button type="button" id="eco-eye-activate" class="eco-eye-btn eco-eye-btn--ok">Attiva</button>',
      '      <button type="button" id="eco-eye-cancel" class="eco-eye-btn">Annulla</button>',
      '    </div>',
      '  </div>',
      '</div>',

      '<div id="eco-eye-cal" class="eco-eye-cal" hidden>',
      '  <p class="eco-eye-cal-msg">Calibrazione: guarda il punto verde e fissalo ~1s</p>',
      '  <div id="eco-eye-cal-dot" class="eco-eye-cal-dot" aria-hidden="true"></div>',
      '  <button type="button" id="eco-eye-cal-skip" class="eco-eye-btn eco-eye-cal-skip">Salta</button>',
      '</div>',

      '<div id="eco-eye-cursor" class="eco-eye-cursor" hidden aria-hidden="true"></div>',

      '<div id="eco-eye-hint" class="eco-eye-hint" hidden>Chiudi l\'occhio destro = aspira</div>',

      '<div id="eco-eye-dwells" class="eco-eye-dwells" hidden>',
      '  <button type="button" id="eco-eye-btn-vac" class="eco-eye-dwell" data-act="vacuum" aria-label="Aspira">',
      '    <svg class="eco-eye-ring" viewBox="0 0 36 36"><circle class="eco-eye-ring-bg" cx="18" cy="18" r="15"/><circle class="eco-eye-ring-fg" cx="18" cy="18" r="15"/></svg>',
      '    <span>Aspira</span>',
      '  </button>',
      '  <button type="button" id="eco-eye-btn-go" class="eco-eye-dwell" data-act="confirm" aria-label="Continua">',
      '    <svg class="eco-eye-ring" viewBox="0 0 36 36"><circle class="eco-eye-ring-bg" cx="18" cy="18" r="15"/><circle class="eco-eye-ring-fg" cx="18" cy="18" r="15"/></svg>',
      '    <span>Continua</span>',
      '  </button>',
      '</div>',

      '<div id="eco-eye-toast" class="eco-eye-toast" hidden></div>',
    ].join('\n');
    document.body.appendChild(root);
    cacheUI();
    wireUI();
  }

  function cacheUI() {
    ui = {
      consent: $('eco-eye-consent'),
      activate: $('eco-eye-activate'),
      cancel: $('eco-eye-cancel'),
      fileWarn: $('eco-eye-file-warn'),
      cal: $('eco-eye-cal'),
      calDot: $('eco-eye-cal-dot'),
      calSkip: $('eco-eye-cal-skip'),
      cursor: $('eco-eye-cursor'),
      dwells: $('eco-eye-dwells'),
      btnVac: $('eco-eye-btn-vac'),
      btnGo: $('eco-eye-btn-go'),
      toast: $('eco-eye-toast'),
      toggle: $('eco-eye-toggle'),
      hint: $('eco-eye-hint'),
    };
  }

  function wireUI() {
    if (ui.activate) ui.activate.addEventListener('click', () => { hideConsent(); beginCamera(); });
    if (ui.cancel) ui.cancel.addEventListener('click', () => { hideConsent(); setToggle(false); });
    if (ui.calSkip) ui.calSkip.addEventListener('click', () => finishCalibration(true));
    if (ui.btnVac) {
      ui.btnVac.addEventListener('mousedown', () => { state.dwellVacuum = true; syncVacuum(); });
      ui.btnVac.addEventListener('mouseup', () => { state.dwellVacuum = false; syncVacuum(); });
      ui.btnVac.addEventListener('mouseleave', () => { state.dwellVacuum = false; syncVacuum(); });
      ui.btnVac.addEventListener('touchstart', (e) => { e.preventDefault(); state.dwellVacuum = true; syncVacuum(); }, { passive: false });
      ui.btnVac.addEventListener('touchend', () => { state.dwellVacuum = false; syncVacuum(); });
    }
    if (ui.btnGo) ui.btnGo.addEventListener('click', () => { state.confirmPulse = true; });
  }

  function syncVacuum() {
    state.vacuum = !!(state.winkVacuum || state.dwellVacuum);
  }

  function showConsent() {
    ensureUI();
    if (ui.fileWarn) ui.fileWarn.hidden = !state.fileProtocol;
    if (ui.consent) ui.consent.hidden = false;
  }
  function hideConsent() { if (ui.consent) ui.consent.hidden = true; }

  function toast(msg, ms) {
    ensureUI();
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { ui.toast.hidden = true; }, ms || 3200);
  }

  function setToggle(on) {
    ensureUI();
    if (ui.toggle) {
      ui.toggle.classList.toggle('eco-eye-on', !!on);
      ui.toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      ui.toggle.title = on ? 'Disattiva controllo oculare' : 'Controllo oculare';
      const lab = ui.toggle.querySelector('.eco-eye-toggle-lab');
      if (lab) lab.textContent = on ? 'Occhi ON' : 'Controllo oculare';
    }
    if (ui.hint) ui.hint.hidden = !on;
  }

  function purgeAnyFaceStorage() {
    try {
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const lk = k.toLowerCase();
        if (lk.indexOf('ecoheroes_pixelquest_best') >= 0) continue;
        if (lk.indexOf('webgazer') >= 0 || lk.indexOf('face') >= 0 || lk.indexOf('mediapipe') >= 0 ||
            lk.indexOf('tfjs') >= 0 || lk.indexOf('eyedata') >= 0 || lk.indexOf('gaze') >= 0) {
          kill.push(k);
        }
      }
      kill.forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
    } catch (_) {}
    try {
      if (indexedDB && indexedDB.databases) {
        indexedDB.databases().then((dbs) => {
          (dbs || []).forEach((db) => {
            const n = (db && db.name) || '';
            const ln = n.toLowerCase();
            if (ln.indexOf('webgazer') >= 0 || ln.indexOf('tensorflow') >= 0 ||
                ln.indexOf('face') >= 0 || ln.indexOf('mediapipe') >= 0) {
              try { indexedDB.deleteDatabase(n); } catch (_) {}
            }
          });
        }).catch(() => {});
      }
    } catch (_) {}
  }

  async function loadLandmarker() {
    if (state.landmarker) return state.landmarker;
    const mod = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm');
    const { FaceLandmarker, FilesetResolver } = mod;
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    state.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,   // eyeBlinkLeft / eyeBlinkRight
      outputFacialTransformationMatrixes: false,
    });
    return state.landmarker;
  }

  async function beginCamera() {
    if (state.starting || state.enabled) return;
    state.starting = true;
    setToggle(true);
    purgeAnyFaceStorage();
    if (state.fileProtocol) toast('Apri il gioco via http://localhost per usare la fotocamera.', 5000);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia non disponibile');
      }
      toast('Caricamento modello (solo in memoria)…', 4000);
      await loadLandmarker();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      state.stream = stream;

      const video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
      video.srcObject = stream;
      document.body.appendChild(video);
      state.video = video;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      state.canvas = canvas;

      state.enabled = true;
      state.starting = false;
      state.hasGaze = false;
      state.axisX = 0;
      state.axisY = 0;
      state.winkVacuum = false;
      state.dwellVacuum = false;
      syncVacuum();
      euroX.x = euroX.dx = euroX.lastT = null;
      euroY.x = euroY.dx = euroY.lastT = null;
      resetWink();

      ensureUI();
      if (ui.cursor) ui.cursor.hidden = false;
      if (ui.dwells) ui.dwells.hidden = false;
      setToggle(true);
      toast('Occhi ON — chiudi l\'occhio destro per aspirare', 3200);
      startCalibration();
      loop();
    } catch (err) {
      console.warn('[EcoEye]', err);
      state.starting = false;
      hardCleanup();
      setToggle(false);
      const tip = state.fileProtocol
        ? ' Per il controllo oculare apri il gioco via http://localhost:8765/index.html.'
        : ' Controlla i permessi della fotocamera.';
      toast('Impossibile avviare la webcam.' + tip, 6000);
    }
  }

  function resetWink() {
    state.rightClosed = false;
    state.winkCandidateSince = 0;
    state.winkEngaged = false;
    state.winkEngageAt = 0;
    state.winkConfirmArmed = false;
    state.winkVacuum = false;
    syncVacuum();
  }

  // ---- Calibration (offsets only in RAM) ----------------------------------
  const CAL_POINTS = [
    [0.5, 0.5],
    [0.2, 0.25],
    [0.8, 0.25],
    [0.2, 0.75],
    [0.8, 0.75],
  ];
  let calIdx = 0;
  let calSamples = [];
  let calDwellT = 0;

  function startCalibration() {
    calIdx = 0;
    calSamples = [];
    calDwellT = 0;
    state.calibrated = false;
    state.calOffsetX = 0;
    state.calOffsetY = 0;
    ensureUI();
    if (ui.cal) ui.cal.hidden = false;
    placeCalDot();
  }

  function placeCalDot() {
    if (!ui.calDot) return;
    const p = CAL_POINTS[calIdx];
    ui.calDot.style.left = (p[0] * 100) + '%';
    ui.calDot.style.top = (p[1] * 100) + '%';
    ui.calDot.style.setProperty('--eco-cal-p', 0);
  }

  function finishCalibration(skipped) {
    if (ui.cal) ui.cal.hidden = true;
    if (!skipped && calSamples.length) {
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < calSamples.length; i++) {
        const s = calSamples[i];
        const targetX = CAL_POINTS[s.i][0] * window.innerWidth;
        const targetY = CAL_POINTS[s.i][1] * window.innerHeight;
        sx += s.x - targetX;
        sy += s.y - targetY;
        n++;
      }
      if (n) {
        state.calOffsetX = sx / n;
        state.calOffsetY = sy / n;
      }
    }
    calSamples = [];
    state.calibrated = true;
    toast(skipped ? 'Calibrazione saltata — occhio destro = aspira' : 'Calibrazione ok — occhio destro = aspira', 3000);
  }

  // ---- Tracking -----------------------------------------------------------
  let lastVideoTime = -1;

  function loop() {
    if (!state.enabled) return;
    state.raf = requestAnimationFrame(loop);
    const video = state.video;
    const lm = state.landmarker;
    if (!video || !lm || video.readyState < 2) return;

    const now = performance.now();
    if (video.currentTime === lastVideoTime) {
      updateFromGaze(now);
      return;
    }
    lastVideoTime = video.currentTime;

    let result = null;
    try {
      result = lm.detectForVideo(video, now);
    } catch (_) {
      return;
    }

    const faces = result && result.faceLandmarks;
    if (faces && faces.length) {
      const pts = faces[0];
      const iris = averageIris(pts) || landmarkXY(pts, IDX_NOSE);
      if (iris) {
        // Selfie: miriamo x per allineare sguardo allo schermo
        const nx = 1 - iris.x;
        const ny = iris.y;
        let screenX = nx * window.innerWidth - state.calOffsetX;
        let screenY = ny * window.innerHeight - state.calOffsetY;

        // Outlier clamp sul grezzo
        if (state.hasGaze) {
          const jx = screenX - state.rawX;
          const jy = screenY - state.rawY;
          const jump = Math.sqrt(jx * jx + jy * jy);
          if (jump > OUTLIER_PX) {
            const s = OUTLIER_PX / jump;
            screenX = state.rawX + jx * s;
            screenY = state.rawY + jy * s;
          }
        }
        state.rawX = screenX;
        state.rawY = screenY;

        const tSec = now / 1000;
        const fx = euroFilter(euroX, screenX, tSec);
        const fy = euroFilter(euroY, screenY, tSec);
        state.gx = fx;
        state.gy = fy;
        state.hasGaze = true;
      }

      // Blendshapes: eyeBlinkRight / eyeBlinkLeft (anatomici del soggetto)
      const blink = readBlinkScores(result);
      updateWink(now, blink.right, blink.left, pts);
    }
    result = null; // nessun salvataggio landmark
    updateFromGaze(now);
  }

  function readBlinkScores(result) {
    let right = 0, left = 0, got = false;
    const cats = result && result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
    if (cats && cats.length) {
      for (let i = 0; i < cats.length; i++) {
        const c = cats[i];
        const n = c.categoryName || c.displayName || '';
        if (n === 'eyeBlinkRight') { right = c.score; got = true; }
        else if (n === 'eyeBlinkLeft') { left = c.score; got = true; }
      }
    }
    return { right: right, left: left, fromBlend: got };
  }

  function landmarkXY(pts, i) {
    const p = pts[i];
    if (!p) return null;
    return { x: p.x, y: p.y };
  }

  function averageIris(pts) {
    const a = landmarkXY(pts, IDX_L_IRIS);
    const b = landmarkXY(pts, IDX_R_IRIS);
    if (a && b) return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
    return a || b || null;
  }

  function dist(a, b) {
    if (!a || !b) return 0;
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function eyeEAR(pts, e) {
    const o = landmarkXY(pts, e.o), i = landmarkXY(pts, e.i);
    const t1 = landmarkXY(pts, e.t1), t2 = landmarkXY(pts, e.t2);
    const b1 = landmarkXY(pts, e.b1), b2 = landmarkXY(pts, e.b2);
    const horiz = dist(o, i);
    if (horiz < 1e-6) return 0.3;
    const v = (dist(t1, b1) + dist(t2, b2)) * 0.5;
    return v / horiz;
  }

  function updateWink(now, blinkR, blinkL, pts) {
    // Fallback EAR se blendshape non disponibili (EAR basso = chiuso)
    let rightScore = blinkR;
    let leftScore = blinkL;
    if (!(rightScore > 0 || leftScore > 0) && pts) {
      const earR = eyeEAR(pts, R_EYE);
      const earL = eyeEAR(pts, L_EYE);
      // EAR tipico aperto ~0.25–0.35, chiuso ~0.05–0.15 → mappa a "blink score"
      rightScore = Math.max(0, Math.min(1, (0.28 - earR) / 0.20));
      leftScore = Math.max(0, Math.min(1, (0.28 - earL) / 0.20));
    }

    // Isteresi chiusura occhio destro anatomico
    if (!state.rightClosed) {
      if (rightScore >= WINK_ON && leftScore <= LEFT_OPEN_MAX) {
        if (!state.winkCandidateSince) state.winkCandidateSince = now;
        if (now - state.winkCandidateSince >= WINK_ENGAGE_MS) {
          state.rightClosed = true;
          state.winkEngaged = true;
          state.winkEngageAt = now;
          state.winkConfirmArmed = true;
          onWinkEngage(now);
        }
      } else {
        state.winkCandidateSince = 0;
      }
    } else {
      if (rightScore <= WINK_OFF) {
        const held = now - state.winkEngageAt;
        onWinkRelease(held);
        state.rightClosed = false;
        state.winkEngaged = false;
        state.winkCandidateSince = 0;
        state.winkVacuum = false;
        syncVacuum();
      } else {
        // Hold: aspiratore solo in gioco
        if (state.ctx.state === 'playing') {
          state.winkVacuum = true;
          syncVacuum();
        }
      }
    }
  }

  function onWinkEngage(now) {
    const st = state.ctx.state;
    if (st === 'playing') {
      state.winkVacuum = true;
      syncVacuum();
    }
    // Dialoghi: conferma al engage (dopo debounce) — un colpo
    if (st === 'title' || st === 'story' || st === 'over') {
      if (state.winkConfirmArmed) {
        state.confirmPulse = true;
        state.winkConfirmArmed = false;
      }
    }
  }

  function onWinkRelease(heldMs) {
    // Se in dialogo un wink lungo non ha già confermato, conferma al rilascio breve
    const st = state.ctx.state;
    if ((st === 'title' || st === 'story' || st === 'over') && state.winkConfirmArmed && heldMs <= WINK_CONFIRM_MAX_MS) {
      state.confirmPulse = true;
    }
    state.winkConfirmArmed = false;
  }

  function updateFromGaze(now) {
    if (!state.hasGaze) return;

    if (ui.cursor) {
      ui.cursor.style.transform = 'translate(' + (state.gx - CURSOR_SIZE / 2) + 'px,' + (state.gy - CURSOR_SIZE / 2) + 'px)';
      ui.cursor.classList.toggle('eco-eye-cursor--vac', !!state.vacuum);
    }

    // Calibrazione
    if (ui.cal && !ui.cal.hidden) {
      const p = CAL_POINTS[calIdx];
      const tx = p[0] * window.innerWidth;
      const ty = p[1] * window.innerHeight;
      const dx = state.gx - tx, dy = state.gy - ty;
      const dist2 = Math.sqrt(dx * dx + dy * dy);
      if (dist2 < 54) {
        calDwellT += 16;
        if (ui.calDot) ui.calDot.style.setProperty('--eco-cal-p', Math.min(1, calDwellT / 800));
        if (calDwellT >= 800) {
          calSamples.push({ i: calIdx, x: state.rawX, y: state.rawY });
          calIdx++;
          calDwellT = 0;
          if (calIdx >= CAL_POINTS.length) finishCalibration(false);
          else placeCalDot();
        }
      } else {
        calDwellT = 0;
        if (ui.calDot) ui.calDot.style.setProperty('--eco-cal-p', 0);
      }
      state.axisX = 0;
      state.axisY = 0;
      return;
    }

    // Movimento: relativo al CENTRO del canvas di gioco (cardinali più chiari)
    let originX = window.innerWidth * 0.5;
    let originY = window.innerHeight * 0.5;
    let ref = Math.min(window.innerWidth, window.innerHeight) * 0.38;
    const rect = state.ctx.canvasRect;
    if (rect && rect.width > 40) {
      originX = rect.left + rect.width * 0.5;
      originY = rect.top + rect.height * 0.5;
      ref = Math.min(rect.width, rect.height) * 0.42;
    }

    let nx = (state.gx - originX) / ref;
    let ny = (state.gy - originY) / ref;
    const mag = Math.sqrt(nx * nx + ny * ny);

    if (mag < DEAD_ZONE) {
      state.axisX = 0;
      state.axisY = 0;
    } else {
      const adj = Math.min(1, (mag - DEAD_ZONE) / (1 - DEAD_ZONE));
      // Curva soft: piccoli sguardi → risposta affidabile
      const curved = Math.pow(adj, 0.85);
      let ax = (nx / (mag || 1)) * curved * MOVE_GAIN;
      let ay = (ny / (mag || 1)) * curved * MOVE_GAIN;

      // Snap cardinale: se un asse domina, azzera l'altro (WASD più pulito)
      const axa = Math.abs(ax), aya = Math.abs(ay);
      if (axa > aya && aya < CARDINAL_SNAP * axa) ay = 0;
      else if (aya > axa && axa < CARDINAL_SNAP * aya) ax = 0;

      const m2 = Math.sqrt(ax * ax + ay * ay);
      if (m2 > 1) { ax /= m2; ay /= m2; }
      state.axisX = ax;
      state.axisY = ay;
    }

    updateDwellButtons(now);
  }

  function updateDwellButtons(now) {
    ensureUI();
    const playing = state.ctx.state === 'playing';
    const storyish = state.ctx.state === 'story' || state.ctx.state === 'title' || state.ctx.state === 'over';

    // Aspira dwell resta secondario (wink è primario)
    if (ui.btnVac) ui.btnVac.hidden = !playing;
    if (ui.btnGo) {
      ui.btnGo.hidden = !storyish;
      const span = ui.btnGo.querySelector('span');
      if (span) {
        span.textContent = state.ctx.state === 'over' ? 'Riprova'
          : state.ctx.state === 'title' ? 'Inizia'
          : 'Continua';
      }
    }

    const targets = [];
    if (playing && ui.btnVac && !ui.btnVac.hidden) targets.push(ui.btnVac);
    if (storyish && ui.btnGo && !ui.btnGo.hidden) targets.push(ui.btnGo);

    let hit = null;
    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      const r = el.getBoundingClientRect();
      const pad = 10;
      if (state.gx >= r.left - pad && state.gx <= r.right + pad &&
          state.gy >= r.top - pad && state.gy <= r.bottom + pad) {
        hit = el;
        break;
      }
    }

    if (hit !== state.dwellTarget) {
      state.dwellTarget = hit;
      state.dwellStart = now;
      if (!state.winkVacuum) {
        state.dwellVacuum = false;
        syncVacuum();
      }
      setRing(ui.btnVac, 0);
      setRing(ui.btnGo, 0);
    }

    if (!hit) {
      if (!state.winkVacuum) {
        state.dwellVacuum = false;
        syncVacuum();
      }
      return;
    }

    const prog = Math.min(1, (now - state.dwellStart) / DWELL_MS);
    setRing(hit, prog);
    const act = hit.getAttribute('data-act');
    if (act === 'vacuum') {
      state.dwellVacuum = prog >= 1;
      syncVacuum();
    } else if (act === 'confirm' && prog >= 1) {
      state.confirmPulse = true;
      state.dwellStart = now + 999999;
      setRing(hit, 0);
    }
  }

  function setRing(btn, p) {
    if (!btn) return;
    const fg = btn.querySelector('.eco-eye-ring-fg');
    if (!fg) return;
    const C = 2 * Math.PI * 15;
    fg.style.strokeDasharray = String(C);
    fg.style.strokeDashoffset = String(C * (1 - p));
    btn.classList.toggle('eco-eye-dwell--hot', p >= 1);
  }

  function hardCleanup() {
    state.enabled = false;
    state.starting = false;
    state.hasGaze = false;
    state.axisX = 0;
    state.axisY = 0;
    resetWink();
    state.dwellVacuum = false;
    syncVacuum();
    state.dwellTarget = null;
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }

    if (state.stream) {
      try { state.stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} }); } catch (_) {}
      state.stream = null;
    }
    if (state.video) {
      try { state.video.pause(); } catch (_) {}
      try { state.video.srcObject = null; } catch (_) {}
      try { if (state.video.parentNode) state.video.parentNode.removeChild(state.video); } catch (_) {}
      state.video = null;
    }
    if (state.canvas) {
      try {
        const c = state.canvas.getContext('2d');
        if (c) c.clearRect(0, 0, state.canvas.width, state.canvas.height);
      } catch (_) {}
      state.canvas.width = 0;
      state.canvas.height = 0;
      state.canvas = null;
    }
    if (state.landmarker) {
      try { state.landmarker.close(); } catch (_) {}
      state.landmarker = null;
    }
    purgeAnyFaceStorage();

    if (ui.cursor) ui.cursor.hidden = true;
    if (ui.dwells) ui.dwells.hidden = true;
    if (ui.cal) ui.cal.hidden = true;
    if (ui.hint) ui.hint.hidden = true;
    hideConsent();
  }

  function stopEye(msg) {
    hardCleanup();
    setToggle(false);
    if (msg) toast(msg, 2200);
  }

  const EcoEye = {
    isActive: function () { return !!state.enabled; },
    getAxis: function () {
      if (!state.enabled) return { x: 0, y: 0 };
      return { x: state.axisX, y: state.axisY };
    },
    isVacuum: function () { return !!(state.enabled && state.vacuum); },
    takeConfirm: function () {
      if (!state.confirmPulse) return false;
      state.confirmPulse = false;
      return true;
    },
    provideContext: function (c) {
      if (!c) return;
      state.ctx.state = c.state || state.ctx.state;
      if (typeof c.playerCssX === 'number') state.ctx.playerCssX = c.playerCssX;
      if (typeof c.playerCssY === 'number') state.ctx.playerCssY = c.playerCssY;
      if (c.canvasRect) state.ctx.canvasRect = c.canvasRect;
    },
    requestStart: function () { showConsent(); },
    stop: function () { stopEye('Controllo oculare disattivato'); },
    toggle: function () {
      if (state.enabled || state.starting) stopEye('Controllo oculare disattivato');
      else showConsent();
    },
  };
  window.EcoEye = EcoEye;

  function boot() {
    ensureUI();
    cacheUI();
    if (ui.toggle && !ui.toggle._ecoBound) {
      ui.toggle._ecoBound = true;
      ui.toggle.addEventListener('click', () => EcoEye.toggle());
    }
    window.addEventListener('beforeunload', () => { hardCleanup(); });
    window.addEventListener('pagehide', () => { hardCleanup(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.enabled) stopEye('');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
