/* =====================================================================
   KEPLER — bande sonore générative (Web Audio, aucun fichier audio).
   Une pièce par phase, qui s'enrichit avec la progression :
     1 Meridian   fa majeur, 84 bpm  : nappe chaude, arpège, puis basse,
                                       clics de clavier, cloches.
     2 Expansion  la mineur, 100 bpm : basse pulsée, arpège rapide et
                                       batterie qui arrivent avec les pays.
     3 L'Ombre    ré mineur, 76 bpm  : bourdon, battements de cœur ; le
                                       Soupçon ouvre le filtre et ajoute
                                       des dissonances.
     4 La Terre   do mineur, 92 bpm  : ostinato mécanique, frappes
                                       métalliques ; il bégaie quand
                                       l'énergie manque.
     5 L'Univers  mi lydien, 60 bpm  : nappes immenses, cloches lointaines ;
                                       les Dérivants désaccordent.
   Plus des bruitages (achats, déblocages, succès, alertes).
   ===================================================================== */
(function () {
  "use strict";
  var A = { ctx: null, master: null, musicBus: null, sfxBus: null, verb: null, delay: null,
    music: false, vol: 0.5, armed: false, timbre: "papier", paused: false, params: { phase: 1 }, cur: null, step: 0, nextT: 0, timer: null, ending: false };
  var NAMES = { 1: "I. Meridian", 2: "II. Expansion", 3: "III. L'Ombre", 4: "IV. La Terre", 5: "V. L'Univers" };
  var NOISE = null;

  /* ---------------- infrastructure ---------------- */
  function ensure() {
    if (A.ctx) return A.ctx;
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    var c; try { c = new C({ latencyHint: "playback" }); } catch (e) { try { c = new C(); } catch (e2) { return null; } }
    A.ctx = c;
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.008; comp.release.value = 0.3;
    A.master = c.createGain(); A.master.gain.value = 0.85; A.master.connect(comp); comp.connect(c.destination);
    A.muffle = c.createBiquadFilter(); A.muffle.type = "lowpass"; A.muffle.frequency.value = 18000; A.muffle.Q.value = 0.4; A.muffle.connect(A.master);
    A.musicBus = c.createGain(); A.musicBus.gain.value = 0; A.musicBus.connect(A.muffle);
    A.sfxBus = c.createGain(); A.sfxBus.gain.value = 0.55; A.sfxBus.connect(A.master);
    A.verb = c.createConvolver(); A.verb.buffer = impulse(c, 3.4, 2.4);
    var vg = c.createGain(); vg.gain.value = 0.5; A.verb.connect(vg); vg.connect(A.musicBus);
    A.delay = c.createDelay(2); A.delay.delayTime.value = 0.357;
    var fb = c.createGain(); fb.gain.value = 0.3;
    var dl = c.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 2200;
    A.delay.connect(dl); dl.connect(fb); fb.connect(A.delay);
    var dg = c.createGain(); dg.gain.value = 0.32; dl.connect(dg); dg.connect(A.musicBus);
    var dv = c.createGain(); dv.gain.value = 0.25; dl.connect(dv); dv.connect(A.verb);
    NOISE = noiseBuffer(c);
    A.analyser = c.createAnalyser(); A.analyser.fftSize = 1024; comp.connect(A.analyser);
    A.out = comp;
    return c;
  }
  function impulse(c, dur, decay) {
    var len = Math.floor(c.sampleRate * dur), b = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  function noiseBuffer(c) { var len = c.sampleRate, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return b; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function hash(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }
  // Une note de l'accord courant, ramenée entre lo et hi (évite les frottements des notes au hasard).
  function tone(ch, lo, hi, r) { var out = []; ch.forEach(function (m) { for (var k = -4; k <= 4; k++) { var n = m + 12 * k; if (n >= lo && n <= hi && out.indexOf(n) < 0) out.push(n); } }); out.sort(function (a, b) { return a - b; }); return out.length ? out[Math.floor(r * out.length) % out.length] : lo; }
  function sendTo(node, dest, amt) { if (!amt) return; var g = A.ctx.createGain(); g.gain.value = amt; node.connect(g); g.connect(dest); }

  /* ---------------- instruments ---------------- */
  function pad(out, notes, t, dur, o) {
    o = o || {}; var c = A.ctx, vol = o.vol || 0.05, att = Math.min(o.att || 1.6, dur / 2), rel = Math.min(o.rel || 2.2, dur / 2);
    var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.cut || 900; f.Q.value = 0.5;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol, t + dur - rel); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(out); sendTo(g, A.verb, o.verb === undefined ? 0.7 : o.verb);
    var det = o.det || 7, n = notes.length, per = 1 / Math.sqrt(n), wave = o.wave || (A.timbre === "labo" ? "triangle" : "sawtooth");
    if (A.timbre === "terminal" && !o.wave) { f.frequency.value *= 0.75; det *= 0.5; }
    notes.forEach(function (m) {
      [-det, det].forEach(function (dt) {
        var os = c.createOscillator(), og = c.createGain(); os.type = wave; os.frequency.value = mtof(m); os.detune.value = dt;
        og.gain.value = per * 0.5; os.connect(og); og.connect(f); os.start(t); os.stop(t + dur + 0.05);
      });
    });
  }
  function pluck(out, m, t, o) {
    o = o || {}; var c = A.ctx, vol = o.vol || 0.05, dec = o.dec || 0.6;
    var os = c.createOscillator(); os.type = o.wave || (A.timbre === "terminal" ? "square" : A.timbre === "labo" ? "sine" : "triangle"); os.frequency.value = mtof(m);
    if (A.timbre === "terminal" && !o.wave) vol *= 0.6;
    var mod = null;
    if (o.fm) { mod = c.createOscillator(); var mg = c.createGain(); mod.frequency.value = mtof(m) * 2; mg.gain.setValueAtTime(mtof(m) * o.fm, t); mg.gain.exponentialRampToValueAtTime(1, t + dec); mod.connect(mg); mg.connect(os.frequency); }
    var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.cut || 2600;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    os.connect(f); f.connect(g); g.connect(out); sendTo(g, A.delay, o.dly === undefined ? 0.25 : o.dly); sendTo(g, A.verb, o.verb === undefined ? 0.3 : o.verb);
    os.start(t); os.stop(t + dec + 0.05); if (mod) { mod.start(t); mod.stop(t + dec + 0.05); }
  }
  function bass(out, m, t, dur, o) {
    o = o || {}; var c = A.ctx, vol = o.vol || 0.09;
    var os = c.createOscillator(); os.type = o.wave || "triangle"; os.frequency.value = mtof(m);
    var sub = c.createOscillator(); sub.type = "sine"; sub.frequency.value = mtof(m);
    var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.cut || 420; f.Q.value = o.q || 1;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.setValueAtTime(vol * 0.8, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(f); sub.connect(f); f.connect(g); g.connect(out);
    os.start(t); sub.start(t); os.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
  }
  function bell(out, m, t, o) {
    o = o || {}; var c = A.ctx, vol = o.vol || 0.035, dec = o.dec || 3.2;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    g.connect(out); sendTo(g, A.verb, o.verb === undefined ? 0.8 : o.verb); sendTo(g, A.delay, o.dly || 0.15);
    [[1, 1], [2.76, 0.35], [5.4, 0.16], [8.93, 0.06]].forEach(function (p) {
      var os = c.createOscillator(), pg = c.createGain(); os.type = "sine"; os.frequency.value = mtof(m) * p[0]; pg.gain.value = p[1];
      os.connect(pg); pg.connect(g); os.start(t); os.stop(t + dec + 0.05);
    });
  }
  function noise(out, t, o) {
    o = o || {}; var c = A.ctx, s = c.createBufferSource(); s.buffer = NOISE;
    var f = c.createBiquadFilter(); f.type = o.type || "highpass"; f.frequency.value = o.freq || 7000; f.Q.value = o.q || 0.7;
    var g = c.createGain(), dec = o.dec || 0.04; g.gain.setValueAtTime(o.vol || 0.03, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    s.connect(f); f.connect(g); g.connect(out); sendTo(g, A.verb, o.verb || 0);
    s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.02);
  }
  function kick(out, t, o) {
    o = o || {}; var c = A.ctx, os = c.createOscillator(), g = c.createGain();
    os.type = "sine"; os.frequency.setValueAtTime(o.f0 || 120, t); os.frequency.exponentialRampToValueAtTime(o.f1 || 42, t + 0.14);
    g.gain.setValueAtTime(o.vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dec || 0.38));
    os.connect(g); g.connect(out); os.start(t); os.stop(t + 0.45);
  }
  function drone(out, notes, o) {
    o = o || {}; var c = A.ctx, t = c.currentTime;
    var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.cut || 260;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol || 0.05, t + 4);
    f.connect(g); g.connect(out); sendTo(g, A.verb, o.verb || 0.4);
    var oscs = [];
    notes.forEach(function (m, i) { var os = c.createOscillator(); os.type = o.wave || "sine"; os.frequency.value = mtof(m); os.detune.value = (i % 2 ? 1 : -1) * 4; os.connect(f); os.start(t); oscs.push(os); });
    var lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = (o.cut || 260) * 0.35; lfo.connect(lg); lg.connect(f.frequency); lfo.start(t); oscs.push(lfo);
    return { oscs: oscs, filter: f, gain: g };
  }

  /* ---------------- les cinq pièces ---------------- */
  // Chaque pièce : tempo, deux suites d'accords (A et B), mesures par accord, et une fonction appelée à chaque
  // double croche. Forme en boucle : A, A, B, puis A dépouillé (sans percussions) pour respirer.
  var SONGS = {
    1: { bpm: 84, bars: 2,
      chords: [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 62]],
      chordsB: [[43, 50, 53, 58], [45, 52, 55, 60], [46, 53, 57, 62], [48, 53, 55, 60]],
      step: function (out, s, bar, ch, t, P, beat, sp) {
        var L = (P.rep > 2e4 || P.serv >= 10 ? 1 : 0) + (P.ver >= 2 ? 1 : 0) + (P.ver >= 3 ? 1 : 0);
        if (s === 0 && bar % 2 === 0) pad(out, ch, t, beat * 8 + 2.2, { vol: 0.06, cut: 1100, att: 1.8, rel: 2.4 });
        if (s % 2 === 0 && s !== 6 && s !== 14 && !(sp && s % 4)) pluck(out, ch[(s / 2) % ch.length] + 12, t, { vol: 0.055, dec: 0.7, fm: 0.6, cut: 2400 });
        if ((L === 0 || sp) && s === 0) bass(out, ch[0] - 12, t, beat * 3.6, { vol: 0.045, cut: 260 });
        if (L >= 1 && !sp && (s === 0 || s === 8)) bass(out, ch[0] - 12, t, beat * 1.8, { vol: 0.08, cut: 380 });
        if (L >= 2 && !sp && (s % 4 === 2 || (s === 15 && bar % 2))) noise(out, t, { freq: 6500, dec: 0.025, vol: 0.016 + 0.006 * hash(bar, s) });
        if (L >= 3 && s === 12 && bar % 2 === 1) bell(out, tone(ch, 72, 86, hash(bar, 7)), t, { vol: 0.03 });
      } },
    2: { bpm: 100, bars: 2,
      chords: [[45, 52, 55, 59], [41, 48, 52, 57], [48, 52, 55, 59], [43, 50, 52, 59]],
      chordsB: [[50, 53, 57, 64], [47, 52, 55, 62], [48, 52, 57, 60], [43, 50, 55, 59]],
      step: function (out, s, bar, ch, t, P, beat, sp) {
        if (s === 0 && bar % 2 === 0) pad(out, ch, t, beat * 8 + 1.8, { vol: 0.045, cut: 1500, att: 1.2 });
        if (s % 2 === 0 && !(sp && s % 8)) bass(out, ch[0] - (s === 0 ? 12 : 0), t, beat * (sp ? 1.6 : 0.42), { vol: s === 0 ? 0.09 : 0.06, cut: 520, wave: "sawtooth", q: 3 });
        if (P.dep >= 3) pluck(out, ch[s % 4] + (s % 8 < 4 ? 12 : 24), t, { vol: 0.026, dec: 0.22, cut: 3200, dly: 0.2 });
        if (P.dep >= 8 && !sp && s % 4 === 2) noise(out, t, { freq: 8000, dec: 0.04, vol: 0.022 });
        if (P.dep >= 14 && !sp && (s === 0 || s === 8)) kick(out, t, { vol: 0.24 });
        if (P.ver >= 6 && s === 0 && bar % 2 === 1) bell(out, tone(ch, 69, 84, hash(bar, 3)), t, { vol: 0.028 });
      } },
    3: { bpm: 76, bars: 2,
      chords: [[50, 57, 64, 65], [46, 53, 57, 64], [43, 50, 58, 62], [45, 52, 55, 61, 58]],
      chordsB: [[46, 53, 58, 62], [43, 50, 55, 58], [51, 55, 58, 63], [45, 52, 55, 61]],
      drone: [26, 33],
      step: function (out, s, bar, ch, t, P, beat, sp) {
        var soup = P.soup || 0;
        if (s === 0 && bar % 2 === 0) pad(out, ch, t, beat * 8 + 2, { vol: 0.05, cut: 380 + soup * 14, det: 9 + soup * 0.25, att: 2.2 });
        if (!sp && (s === 0 || s === 3 || (soup > 50 && (s === 8 || s === 11)))) kick(out, t, { vol: s % 8 === 0 ? 0.2 : 0.12, f0: 90, f1: 38, dec: 0.3 });
        if (soup > 60 && s === 0 && bar % 2 === 0) pad(out, [76, 77], t, beat * 8, { vol: 0.012 * (soup - 60) / 40 + 0.004, cut: 5000, wave: "sine", det: 14, att: 3, verb: 0.9 });
        if ((s === 6 || s === 13) && hash(bar, s) < 0.5) pluck(out, tone(ch, 74, 86, hash(s, bar)), t, { vol: 0.036, dec: 1.3, dly: 0.5, wave: "sine", fm: 1.2 });
        if (P.enq && s % 2 === 1) noise(out, t, { freq: 9000, dec: 0.02, vol: 0.012 });
      },
      live: function (D, P) { if (!D) return; var c = A.ctx, soup = P.soup || 0; D.filter.frequency.setTargetAtTime(200 + soup * 6, c.currentTime, 1.5); D.oscs.forEach(function (o, i) { if (o.detune && i < 2) o.detune.setTargetAtTime((i ? 1 : -1) * (4 + soup * 0.18), c.currentTime, 2); }); } },
    4: { bpm: 92, bars: 2,
      chords: [[48, 55, 63], [44, 51, 60], [41, 48, 56], [43, 50, 59]],
      chordsB: [[51, 55, 58], [46, 53, 58], [41, 48, 56], [43, 50, 53, 59]],
      ost: [0, 0, 12, 0, 0, 7, 0, 12, 0, 0, 12, 0, 3, 0, 7, 0],
      step: function (out, s, bar, ch, t, P, beat, sp) {
        var short = P.rho < 1;
        if (s === 0 && bar % 2 === 0) pad(out, ch, t, beat * 8 + 1.8, { vol: 0.03, cut: 700, wave: "square", det: 5, att: 1 });
        if (!(short && s % 2) && !(sp && s % 4)) bass(out, ch[0] - 12 + this.ost[s], t, beat * 0.22, { vol: 0.05, cut: short ? 320 : 760, wave: "square", q: 4 });
        if (!sp && (s === 3 || s === 7 || s === 10 || s === 14)) noise(out, t, { type: "bandpass", freq: 3200, q: 9, dec: 0.09, vol: 0.06, verb: 0.2 });
        if (s === 12) noise(out, t, { type: "bandpass", freq: 1800, q: 6, dec: 0.12, vol: 0.05, verb: 0.3 });
        if (P.drones >= 100 && !sp && s % 4 === 0) kick(out, t, { vol: 0.26 });
        if (P.fab >= 5 && s % 2 === 1 && hash(bar, s) < 0.6) pluck(out, ch[(s >> 1) % ch.length] + 24, t, { vol: 0.022, dec: 0.16, cut: 4000, wave: "square" });
      } },
    5: { bpm: 60, bars: 4,
      chords: [[40, 47, 56, 63, 70], [36, 43, 52, 59], [33, 40, 47, 49, 56], [35, 42, 51, 56, 63]],
      chordsB: [[42, 49, 54, 58, 64], [44, 51, 56, 59, 63], [37, 44, 52, 56, 59], [40, 47, 54, 56, 63]],
      drone: [28],
      step: function (out, s, bar, ch, t, P, beat, sp) {
        if (s === 0 && bar % 4 === 0) pad(out, ch, t, beat * 20, { vol: 0.065, cut: 1700, att: 4.5, rel: 5, det: 8, verb: 0.95 });
        if ((s === 0 || s === 6 || s === 10) && hash(bar, s) < (sp ? 0.3 : 0.55)) bell(out, tone(ch, 64, 84, hash(s, bar)), t, { vol: 0.034, dec: 5, dly: 0.3 });
        if (P.probes > 1e6 && s === 0 && bar % 4 === 2) pad(out, [88, 95], t, beat * 12, { vol: 0.008, cut: 8000, wave: "sine", det: 12, att: 4, verb: 1 });
        if (P.drift && !sp && (s === 4 || s === 12)) pluck(out, 65, t, { vol: 0.018, dec: 0.5, wave: "square", cut: 1500, dly: 0.4 });
      } }
  };

  /* ---------------- ordonnanceur ---------------- */
  function beatLen(p) { return 60 / SONGS[p].bpm; }
  function startPhase(p) {
    var c = A.ctx; if (!c || !SONGS[p]) return;
    var t = c.currentTime;
    if (A.cur) {
      var old = A.cur; old.out.gain.cancelScheduledValues(t); old.out.gain.setValueAtTime(old.out.gain.value, t); old.out.gain.linearRampToValueAtTime(0.0001, t + 3);
      if (old.drone) old.drone.oscs.forEach(function (o) { try { o.stop(t + 3.2); } catch (e) {} });
      setTimeout(function () { try { old.out.disconnect(); } catch (e) {} }, 4000);
    }
    var out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + 3); out.connect(A.musicBus);
    var song = SONGS[p];
    A.cur = { phase: p, out: out, drone: song.drone ? drone(out, song.drone, { vol: p === 5 ? 0.06 : 0.05, cut: p === 5 ? 180 : 260 }) : null };
    A.step = 0; A.nextT = t + 0.15;
    if (A.delay) A.delay.delayTime.setTargetAtTime(beatLen(p) * 0.75, t, 0.5);
  }
  function schedule() {
    if (!A.ctx || !A.music || A.ending) return;
    var p = A.params.phase || 1; if (!SONGS[p]) p = 1;
    if (!A.cur || A.cur.phase !== p) startPhase(p);
    var c = A.ctx, song = SONGS[A.cur.phase], ahead = c.currentTime + 0.35, guard = 0;
    if (A.nextT < c.currentTime - 1) A.nextT = c.currentTime + 0.05; // reprise après une pause
    while (A.nextT < ahead && guard++ < 64) {
      var n = A.step, s = n % 16, bar = Math.floor(n / 16), nc = song.chords.length, ci = Math.floor(bar / song.bars) % nc;
      var sect = Math.floor(bar / (song.bars * nc)) % 4, prog = sect === 2 && song.chordsB ? song.chordsB : song.chords;
      try { song.step(A.cur.out, s, bar, prog[ci], A.nextT, A.params, beatLen(A.cur.phase), sect === 3); } catch (e) { A.errs = (A.errs || 0) + 1; A.lastErr = String(e); }
      A.nextT += beatLen(A.cur.phase) / 4; A.step++;
    }
  }
  function live() { if (!A.cur) return; var song = SONGS[A.cur.phase]; if (song && song.live && A.cur.drone) try { song.live(A.cur.drone, A.params); } catch (e) {} }
  function setMuffle() { if (!A.ctx) return; A.muffle.frequency.setTargetAtTime(A.paused ? 700 : 18000, A.ctx.currentTime, A.paused ? 0.25 : 0.6); }
  function endChord() {
    if (!A.ctx || !A.music) return; var c = A.ctx, t = c.currentTime, song = SONGS[(A.cur && A.cur.phase) || 1];
    pad(A.musicBus, song.chords[0], t, 9, { vol: 0.05, cut: 1800, att: 1, rel: 6, verb: 1 });
    bell(A.musicBus, song.chords[0][0] + 24, t + 0.3, { vol: 0.04, dec: 7 });
    if (A.cur) A.cur.out.gain.setTargetAtTime(0.0001, t, 1.2);
    var cur = A.cur; setTimeout(function () { if (A.ending && A.cur === cur && cur) { if (cur.drone) cur.drone.oscs.forEach(function (o) { try { o.stop(); } catch (e) {} }); try { cur.out.disconnect(); } catch (e) {} A.cur = null; } }, 10000);
  }
  function setBus() {
    if (!A.ctx) return; var t = A.ctx.currentTime;
    A.musicBus.gain.cancelScheduledValues(t); A.musicBus.gain.setValueAtTime(A.musicBus.gain.value, t);
    A.musicBus.gain.linearRampToValueAtTime(A.music ? Math.max(0.0001, A.vol * 1.2) : 0.0001, t + (A.music ? 2 : 0.8));
  }
  function resume() { if (A.ctx && A.ctx.state === "suspended" && !document.hidden) { try { A.ctx.resume(); } catch (e) {} } }
  function run() { if (!A.timer) A.timer = setInterval(schedule, 60); }

  /* ---------------- bruitages ---------------- */
  function blip(out, f, t, dur, wave, vol, f2) {
    var c = A.ctx, os = c.createOscillator(), g = c.createGain(); os.type = wave || "sine"; os.frequency.setValueAtTime(f, t); if (f2) os.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol || 0.06, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(g); g.connect(out); os.start(t); os.stop(t + dur + 0.05);
  }
  function playSfx(kind) {
    if (!A.armed) return; var c = ensure(); if (!c) return; resume(); var t = c.currentTime + 0.01, o = A.sfxBus;
    switch (kind) {
      case "buy": blip(o, 1250, t, 0.06, "triangle", 0.05); noise(o, t, { freq: 5000, dec: 0.02, vol: 0.025 }); break;
      case "unlock": blip(o, mtof(76), t, 0.3, "sine", 0.06); blip(o, mtof(83), t + 0.07, 0.4, "sine", 0.05); break;
      case "ach": [72, 76, 79, 84].forEach(function (m, i) { bell(o, m, t + i * 0.07, { vol: 0.04, dec: 1.4, verb: 0.3, dly: 0.05 }); }); break;
      case "phase": [48, 55, 60, 64, 67, 72].forEach(function (m, i) { bell(o, m, t + i * 0.05, { vol: 0.035, dec: 3, verb: 0.6, dly: 0.1 }); }); break;
      case "warn": blip(o, 196, t, 0.18, "square", 0.04); blip(o, 185, t + 0.2, 0.22, "square", 0.04); break;
      case "q": blip(o, 600, t, 0.18, "sine", 0.05, 1800); break;
      case "bad": blip(o, 240, t, 0.35, "sawtooth", 0.035, 80); break;
      default: blip(o, 880, t, 0.12, "sine", 0.05);
    }
  }

  /* ---------------- interface publique ---------------- */
  window.KeplerAudio = {
    // À appeler pendant un geste du joueur (clic, touche) : les navigateurs refusent le son avant.
    unlock: function () { A.armed = true; var c = ensure(); if (!c) return; resume(); setBus(); setMuffle(); if (A.music) run(); },
    setMusic: function (on) { A.music = !!on; if (!A.armed) return; var c = ensure(); if (!c) return; resume(); if (A.music) run(); setBus(); },
    setVolume: function (v) { A.vol = Math.max(0, Math.min(1, +v || 0)); setBus(); },
    setTimbre: function (t) { A.timbre = t || "papier"; },
    sfx: function (kind) { try { playSfx(kind); } catch (e) {} },
    update: function (p) {
      if (!p) return; A.params = p;
      if (!!p.paused !== A.paused) { A.paused = !!p.paused; setMuffle(); }
      if (p.ended && !A.ending) { A.ending = true; endChord(); }
      else if (!p.ended && A.ending) { A.ending = false; if (A.cur) A.cur.phase = 0; }
      live();
    },
    trackName: function (p) { return NAMES[p] || ""; },
    _stream: function () { if (!A.ctx) return null; var d = A.ctx.createMediaStreamDestination(); A.out.connect(d); return d.stream; }, // pour les tests (enregistrement)
    level: function (peak) { if (!A.analyser) return 0; var d = new Float32Array(A.analyser.fftSize); A.analyser.getFloatTimeDomainData(d); var s = 0, m = 0; for (var i = 0; i < d.length; i++) { s += d[i] * d[i]; m = Math.max(m, Math.abs(d[i])); } return peak ? m : Math.sqrt(s / d.length); },
    get state() { return { armed: A.armed, ready: !!A.ctx, ctx: A.ctx ? A.ctx.state : "none", music: A.music, vol: A.vol, phase: A.cur ? A.cur.phase : 0, step: A.step, ending: A.ending, paused: A.paused, timbre: A.timbre, errs: A.errs || 0, lastErr: A.lastErr || "" }; }
  };
  document.addEventListener("visibilitychange", function () {
    if (!A.ctx) return;
    if (document.hidden) { try { A.ctx.suspend(); } catch (e) {} } else resume();
  });
})();
