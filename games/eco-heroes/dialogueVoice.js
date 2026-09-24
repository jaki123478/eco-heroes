/* ===========================================================================
 *  ECO-HEROES — SISTEMA VOCI DIALOGHI (frontend, 100% statico/offline)
 *  Espone window.EcoVoice.
 *
 *  Le battute del gioco sono FISSE: le voci sono state pre-generate una volta
 *  con voci neurali italiane realistiche (edge-tts, gratis, senza API key —
 *  vedi scratch/gen-game-voices.py) e salvate come MP3 statici in
 *  assets/voices/ con un manifest.json. A runtime il gioco riproduce solo file
 *  locali: NESSUNA API, nessuna chiave, nessun costo, funziona offline.
 *
 *  Se una battuta non ha l'MP3 (manifest non caricato, file mancante, frase
 *  nuova non ancora generata) si ricade sulla Web Speech del browser; se manca
 *  anche quella, si attende una durata stimata così il gioco continua comunque.
 *
 *  API (invariata):
 *    EcoVoice.speak(character, text, { onStart, onEnd, volume })
 *    EcoVoice.stop()  ·  EcoVoice.setMuted(b)  ·  EcoVoice.isMuted()
 *    EcoVoice.isSpeaking()
 * ======================================================================== */
window.EcoVoice = (function () {
  'use strict';

  var VOICES_DIR = 'assets/voices/';
  var MANIFEST_URL = VOICES_DIR + 'manifest.json';

  // Last-resort copy of assets/voices/manifest.json (and voices-manifest.js).
  // Used if the <script> tag was omitted / reordered, or fetch fails on file://.
  var DEFAULT_MANIFEST = {
  "ECO_ENGINEER|i rifiuti si sono fusi insieme... qualcosa si muove la in fondo!": "62dbee456991db11.mp3",
  "SCRAP_GOLEM|grrr... inquinamento... per sempre!": "2815d17eab7842c5.mp3",
  "ECO_ENGINEER|e lo scrap golem! mira il fascio al suo nucleo viola. forza!": "5461500b8a70ea64.mp3",
  "SCRAP_GOLEM|non mi fermerai, scavenger!": "3c29b14402cfea14.mp3",
  "TECH_SCAVENGER|la citta torna a respirare. ora!": "c9532726bdb38a7d.mp3",
  "ECO_ENGINEER|dagli dentro, eroe! ultimo sforzo!": "07c7fa2537ac5d17.mp3",
  "ECO_ENGINEER|la citta soffoca sotto lo smog tossico!": "e4ba335df777a0dd.mp3",
  "ECO_ENGINEER|tu sei il tech-scavenger: lo zaino aspira rifiuti e inquinamento.": "2875d32e7ea9c735.mp3",
  "ECO_ENGINEER|il recycler bot ti seguira e dara una mano.": "55060b1a98cfd3d3.mp3",
  "ECO_ENGINEER|premi spazio (o il tasto tondo) per aspirare. riporta il verde!": "3ad0fb5fe5e48c96.mp3",
  "TECH_SCAVENGER|pronto a ripulire la citta. andiamo!": "be66de222eebda0c.mp3"
};
  // Profili per il FALLBACK Web Speech (timbro approssimato via rate/pitch).
  var FALLBACK = {
    ECO_ENGINEER:   { rate: 0.98, pitch: 1.18 },
    TECH_SCAVENGER: { rate: 1.06, pitch: 1.12 },
    RECYCLER_BOT:   { rate: 1.14, pitch: 1.45 },
    SMOG_BLOB:      { rate: 0.90, pitch: 0.72 },
    SCRAP_GOLEM:    { rate: 0.74, pitch: 0.48 },
  };

  var manifestPromise = null;   // Promise<Object> caricata una sola volta
  var currentAudio = null;      // HTMLAudioElement in riproduzione
  var sharedAudio = null;       // UNICO elemento riusato: "sbloccato" dentro un gesto utente (iOS)
  var muted = false;
  var token = 0;                // invalida i callback di battute superate

  // iOS Safari blocca .play() fuori dallo stack di un gesto utente: il nostro parte
  // DOPO il fetch del manifest → bloccato alla prima visita. Soluzione: il gioco chiama
  // unlock() dentro click/touch → si "prima" un elemento riusabile con un WAV muto;
  // i .play() successivi sullo STESSO elemento sono permessi anche fuori gesto.
  function unlock() {
    try {
      if (!sharedAudio) sharedAudio = new Audio();
      if (currentAudio === sharedAudio && !sharedAudio.paused) return;   // sta parlando: non interrompere
      sharedAudio.onplay = sharedAudio.onended = sharedAudio.onerror = null;  // handler stantii: il primer NON deve ri-sparare l'onStart della battuta appena finita
      sharedAudio.muted = true;
      sharedAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      var pr = sharedAudio.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (_) {}
    if ('speechSynthesis' in window) {                                   // prima anche il fallback Web Speech
      try { var u = new SpeechSynthesisUtterance(''); u.volume = 0; window.speechSynthesis.speak(u); } catch (_) {}
    }
  }

  function profileOf(character) { return FALLBACK[character] || FALLBACK.ECO_ENGINEER; }
  function norm(text) { return String(text).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function keyOf(character, text) { return character + '|' + norm(text); }
  function estimateMs(text) {
    var words = String(text).trim().split(/\s+/).length;
    return Math.max(1200, words * 360);
  }

  // Carica (una volta) il manifest delle voci pre-generate.
  // Su file:// Chrome blocca fetch -> usa ECO_VOICE_MANIFEST / DEFAULT_MANIFEST.
  // Su http(s) prova fetch (production puo aggiornare solo manifest.json),
  // e in caso di errore ricade sull'embedded.
  function loadManifest() {
    if (!manifestPromise) {
      var embedded =
        (typeof window !== 'undefined' && window.ECO_VOICE_MANIFEST && typeof window.ECO_VOICE_MANIFEST === 'object')
          ? window.ECO_VOICE_MANIFEST
          : DEFAULT_MANIFEST;
      var isFile = (typeof location !== 'undefined' && location.protocol === 'file:');
      if (isFile) {
        manifestPromise = Promise.resolve(embedded || {});
      } else {
        manifestPromise = fetch(MANIFEST_URL, { cache: 'force-cache' })
          .then(function (r) { return r.ok ? r.json() : (embedded || {}); })
          .catch(function () { return embedded || {}; });
      }
    }
    return manifestPromise;
  }

  function stop() {
    token++;
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (_) {}
      currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
  }

  function setMuted(v) { muted = !!v; if (muted) stop(); }
  function isMuted() { return muted; }
  function isSpeaking() {
    if (currentAudio && !currentAudio.paused) return true;
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) return true;
    return false;
  }

  function pickItalianVoice() {
    if (!('speechSynthesis' in window)) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < voices.length; i++) {
      if (/it[-_]/i.test(voices[i].lang || '')) return voices[i];
    }
    return null;
  }

  // Voce di sintesi del browser. Garantisce comunque onEnd (una sola volta).
  function fallbackSpeak(character, text, myToken, endOnce) {
    if (myToken !== token) return;                       // battuta superata: niente voce "fantasma" sopra quella nuova
    if (muted || !('speechSynthesis' in window)) {
      setTimeout(endOnce, muted ? 250 : estimateMs(text));
      return;
    }
    try {
      var p = profileOf(character);
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT'; u.rate = p.rate; u.pitch = p.pitch; u.volume = 0.95;
      var v = pickItalianVoice(); if (v) u.voice = v;
      u.onend = endOnce; u.onerror = endOnce;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      setTimeout(endOnce, estimateMs(text) + 1500); // rete di sicurezza
    } catch (_) {
      setTimeout(endOnce, estimateMs(text));
    }
  }

  // Riproduce un MP3 statico. In caso di errore → fallback Web Speech.
  function playFile(url, character, text, myToken, onStart, endOnce) {
    var audio = sharedAudio || (sharedAudio = new Audio());   // elemento RIUSATO: già sbloccato dal gesto (iOS)
    try { audio.pause(); } catch (_) {}
    audio.muted = false; audio.volume = 0.95;
    audio.onplay = function () { if (myToken === token && currentAudio === audio && typeof onStart === 'function') onStart(); };  // currentAudio===audio: dopo la fine naturale è null → niente re-fire dal primer
    audio.onended = function () { if (myToken !== token) return; if (currentAudio === audio) currentAudio = null; endOnce(); };
    audio.onerror = function () { if (myToken !== token) return; if (currentAudio === audio) currentAudio = null; fallbackSpeak(character, text, myToken, endOnce); };
    audio.src = url;
    currentAudio = audio;
    var pr = audio.play();
    if (pr && pr.catch) pr.catch(function () {
      if (myToken !== token) return;
      if (currentAudio === audio) currentAudio = null;
      fallbackSpeak(character, text, myToken, endOnce);  // autoplay bloccato
    });
  }

  /**
   * Pronuncia `text` con la voce di `character`.
   * onStart: quando l'audio parte. onEnd: a fine voce — SEMPRE chiamato una volta.
   */
  function speak(character, text, options) {
    options = options || {};
    var onStart = options.onStart, onEnd = options.onEnd;
    stop();
    var myToken = token;

    var ended = false;
    var endOnce = function () {
      if (ended || myToken !== token) return;
      ended = true;
      if (typeof onEnd === 'function') onEnd();
    };

    if (!text || !String(text).trim()) { endOnce(); return; }

    if (muted) {
      setTimeout(endOnce, estimateMs(text)); // muto: tempo di leggere, poi sblocca
      return;
    }

    var volOpt = options.volume; // (riservato; gli MP3 sono già a volume pieno)

    loadManifest().then(function (manifest) {
      if (myToken !== token) return;
      var file = manifest && manifest[keyOf(character, text)];
      if (file) {
        playFile(VOICES_DIR + file, character, text, myToken, onStart, endOnce);
      } else {
        // Nessun MP3 pre-generato per questa battuta → voce del browser.
        if (typeof onStart === 'function') onStart();
        fallbackSpeak(character, text, myToken, endOnce);
      }
    }).catch(function () {
      fallbackSpeak(character, text, myToken, endOnce);
    });
  }

  // Pre-carica manifest + voci del sintetizzatore (best-effort, non bloccante).
  loadManifest();
  if ('speechSynthesis' in window) { try { window.speechSynthesis.getVoices(); } catch (_) {} }

  return {
    speak: speak,
    stop: stop,
    unlock: unlock,
    setMuted: setMuted,
    isMuted: isMuted,
    isSpeaking: isSpeaking,
  };
})();
