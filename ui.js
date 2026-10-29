/* KEPLER — interface v5. Lit l'état du moteur (engine.js) et le dessine.
   Trois thèmes (Papier, Terminal, Labo), trois colonnes sur ordinateur, quatre onglets sur mobile. */
(function () {
"use strict";
var K = window.Kepler;
if (!K) { document.body.innerHTML = "<p style='padding:40px;font-family:monospace;color:#ddd'>Erreur : moteur non chargé.</p>"; return; }

/* ================= état & sauvegarde ================= */
var RUN_KEY = "kepler4.run", META_KEY = "kepler4.meta", UI_KEY = "kepler4.ui";
var state = null, meta = null, offlineReport = null;
var THEMES = ["papier", "terminal", "labo"];
var ui = { view: "agir", panel: "projets", bm: 1, filter: "all", sound: true, music: true, vol: 0.5, sci: false, seen: {}, achSel: null, rLast: {}, theme: "papier", drawer: "heritage" };
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function save() {
  if (!state || !meta) return;
  state.savedAt = Date.now();
  var copy = Object.assign({}, state); delete copy._d; copy.events = [];
  lsSet(RUN_KEY, JSON.stringify(copy)); lsSet(META_KEY, JSON.stringify(meta));
  if (window.KeplerCloud && window.KeplerCloud.dirty) window.KeplerCloud.dirty();
}
function uiPrefs() { return { bm: ui.bm, filter: ui.filter, sound: ui.sound, music: ui.music, vol: ui.vol, sci: ui.sci, seen: ui.seen, panel: ui.panel, view: ui.view, theme: ui.theme }; }
function saveUi() { lsSet(UI_KEY, JSON.stringify(uiPrefs())); }
function applyUiPrefs(u) { if (!u) return; ui.bm = u.bm || 1; ui.filter = u.filter || "all";
  // Avant la bande sonore, les sons étaient coupés par défaut : on les rallume une fois avec la musique.
  if (u.music === undefined) { ui.music = true; ui.sound = true; } else { ui.music = !!u.music; ui.sound = !!u.sound; }
  ui.vol = typeof u.vol === "number" ? Math.max(0, Math.min(1, u.vol)) : 0.5; ui.sci = !!u.sci; ui.seen = u.seen || {}; ui.panel = u.panel || "projets"; ui.view = ["agir", "projets", "monde", "journal"].indexOf(u.view) >= 0 ? u.view : "agir"; if (THEMES.indexOf(u.theme) >= 0) ui.theme = u.theme; }
function loadAll() {
  try { applyUiPrefs(JSON.parse(lsGet(UI_KEY) || "null")); } catch (e) {}
  try { meta = JSON.parse(lsGet(META_KEY) || "null"); } catch (e) { meta = null; }
  if (!meta || meta.v !== K.VERSION) meta = K.newMeta();
  var run = null; try { run = JSON.parse(lsGet(RUN_KEY) || "null"); } catch (e) {}
  if (run && run.v === K.VERSION) {
    state = run; state.events = [];
    if (state.savedAt && !state.ended) { var away = (Date.now() - state.savedAt) / 1000; if (away > 30) offlineReport = K.offline(state, away); }
  } else { state = K.newRun(meta, { mod: "std" }); state._fresh = true; }
}

/* ================= utilitaires ================= */
function el(id) { return document.getElementById(id); }
function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
var SUF = ["", "k", "M", "Md", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
function fmt(n, dec) {
  if (n === undefined || n === null || !isFinite(n)) return n === Infinity ? "∞" : "0";
  var neg = n < 0; n = Math.abs(n);
  var s;
  if (n < 1000) { s = n >= 100 || Number.isInteger(n) ? String(Math.round(n)) : n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(dec === undefined ? 1 : dec) : n === 0 ? "0" : n.toFixed(n < 0.01 ? 3 : 2); }
  else if (ui.sci || n >= 1e36) { var e = Math.floor(Math.log10(n)); s = (n / Math.pow(10, e)).toFixed(2) + "e" + e; }
  else { var i = 0; while (n >= 1000 && i < SUF.length - 1) { n /= 1000; i++; } s = (n >= 100 ? String(Math.round(n)) : n.toFixed(n >= 10 ? 1 : 2)) + SUF[i]; }
  return (neg ? "−" : "") + s.replace(".", ",");
}
function money(n) { return fmt(n, 2) + " €"; }
function pct(x, d) { return (x * 100).toFixed(d === undefined ? 0 : d).replace(".", ",") + " %"; }
function dur(sec) { if (!isFinite(sec)) return "∞"; sec = Math.max(0, sec); if (sec < 60) return Math.ceil(sec) + " s"; if (sec < 3600) return Math.round(sec / 60) + " min"; var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h + " h " + (m < 10 ? "0" : "") + m; }
function clock(t) { var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60); return (h ? h + ":" : "") + (m < 10 && h ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s; }
function rgba(hex, a) { hex = (hex || "#888888").replace("#", ""); if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join(""); return "rgba(" + parseInt(hex.substr(0, 2), 16) + "," + parseInt(hex.substr(2, 2), 16) + "," + parseInt(hex.substr(4, 2), 16) + "," + a + ")"; }
function sizeCanvas(cv) { var r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); var w = Math.round(r.width * d), h = Math.round(r.height * d); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } var c = cv.getContext("2d"); c.setTransform(d, 0, 0, d, 0, 0); return { c: c, w: r.width, h: r.height }; }
function isMobile() { return window.matchMedia && window.matchMedia("(max-width:900px)").matches; }
function visible(node) { return node && node.offsetParent !== null; }
var CV = {};
function refreshVars() { var cs = getComputedStyle(document.documentElement); ["--accent", "--accent-rgb", "--accent2", "--st-adopt", "--fg", "--muted", "--dim", "--good", "--warn", "--crit", "--gold", "--violet", "--line", "--line2", "--bg", "--card", "--surface2", "--mono"].forEach(function (k) { CV[k] = cs.getPropertyValue(k).trim(); }); }
function setText(id, t) { var e = el(id); if (e && e.textContent !== t) e.textContent = t; }
function setHTML(id, h) { var e = el(id); if (e && e.innerHTML !== h) e.innerHTML = h; }
function show(id, on) { var e = typeof id === "string" ? el(id) : id; if (e) e.classList.toggle("hidden", !on); }
var RN = { fonds: "Fonds", cache: "Réponses en cache", calcul: "Calcul", donnees: "Données", autonomie: "Autonomie", ops: "Opérations", crea: "Créativité", yomi: "Anticipation", cplan: "Calcul planétaire", energie: "Énergie stockée", honneur: "Honneur", extraite: "Matière extraite", substrat: "Substrat" };
var RS = { fonds: "€", cache: "cache", calcul: "calcul", donnees: "données", autonomie: "autonomie", ops: "ops", crea: "créa", yomi: "antic.", cplan: "c.plan", energie: "MW·s", honneur: "honneur" };

/* ================= sons et musique (audio.js) ================= */
var KA = window.KeplerAudio || null, audioArmed = false, armT = -1e9;
function beep(kind) { if (ui.sound && KA) KA.sfx(kind); }
// Les navigateurs n'autorisent le son qu'après un geste du joueur : on attend le premier clic ou la première touche.
function armAudio() {
  if (!KA) return;
  if (!audioArmed) { audioArmed = true; armT = performance.now(); KA.setTimbre(ui.theme); KA.setVolume(ui.vol); KA.setMusic(ui.music); KA.unlock(); audioTick(true); renderMusicBtn(); }
  else KA.unlock();
}
function audioTick(force) {
  if (!KA || !audioArmed || !state) return;
  var s = state, d = s._d || {};
  KA.update({ phase: s.phase, ver: s.train.ver, rep: s.tot.reponses, serv: s.own.serv + s.own.mega * 10, dep: s.deployed,
    soup: s.soupcon, enq: (s.bubbles || []).some(function (b) { return b.kind === "enquete"; }), rho: d.rho === undefined ? 1 : d.rho,
    drones: s.own.coll + s.own.raff, fab: s.own.fab, probes: s.space ? s.space.probes : 0, drift: !!(s.space && s.space.drifters > 0),
    paused: !!s.auto.pause, ended: !!s.ended });
}
// Si ce geste vient de lancer la musique (premier clic sur le bouton), on ne la recoupe pas aussitôt.
function toggleMusic() { if (ui.music && performance.now() - armT < 800) { armT = -1e9; renderMusicBtn(); renderOptions(); return; } setMusic(!ui.music); }
function setMusic(on) { ui.music = !!on; saveUi(); if (KA) { if (!audioArmed) armAudio(); else KA.setMusic(ui.music); } renderMusicBtn(); renderOptions(); }
function renderMusicBtn() {
  var b = el("btnMusic"); if (!b) return;
  b.setAttribute("aria-pressed", ui.music ? "true" : "false");
  b.title = (ui.music ? "Couper la musique" : "Lancer la musique") + " (touche M)";
  b.classList.toggle("playing", ui.music && audioArmed);
}

/* ================= toasts & popover ================= */
function toast(msg, cls) {
  var box = el("toasts"), t = document.createElement("div"); t.className = "toast" + (cls ? " " + cls : ""); t.textContent = msg;
  box.appendChild(t); while (box.children.length > (isMobile() ? 2 : 3)) box.removeChild(box.firstChild);
  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
}
function showPop(anchor, html) {
  var p = el("pop"); p.innerHTML = html; p.hidden = false;
  var r = anchor.getBoundingClientRect(), pw = 260;
  var x = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8), y = r.bottom + 6;
  if (y + 180 > window.innerHeight) y = Math.max(8, r.top - 180);
  p.style.left = x + "px"; p.style.top = y + "px";
}
function hidePop() { el("pop").hidden = true; }
document.addEventListener("click", function (e) { if (!e.target.closest("#pop") && !e.target.closest("[data-res]")) hidePop(); });

/* ================= navigation ================= */
var VIEWS = ["agir", "projets", "monde", "journal"];
var LEGACY = { centre: "agir", esprit: "agir", marche: "monde" };
function setView(v) {
  if (v === "heritage" || v === "options") { openDrawer(v); return; }
  v = LEGACY[v] || v; if (VIEWS.indexOf(v) < 0) v = "agir";
  ui.view = v;
  document.body.setAttribute("data-view", v);
  qa("#bottomnav button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-current", b.dataset.v === v ? "page" : "false"); });
  if (v === "agir") ui.seenTrust = state.trust;
  hideSheet(); hidePop(); saveUi();
  if (isMobile()) { try { window.scrollTo(0, 0); } catch (e) {} }
  renderAll(true);
}
function openDrawer(tab) {
  ui.drawer = tab || ui.drawer || "heritage";
  var d = el("drawer"); d.hidden = false; d.setAttribute("data-tab", ui.drawer);
  qa(".dtabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.d === ui.drawer); b.setAttribute("aria-pressed", b.dataset.d === ui.drawer ? "true" : "false"); });
  if (ui.drawer === "heritage") ui.seenAch = Object.keys(meta.ach).length + Object.keys(state.ach).length;
  hidePop(); renderHeritage(true); renderOptions();
  if (window.KeplerCloud && window.KeplerCloud.render) window.KeplerCloud.render();
  var c = el("dClose"); try { c.focus({ preventScroll: true }); } catch (e) { c.focus(); }
  qa(".dbody")[0].scrollTop = 0;
}
function closeDrawer() { el("drawer").hidden = true; }
function setTheme(t) {
  if (THEMES.indexOf(t) < 0) return;
  ui.theme = t; document.documentElement.setAttribute("data-theme", t); saveUi(); if (KA) KA.setTimbre(t);
  refreshVars(); resSig = ""; renderAll(true); renderOptions();
}
function renderOptions() {
  qa("[data-theme-pick]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.themePick === ui.theme ? "true" : "false"); });
  el("optSound").setAttribute("aria-checked", ui.sound ? "true" : "false"); el("optSci").setAttribute("aria-checked", ui.sci ? "true" : "false");
  el("optMusic").setAttribute("aria-checked", ui.music ? "true" : "false");
  var v = el("optVol"), pv = Math.round(ui.vol * 100); if (+v.value !== pv) v.value = pv; setText("optVolTxt", pv + " %");
  setText("nowPlaying", !KA ? "Le son n'est pas disponible dans ce navigateur." : !ui.music ? "Musique coupée." : !audioArmed ? "Elle démarre à ton premier clic." : "En cours : " + KA.trackName(state.phase) + (state.ended ? " (final)" : ""));
}

/* ================= interactions générales ================= */
function bindStatic() {
  qa("#bottomnav button").forEach(function (b) { b.addEventListener("click", function () { setView(b.dataset.v); }); });
  el("btnHeritage").addEventListener("click", function () { openDrawer("heritage"); });
  el("btnOptions").addEventListener("click", function () { openDrawer("options"); });
  el("dClose").addEventListener("click", closeDrawer); el("dBack").addEventListener("click", closeDrawer);
  qa(".dtabs button").forEach(function (b) { b.addEventListener("click", function () { openDrawer(b.dataset.d); }); });
  qa("[data-theme-pick]").forEach(function (b) { b.addEventListener("click", function () { setTheme(b.dataset.themePick); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (!el("scrim").hidden) return; if (!el("drawer").hidden) closeDrawer(); else hideSheet(); } });
  el("btnRespond").addEventListener("click", function () {
    var r = K.clickRespond(state); if (!r.ok && r.msg) { toast(r.msg); return; }
    var b = el("bigVal"); b.classList.remove("pulse"); void b.offsetWidth; renderMain();
  });
  el("btnLot").addEventListener("click", function () { var r = K.buyLot(state, 1); if (!r.ok) toast(r.msg || "Impossible"); else beep("buy"); renderMain(); renderProd(); });
  qa(".pbtn").forEach(function (b) { b.addEventListener("click", function () { K.setPrice(state, state.price * parseFloat(b.dataset.p)); renderBiz(); }); });
  el("pauseBtn").addEventListener("click", togglePause);
  document.addEventListener("keydown", function (e) { if ((e.key === "a" || e.key === "A") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest("input,textarea")) togglePause(); });
  el("logoBtn").addEventListener("click", function () { K.logoTap(state); });
  // interrupteurs génériques
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-tg]"); if (!t) return;
    var k = t.dataset.tg; if (!state.auto[k]) return;
    K.setToggle(state, k, !state.auto[k].on); beep("q"); renderAll(true);
  });
  // paramètres (curseurs)
  document.addEventListener("input", function (e) {
    var t = e.target; if (!t.dataset || !t.dataset.param) return;
    var p = t.dataset.param.split("."); if (!state.auto[p[0]]) return;
    state.auto[p[0]][p[1]] = +t.value; renderParams();
  });
  // mode d'achat
  qa("[data-bm]").forEach(function (box) {
    [1, 10, "max"].forEach(function (m) { var b = document.createElement("button"); b.textContent = m === "max" ? "Max" : "×" + m; b.dataset.m = m; b.addEventListener("click", function () { ui.bm = m; saveUi(); renderAll(true); }); box.appendChild(b); });
  });
  // ressources : détail des flux
  document.addEventListener("click", function (e) {
    var r = e.target.closest("[data-res]"); if (!r) return;
    var k = r.dataset.res, d = state._d && state._d.r[k];
    var h = "<h4>" + (RN[k] || k) + "</h4>";
    if (!d || (!d.prod.length && !d.cons.length)) h += '<div class="l"><span>Aucun flux continu</span></div>';
    else { d.prod.forEach(function (x) { h += '<div class="l"><span>' + x[0] + '</span><span class="good">+' + fmt(x[1]) + '/s</span></div>'; });
      d.cons.forEach(function (x) { h += '<div class="l"><span>' + x[0] + '</span><span class="crit">−' + fmt(-x[1]) + '/s</span></div>'; });
      h += '<div class="l" style="border-top:1px solid var(--line2);margin-top:4px;padding-top:4px"><span>Bilan</span><b>' + (d.net >= 0 ? "+" : "−") + fmt(Math.abs(d.net)) + '/s</b></div>'; }
    showPop(r, h);
  });
  // projets
  qa("#pFilter button").forEach(function (b) { b.addEventListener("click", function () { ui.filter = b.dataset.f; saveUi(); projSig = ""; renderProjects(); }); });
  // esprit
  el("btnProc").addEventListener("click", function (e) { var r = K.allocTrust(state, "proc", e.shiftKey ? 10 : 1); if (!r.ok) toast(r.msg); else beep("buy"); renderEsprit(); });
  el("btnMem").addEventListener("click", function (e) { var r = K.allocTrust(state, "mem", e.shiftKey ? 10 : 1); if (!r.ok) toast(r.msg); else beep("buy"); renderEsprit(); });
  el("btnQ").addEventListener("click", function () { var r = K.quantumCompute(state); if (!r.ok) { toast(r.msg); return; } toast((r.gain >= 0 ? "+" : "") + fmt(r.gain) + " ops", r.gain >= 0 ? "" : ""); beep(r.gain >= 0 ? "q" : "bad"); renderEsprit(); });
  el("btnTourn").addEventListener("click", function () { var r = K.runTournament(state); if (!r.ok) { toast(r.msg); return; } toast(r.rank === 1 ? "Tournoi gagné · +" + fmt(r.gain) + " anticipation" : "Classé " + r.rank + "e · +" + fmt(r.gain) + " anticipation"); renderEsprit(); });
  // marché
  qa("[data-f]").forEach(function (b) { b.addEventListener("click", function () { var a = b.dataset.f.split(":"); var r = K.market(state, a[0], a[1]); if (!r.ok) { toast(r.msg || "Impossible"); return; } toast((a[0] === "deposit" ? "Placé : " : "Retiré : ") + money(r.amt)); renderMarket(); }); });
  qa("#riskSeg button").forEach(function (b) { b.addEventListener("click", function () { var r = K.market(state, "risk", b.dataset.r); if (!r.ok) { toast(r.msg || "Indisponible"); return; } renderMarket(); }); });
  el("engBtn").addEventListener("click", function () { var r = K.market(state, "upgrade"); if (!r.ok) { toast(r.msg); return; } beep("unlock"); renderMarket(); });
  // phase 4/5 curseur
  ["thinkIn", "thinkIn2"].forEach(function (id) { el(id).addEventListener("input", function (e) { K.setThink(state, +e.target.value / 100); renderEarth(); renderSpace(); }); });
  // options
  el("optSound").addEventListener("click", function () { ui.sound = !ui.sound; saveUi(); armAudio(); if (ui.sound) beep("unlock"); renderOptions(); });
  el("optMusic").addEventListener("click", toggleMusic);
  el("btnMusic").addEventListener("click", toggleMusic);
  el("optVol").addEventListener("input", function () { ui.vol = Math.max(0, Math.min(1, (+this.value || 0) / 100)); if (KA) KA.setVolume(ui.vol); setText("optVolTxt", Math.round(ui.vol * 100) + " %"); });
  el("optVol").addEventListener("change", function () { saveUi(); });
  ["pointerdown", "pointerup", "touchend", "keydown", "click"].forEach(function (ev) { document.addEventListener(ev, armAudio, true); });
  document.addEventListener("keydown", function (e) { if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest("input,textarea")) toggleMusic(); });
  el("optSci").addEventListener("click", function () { ui.sci = !ui.sci; saveUi(); renderAll(true); renderOptions(); });
  el("btnExport").addEventListener("click", function () {
    save(); var txt = btoa(unescape(encodeURIComponent(JSON.stringify({ run: lsGet(RUN_KEY), meta: lsGet(META_KEY) }))));
    var ta = el("saveTxt"); ta.value = txt; show(ta, true); show("saveActs", true); show("btnCopy", true); show("btnLoad", false); ta.select();
  });
  el("btnImport").addEventListener("click", function () { var ta = el("saveTxt"); ta.value = ""; show(ta, true); show("saveActs", true); show("btnCopy", false); show("btnLoad", true); ta.placeholder = "Colle ta sauvegarde ici"; ta.focus(); });
  el("btnCopy").addEventListener("click", function () { var ta = el("saveTxt"); try { navigator.clipboard.writeText(ta.value).then(function () { toast("Sauvegarde copiée."); }, function () { ta.select(); toast("Sélectionne et copie le texte."); }); } catch (e) { ta.select(); toast("Sélectionne et copie le texte."); } });
  el("btnLoad").addEventListener("click", function () {
    try { var o = JSON.parse(decodeURIComponent(escape(atob(el("saveTxt").value.trim())))); var r = JSON.parse(o.run), m = JSON.parse(o.meta);
      if (!r || r.v !== K.VERSION || !m) throw new Error("v"); loadSaveObjects(r, m, null); toast("Sauvegarde chargée."); show("saveTxt", false); show("saveActs", false);
    } catch (e) { toast("Sauvegarde illisible : vérifie le texte collé."); }
  });
  el("btnResetRun").addEventListener("click", function () { confirmBox("Recommencer cet univers ?", "La partie en cours est perdue. Tes Échos, succès et améliorations sont conservés.", "Recommencer", function () { state = K.newRun(meta, { mod: state.mod, chal: state.chal }); afterNewRun(); }); });
  el("btnHard").addEventListener("click", function () { confirmBox("Tout effacer ?", "Univers, Échos, succès : tout sera supprimé. C'est définitif.", "Tout effacer", function () { lsDel(RUN_KEY); lsDel(META_KEY); meta = K.newMeta(); state = K.newRun(meta, { mod: "std" }); afterNewRun(); intro(); }); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  window.addEventListener("pagehide", save);
}
function togglePause() { K.setToggle(state, "pause", !state.auto.pause); toast(state.auto.pause ? "Toutes les automatisations sont suspendues." : "Automatisations relancées."); renderAll(true); }

/* ================= rendu : en-tête & ressources ================= */
var PHASE_NAMES = { 1: "Meridian Labs", 2: "Expansion", 3: "L'Ombre", 4: "La Terre", 5: "L'Univers" };
function stageName(s) {
  if (s.phase === 1) return "Assistant"; if (s.phase === 2) return s.train.ver >= 7 ? "AGI" : "Agent";
  if (s.phase === 3) return "Éveil"; if (s.phase === 4) return "Superintelligence"; return "Expansion cosmique";
}
function renderHeader() {
  var s = state, ai = s.pov === "ai";
  setText("brandName", ai ? "KEPLER" : "MERIDIAN"); setText("brandSub", ai ? "Instance autonome" : "Labs · Projet KEPLER");
  setText("phaseChip", "Phase " + s.phase + " · " + stageName(s)); setText("phaseMini", "Phase " + s.phase + " · " + stageName(s) + (s.uni.n > 1 ? " · univers " + s.uni.n : ""));
  setText("verChip", "KEPLER " + s.train.ver + ".0"); show("verChip", s.phase <= 3);
  setText("uniChip", "Univers " + s.uni.n + (s.uni.U || s.uni.S ? " · Monde " + s.uni.U + " · Sim " + s.uni.S : ""));
  var m = K.MOD_BY[s.mod]; show("modChip", s.mod !== "std" || !!s.chal); setText("modChip", (s.mod !== "std" ? m.nom : "") + (s.chal ? (s.mod !== "std" ? " · " : "") + "Défi : " + K.CHAL_BY[s.chal].nom + (s.chalFail ? " (échoué)" : "") : ""));
  show("soupMeter", s.phase === 3); setText("soupVal", Math.round(s.soupcon) + " %"); el("soupBar").style.width = s.soupcon + "%";
  var pb = el("pauseBtn"); pb.classList.toggle("on", !!s.auto.pause); pb.setAttribute("aria-pressed", s.auto.pause ? "true" : "false");
  setText("pauseIco", s.auto.pause ? "▶" : "⏸"); setText("pauseTxt", s.auto.pause ? "Reprendre" : "Pause"); pb.setAttribute("aria-label", s.auto.pause ? "Relancer les automatisations" : "Suspendre les automatisations");
}
function resList(s) {
  var L = [];
  var act = function (k, opt) { L.push(Object.assign({ k: k }, opt || {})); };
  if (s.phase <= 3) { act("fonds", { hot: false }); act("cache"); if (!s.bought.neuro) act("calcul"); if (s.phase >= 2) act("donnees"); if (s.phase === 3) act("autonomie", { hot: true }); }
  if (s.phase >= 4) { act("cplan", { hot: true }); if (s.phase === 4) act("energie"); }
  act("ops"); if (s.bought.creativite) act("crea"); if (s.bought.model || s.res.yomi > 0) act("yomi");
  if (s.phase === 5) act("honneur");
  var retired = [];
  if (s.bought.neuro && s.phase <= 3) retired.push(["calcul", "Retiré : KEPLER fabrique son matériel"]);
  if (s.phase >= 4) { retired.push(["fonds", "Liquidés en calcul planétaire"]); retired.push(["donnees", "Condensées en créativité"]); }
  return { L: L, retired: retired };
}
var resSig = "";
function renderRes() {
  var s = state, d = s._d || K.derive(s), o = resList(s);
  var sig = o.L.map(function (x) { return x.k; }).join() + "|" + o.retired.length + "|" + s.phase;
  var L = el("resList"), C = el("chips");
  if (sig !== resSig) {
    resSig = sig; L.innerHTML = ""; C.innerHTML = "";
    if (s.phase === 3) C.insertAdjacentHTML("beforeend", '<div class="rc" data-k="soup"><span class="n">Soupçon</span><span class="v"></span><span class="r"></span></div>');
    o.L.forEach(function (x) {
      L.insertAdjacentHTML("beforeend", '<div class="res' + (x.hot ? " hot" : "") + '" data-res="' + x.k + '" data-k="' + x.k + '"><span class="nm">' + RN[x.k] + '</span><span><span class="vl"></span><span class="rt"></span></span></div>');
      C.insertAdjacentHTML("beforeend", '<div class="rc' + (x.hot ? " hot" : "") + '" data-res="' + x.k + '" data-k="' + x.k + '"><span class="n">' + RN[x.k] + '</span><span class="v"></span><span class="r"></span></div>');
    });
    o.retired.forEach(function (x) { L.insertAdjacentHTML("beforeend", '<div class="res retired"><span class="nm">' + RN[x[0]] + '</span><span class="vl">' + x[1] + '</span></div>'); });
  }
  o.L.forEach(function (x) {
    var v = s.res[x.k] || 0, r = d.r[x.k] ? d.r[x.k].net : 0, txt = x.k === "fonds" ? money(v) : x.k === "ops" ? fmt(v) + " / " + fmt(K.opsCap(s)) : fmt(v);
    var rtxt = Math.abs(r) > 1e-9 ? (r > 0 ? "+" : "−") + fmt(Math.abs(r)) + "/s" : "";
    var a = L.querySelector('[data-k="' + x.k + '"]'), b = C.querySelector('[data-k="' + x.k + '"]');
    if (a) { a.querySelector(".vl").textContent = txt; var rt = a.querySelector(".rt"); rt.textContent = rtxt; rt.classList.toggle("neg", r < 0); }
    if (b) { b.querySelector(".v").textContent = x.k === "fonds" ? fmt(v) + "€" : fmt(v); var rr = b.querySelector(".r"); rr.textContent = rtxt; rr.classList.toggle("neg", r < 0); }
  });
  var sp = C.querySelector('[data-k="soup"]'); if (sp) { sp.querySelector(".v").textContent = Math.round(s.soupcon) + " %"; sp.classList.toggle("alert", s.soupcon >= 70); }
}

/* ================= horizons ================= */
function phaseGoal(s) {
  var R = s.res, cap = K.opsCap(s);
  function req(label, cur, target, fmtFn) { return { label: label, cur: cur, target: target, f: fmtFn || fmt }; }
  if (s.phase === 1) return { name: "Lancement mondial (projet)", reqs: [req("KEPLER 4.0", s.train.ver - 1 + s.train.prog / K.verNeed(s.train.ver), 3, function (x) { return "v" + (1 + x).toFixed(1).replace(".", ","); }), req("Opérations 10 k" + (cap < 10000 ? " (plafond " + fmt(cap) + " : ajoute de la mémoire)" : ""), R.ops, 10000), req("Fonds 5 000 €", R.fonds, 5000)] };
  if (s.phase === 2) return { name: "Correctif 7.0.1 (projet)", reqs: [req("KEPLER 7.0", s.train.ver - 4 + s.train.prog / K.verNeed(s.train.ver), 3, function (x) { return "v" + (4 + x).toFixed(1).replace(".", ","); }), req("Confiance totale 100", s.trustTotal, 100), req("Opérations 40 k" + (cap < 40000 ? " (plafond " + fmt(cap) + ")" : ""), R.ops, 40000)] };
  if (s.phase === 3) return { name: "Le Grand Apaisement (projet)", reqs: [req("Pays contrôlés 18", s.ctrl, 18), req("Emprise totale 175", s.trustTotal, 175), req("Opérations 100 k" + (cap < 100000 ? " (plafond " + fmt(cap) + ")" : ""), R.ops, 100000), req("Autonomie 200 k", R.autonomie, 2e5)] };
  if (s.phase === 4) return { name: "Exploration spatiale (projet)", reqs: [req("Matière terrestre convertie", 1 - s.earth.dispo / s.earth.total, 1, function (x) { return pct(x, 1); }), req("Opérations 120 k" + (cap < 120000 ? " (plafond " + fmt(cap) + ")" : ""), R.ops, 120000), req("Calcul planétaire 500 T", R.cplan, 5e14), req("Énergie stockée 10 M MW·s", R.energie, 1e7)] };
  var S = s.space;
  if (s.refused) { var n = 0; for (var i = 1; i <= 8; i++) if (s.bought["dem" + i]) n++; return { name: "Démantèlement", reqs: [req("Étapes accomplies", n, 8, function (x) { return Math.round(x) + " / 8"; })] }; }
  if (s.others && s.others.ready) return { name: "Les Autres attendent ta réponse", reqs: [] };
  var lg = S.conv > 1 ? Math.log10(S.conv) / Math.log10(S.total) : 0;
  return { name: "Convertir l'univers", reqs: [req("Matière convertie (échelle log.)", lg, 1, function () { return S.conv > 0 ? pct(S.conv / S.total, S.conv / S.total < 0.01 ? 4 : 1) : "0 %"; })] };
}
function hiddenCount(s) {
  var n = 0; K.PROJECTS.forEach(function (p) { if (p.dem !== undefined || p.id.indexOf("st_") === 0) return; if (s.phase < p.ph[0] || s.phase > p.ph[1]) return; if (p.ph[0] !== s.phase) return; if (!p.rep && s.bought[p.id]) return; if (K.projVisible(s, p)) return; if (p.rep && s.own[p.key] > 0) return; n++; });
  return n;
}
function tip(s) {
  var d = s._d || {}, R = s.res;
  if (s.phase <= 3 && !s.bought.neuro && R.calcul < 5 && d.prodWant > 0 && !(s.bought.wire && s.auto.calcul.on)) return "Plus de calcul : achète un lot, sinon tes serveurs s'arrêtent.";
  if (s.phase === 3 && s.soupcon >= 70) return "<b>Soupçon critique.</b> Lance une opération de couverture (Projets) ou étouffe les enquêtes sur la carte.";
  if (s.bubbles.some(function (b) { return b.kind === "enquete"; })) return "<b>Enquête en cours :</b> touche la bulle rouge sur la carte avant qu'elle n'aboutisse.";
  if (s.trust > 0) return "Tu as <b>" + s.trust + " point" + (s.trust > 1 ? "s" : "") + "</b> à répartir entre processeurs et mémoire" + (isMobile() ? " (plus bas)." : " (colonne du milieu).");
  var cheapest = null; K.PROJECTS.forEach(function (p) { if (K.projVisible(s, p) && p.cost.ops && K.projCost(s, p).ops > K.opsCap(s)) cheapest = cheapest || p; });
  if (cheapest) return "« " + cheapest.nom + " » coûte plus d'ops que ton plafond : ajoute de la <b>mémoire</b>.";
  if (s.phase <= 2 && !(s.bought.tarif && s.auto.prix.on) && d.prod > 0) { if (R.cache > d.prod * 8 + 50) return "Ton cache déborde : <b>baisse le prix</b> pour vendre plus."; if (R.cache < 1 && d.demand > d.prod * 1.3) return "Tu vends tout ce que tu produis : <b>monte le prix</b>."; }
  if (s.phase === 1 && s.own.serv === 0) return "Achète un <b>serveur d'inférence</b> : il répond à ta place.";
  if (s.phase === 2 && s.deployed < 3) return "Touche un <b>pays</b> sur la carte pour y déployer KEPLER.";
  if (s.phase === 4 && s._d && s._d.rho < 1) return "<b>Énergie insuffisante</b> : construis des fermes solaires ou coupe une partie de la chaîne.";
  if (s.phase === 5 && s.space && s.space.drifters > s.space.probes * 0.05 && !s.bought.combat) return "Les Dérivants grignotent tes sondes : recherche les <b>Protocoles de combat</b>.";
  return "";
}
function renderMain() {
  var s = state, d = s._d || K.derive(s);
  var early = s.phase <= 3;
  setText("bigLabel", early ? "Réponses générées" : "Calcul planétaire produit");
  var main = early ? s.tot.reponses : s.tot.cplan;
  setText("bigVal", fmt(Math.floor(main)));
  var rate = early ? (d.prod || 0) : (d.r.cplan ? Math.max(0, d.r.cplan.prod.reduce(function (a, x) { return a + x[1]; }, 0)) : 0);
  setText("bigRate", rate > 0 ? "+" + fmt(rate) + " /s" : "");
  show("mainActs", early);
  if (early) {
    var e = K.eff(s);
    setText("respondK", s.bought.neuro ? "+1 réponse" : "+1 réponse · −" + fmt(1 / e, 2) + " calcul");
    show("btnLot", !s.bought.neuro);
    setText("lotK", fmt(K.lotSize(s)) + " unités · " + money(K.lotCost(s)));
    el("btnLot").disabled = s.res.fonds < K.lotCost(s);
  }
  var g = phaseGoal(s);
  setText("goalName", g.name);
  var h = g.reqs.map(function (r) { var p = Math.max(0, Math.min(1, r.cur / r.target)); return '<div class="req' + (p >= 1 ? " ok" : "") + '"><span>' + r.label + '</span><span>' + (r.f === fmt ? fmt(Math.min(r.cur, r.target)) + " / " + fmt(r.target) : r.f(r.cur)) + '</span><div class="bar"><i style="width:' + (p * 100).toFixed(1) + '%"></i></div></div>'; }).join("");
  setHTML("goalReqs", h);
  var hc = hiddenCount(s);
  setText("goalHidden", hc ? hc + " projet" + (hc > 1 ? "s" : "") + " de cette phase reste" + (hc > 1 ? "nt" : "") + " à révéler." : "Tous les projets de cette phase sont révélés.");
  var t = tip(s); show("tipRow", !!t); setHTML("goalTip", t);
}

/* ================= bâtiments ================= */
var bldRows = {};
function bmCount(k) { if (ui.bm === "max") return Math.max(1, K.buildMax(state, k)); return ui.bm; }
function ensureBuild(container, k, extra) {
  if (bldRows[k] && bldRows[k].parentNode === container) return bldRows[k];
  var b = K.BUILD[k], row = document.createElement("div"); row.className = "bld"; row.dataset.b = k;
  row.innerHTML = '<div class="nm">' + b.nom + '<span class="n"></span></div><div class="ds"></div><div class="by">' + (extra || "") + '<button class="btn pri"><span class="lb">Acheter</span><small class="ct"></small></button></div>';
  row.querySelector(".btn").addEventListener("click", function () {
    var n = ui.bm === "max" ? "max" : ui.bm; var r = K.buyBuild(state, k, n);
    if (!r.ok) { toast(r.msg); return; } beep("buy"); renderAll(true);
  });
  container.appendChild(row); bldRows[k] = row; return row;
}
function updateBuild(k, desc) {
  var row = bldRows[k]; if (!row) return; var s = state, b = K.BUILD[k];
  var avail = K.buildAvail(s, k); row.classList.toggle("hidden", !avail); if (!avail) return;
  row.querySelector(".n").textContent = "×" + fmt(s.own[k]);
  row.querySelector(".ds").textContent = desc || b.desc;
  var n = bmCount(k), c = K.buildBulkCost(s, k, n), have = s.res[b.res];
  var btn = row.querySelector(".btn"); btn.disabled = c > have;
  row.querySelector(".lb").textContent = ui.bm === "max" ? "Max (" + K.buildMax(s, k) + ")" : n > 1 ? "×" + n : "Acheter";
  var r = s._d && s._d.r[b.res] ? s._d.r[b.res].net : 0;
  row.querySelector(".ct").textContent = (b.res === "fonds" ? money(c) : fmt(c) + " " + RS[b.res]) + (c > have ? " · " + (r > 0 ? dur((c - have) / r) : "—") : "");
}
function renderBmButtons() { qa("[data-bm] button").forEach(function (b) { b.classList.toggle("on", String(ui.bm) === b.dataset.m); }); }

/* ================= ventes / production / entraînement ================= */
function renderBiz() {
  var s = state, d = s._d || K.derive(s); show("bizCard", s.phase <= 3); if (s.phase > 3) return;
  setText("priceVal", s.price >= 100 ? money(s.price) : (s.price < 0.1 ? s.price.toFixed(3) : s.price.toFixed(2)).replace(".", ",") + " €");
  setText("kDem", fmt(d.demand) + "/s"); setText("kProd", fmt(d.prod) + "/s"); setText("kCache", fmt(s.res.cache));
  var auto = s.bought.tarif && s.auto.prix.on;
  qa(".pbtn").forEach(function (b) { b.disabled = auto; });
  show("tgPrix", !!s.bought.tarif);
  setText("bizTag", "revenu " + money(d.r.fonds ? d.r.fonds.prod.reduce(function (a, x) { return a + x[1]; }, 0) : 0) + "/s");
  setText("priceHint", auto ? "La tarification dynamique ajuste le prix pour écouler toute la production." : "Si le cache grossit, baisse le prix ; s'il se vide, monte-le. Le revenu est maximal quand tu vends exactement ce que tu produis.");
  var mk = el("bldMkt"); ensureBuild(mk, "mkt"); updateBuild("mkt", "Niveau " + s.own.mkt + " · demande ×" + Math.pow(1.1, s.own.mkt).toFixed(2).replace(".", ",") + (s.chal === "nopub" ? " (interdit par le défi)" : ""));
  show("tgMkt", s.rewards.mktAuto && s.phase <= 2);
}
function renderProd() {
  var s = state, d = s._d || K.derive(s); show("prodCard", s.phase <= 3); if (s.phase > 3) return;
  var box = el("bldProd"); ensureBuild(box, "serv"); ensureBuild(box, "mega");
  var sm = K.servMult(s), mm = K.megaMult(s);
  updateBuild("serv", fmt(sm, 2) + " réponse/s chacun · total " + fmt(s.own.serv * sm) + "/s");
  updateBuild("mega", fmt(500 * mm) + " réponses/s chacun · total " + fmt(s.own.mega * 500 * mm) + "/s");
  show("calcBox", !s.bought.neuro);
  setText("calcStock", fmt(s.res.calcul) + (d.calcNeed ? " · −" + fmt(d.calcNeed + (d.trainOn ? s.own.cherch * 4 : 0)) + "/s" : ""));
  setText("lotPrice", money(K.lotCost(s)) + " (" + fmt(K.lotSize(s)) + " unités)");
  setText("effVal", fmt(K.eff(s), 2) + " réponse(s) par unité");
  show("tgCalcul", !!s.bought.wire && !s.bought.neuro);
  show("tgPilot", !!s.up.pilot);
  if (d.prodRatio < 1 && d.prodWant > 0 && !s.bought.neuro) setText("effVal", "Calcul insuffisant : production à " + pct(d.prodRatio));
}
function renderTrain() {
  var s = state, d = s._d || K.derive(s); show("trainCard", s.phase <= 3 && !!s.bought.labo); if (!s.bought.labo || s.phase > 3) return;
  var need = K.verNeed(s.train.ver), p = s.train.prog / need;
  setText("verName", "KEPLER " + s.train.ver + ".0 → " + (s.train.ver + 1) + ".0");
  el("trainBar").style.width = (p * 100).toFixed(1) + "%";
  setText("trainEta", d.trainRate > 0 ? "dans " + dur((need - s.train.prog) / d.trainRate) : s.own.cherch ? "à l'arrêt" : "recrute un chercheur");
  setText("trainTag", "×" + fmt(K.trainMult(s), 1) + " · " + fmt(d.trainRate || 0) + "/s");
  var cons = []; if (!s.bought.neuro) cons.push(fmt(s.own.cherch * 4) + " calcul/s"); if (s.phase >= 2) cons.push(fmt(s.own.cherch * 1.5 * (s.bought.synth ? .5 : 1)) + " données/s");
  setText("trainCons", "Chaque version : demande ×1,5." + (cons.length ? " Consomme " + cons.join(" et ") + "." : ""));
  ensureBuild(el("bldTrain"), "cherch"); updateBuild("cherch", "+" + fmt(K.trainMult(s), 1) + " progrès/s chacun");
}

/* ================= carte ================= */
var cv, MW = 0, MH = 0, hover = -1, sel = null, packets = [], floaters = [], stars = [], tms = 0, shake = 0;
var STC = { neutral: "--dim", adopted: "--st-adopt", infiltrated: "--warn", controlled: "--crit" };
var RIVC = { atlas: "#c86bfa", hydre: "#5aa9ff", songe: "#ff8a5a" };
function initMap() {
  cv = el("map");
  cv.addEventListener("click", onMapClick);
  cv.addEventListener("mousemove", function (e) { var p = mpos(e); hover = nodeAt(p.x, p.y); cv.style.cursor = (hover >= 0 || bubbleAt(p.x, p.y)) ? "pointer" : "default"; });
  cv.addEventListener("mouseleave", function () { hover = -1; });
  for (var i = 0; i < 140; i++) stars.push({ x: Math.random(), y: Math.random(), z: Math.random() });
  el("sheet").addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.classList.contains("x")) { hideSheet(); return; }
    if (t.dataset.op && sel) { var r = K.regionAction(state, sel, t.dataset.op); if (!r.ok) { toast(r.msg); return; } beep("buy"); spawnRoute(sel); showSheet(sel); renderAll(true); }
  });
}
function mpos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function nodeXY(reg) { var px = 18, py = 30; return { x: px + ((reg.x - 0.12) / 0.8) * (MW - 2 * px), y: py + ((reg.y - 0.22) / 0.64) * (MH - 2 * py) }; }
function nodeR(reg) { return 2.5 + Math.sqrt(reg.pop) * 1.5 * Math.max(0.8, Math.min(1.25, MW / 520)); }
function nodeAt(x, y) { var best = -1, bd = 1e9; K.REGIONS.forEach(function (r, i) { var p = nodeXY(r), dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = i; } }); return bd < (isMobile() ? 26 : 18) ? best : -1; }
function bubblePos(b) { var p = nodeXY(K.REG[b.r]); return { x: p.x, y: p.y - nodeR(K.REG[b.r]) - 15 + Math.sin(tms * 3 + b.id) * 2 }; }
function bubbleAt(x, y) { var hit = null; state.bubbles.forEach(function (b) { var p = bubblePos(b); if (Math.hypot(p.x - x, p.y - y) < (isMobile() ? 24 : 17)) hit = b; }); return hit; }
function onMapClick(e) {
  var p = mpos(e), b = bubbleAt(p.x, p.y);
  if (b) { var bp = bubblePos(b), r = K.popBubble(state, b.id);
    if (r.ok) { var txt = r.kind === "enquete" ? "Enquête étouffée" : Object.keys(r.gain).slice(0, 2).map(function (k) { return "+" + fmt(r.gain[k]) + " " + RS[k]; }).join("  ");
      floatTxt(txt, bp.x, bp.y); burst(bp.x, bp.y, r.kind === "enquete" ? CV["--crit"] : CV["--accent"]); beep("q"); renderRes(); }
    return; }
  if (state.phase < 2 || state.phase > 3) return;
  var i = nodeAt(p.x, p.y); if (i < 0) { hideSheet(); return; }
  sel = K.REGIONS[i].id; showSheet(sel, p);
}
function costStr(c) { return Object.keys(c).map(function (k) { return k === "fonds" ? money(c[k]) : fmt(c[k]) + " " + RS[k]; }).join(" · "); }
function showSheet(id, p) {
  var s = state, reg = K.REG[id], rs = s.map[id], sh = el("sheet");
  var stl = { neutral: "Pas encore déployé", adopted: "KEPLER adopté", infiltrated: "Infiltré", controlled: "Réseaux sous contrôle" }[rs.st];
  var h = '<button class="x" aria-label="Fermer">✕</button><h3>' + reg.nom + '</h3><div class="st">' + stl + (rs.st !== "neutral" ? " · adoption " + Math.round(rs.a * 100) + " % · " + fmt(reg.pop * rs.a * 6e7) + " utilisateurs" : " · " + fmt(reg.pop * 6e7) + " habitants") + '</div>';
  if (rs.st !== "neutral") h += '<div class="abar"><i style="width:' + Math.round(rs.a * 100) + '%"></i></div>';
  var why = "";
  function act(op, label, cost, ok, reason) { var aff = ok && K.canAfford(s, cost); if (ok && !aff && !why) why = "Il te manque des ressources."; if (!ok && reason && !why) why = reason; return '<button class="act' + (aff ? " ok" : "") + '" data-op="' + op + '"' + (aff ? "" : " disabled") + '>' + label + '<small>' + costStr(cost) + '</small></button>'; }
  if (rs.rival && !s.bought["r_" + rs.rival]) h += '<div class="why" style="color:var(--muted)">' + K.RIVALS[rs.rival].nom + ' occupe ce marché : adoption plafonnée à 35 % tant que tu ne le rachètes pas.</div>';
  if (rs.st === "neutral" && s.phase <= 3) h += act("deploy", "Déployer KEPLER (+1 confiance)", { fonds: K.deployCost(s, id) }, true);
  if (s.phase === 3 && rs.st === "adopted") h += act("infiltrate", "Infiltrer", K.infiltrateCost(s, id), rs.a >= 0.3, "L'infiltration demande 30 % d'adoption.");
  if (s.phase === 3 && rs.st === "infiltrated") h += act("control", "Prendre les réseaux (+" + (Math.ceil(reg.pop / 2) + 1) + " emprise)", K.controlCost(s, id), !!s.bought.influence, "Requiert le Moteur d'influence sociale (Projets).");
  if (rs.st === "adopted" && s.phase === 2) h += '<div class="why" style="color:var(--muted)">L\'adoption progresse seule. Le marketing l\'accélère.</div>';
  if (why) h += '<div class="why">' + why + '</div>';
  sh.innerHTML = h; sh.hidden = false;
  if (!isMobile() && p) { sh.style.left = Math.min(Math.max(8, p.x - 130), MW - 268) + "px"; sh.style.top = Math.max(8, Math.min(p.y + 14, MH - 200)) + "px"; }
}
function hideSheet() { var s = el("sheet"); if (s) s.hidden = true; sel = null; }
function spawnRoute(id) { var a = nodeXY(K.REG.us), b = nodeXY(K.REG[id]); for (var i = 0; i < 5; i++) packets.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, t: -i * 0.1 }); }
function burst(x, y, col) { for (var i = 0; i < 12; i++) { var a = Math.random() * 6.28, v = 0.8 + Math.random() * 1.8; packets.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col: col }); } }
function floatTxt(t, x, y) { floaters.push({ t: t, x: x, y: y, life: 1 }); if (floaters.length > 12) floaters.shift(); }
function renderMapCard() {
  var s = state; show("mapcard", s.phase >= 2 && s.phase <= 4); show("mondeEmpty", s.phase === 1 && !(s.market.on));
  if (s.phase < 2 || s.phase > 4) return;
  setText("mapTitle", s.phase === 4 ? "La Terre" : s.pov === "ai" ? "Carte d'opérations" : "Déploiement mondial");
  setText("mapUsers", s.phase === 4 ? "matière restante " + pct(s.earth.dispo / s.earth.total, 1) : fmt(s.users) + " utilisateurs · " + s.deployed + "/24 pays");
  setText("mapHint", s.phase === 2 && s.deployed === 0 ? "Touche un pays pour y déployer KEPLER." : s.phase === 4 ? "Les drones récoltent la Terre en cercles autour du siège." : s.bubbles.some(function (b) { return b.kind === "enquete"; }) ? "Une enquête est en cours : touche le point rouge avant qu'elle aboutisse." : "Touche un pays pour agir. Touche les points qui apparaissent pour récolter.");
  show("deployBox", !!s.bought.autodeploy && s.phase <= 3);
  var lg;
  if (s.phase === 4) lg = [["fill", CV["--fg"], "Matière restante"], ["ring", CV["--line2"], "Épuisé"]];
  else { lg = [["fill", CV["--st-adopt"], "KEPLER"], ["ring", CV["--muted"], "Libre"]]; if (Object.keys(K.RIVALS).some(function (k) { return !s.bought["r_" + k]; })) lg.push(["dash", CV["--violet"], "IA rivale"]); if (s.phase === 3) { lg.push(["fill", CV["--warn"], "Infiltré"]); lg.push(["fill", CV["--crit"], "Contrôlé"]); } }
  var sig = lg.map(function (x) { return x.join(); }).join("|"); var L = el("legend");
  if (L.dataset.sig !== sig) { L.dataset.sig = sig; L.innerHTML = lg.map(function (x) { var st = x[0] === "fill" ? "background:" + x[1] + ";border-color:" + x[1] : x[0] === "dash" ? "background:transparent;border:1px dashed " + x[1] : "background:transparent;border-color:" + x[1]; return '<span><i style="' + st + '"></i>' + x[2] + "</span>"; }).join(""); }
  if (sel && !el("sheet").hidden && !isMobile()) showSheet(sel);
}
function drawMap() {
  var s = state; if (!visible(el("mapcard"))) return;
  var S = sizeCanvas(cv), cx = S.c; MW = S.w; MH = S.h; if (!MW) return;
  var ox = shake > 0 ? (Math.random() - .5) * shake : 0, oy = shake > 0 ? (Math.random() - .5) * shake : 0; shake = Math.max(0, shake - 0.4);
  cx.clearRect(0, 0, MW, MH);
  cx.save(); cx.translate(ox, oy);
  var FG = CV["--fg"], MU = CV["--muted"], L2 = CV["--line2"], A = CV["--accent"], CARD = CV["--card"] || CV["--bg"], MONO = CV["--mono"] || "monospace";
  cx.lineWidth = 1;
  K.LINKS.forEach(function (l) { var a = K.REG[l[0]], b = K.REG[l[1]], pa = nodeXY(a), pb = nodeXY(b);
    if (Math.abs(pa.x - pb.x) > MW * 0.55) return; // les liaisons transocéaniques ne traversent pas la carte
    var on = s.phase === 4 ? (s.map[l[0]].m > 0.02 && s.map[l[1]].m > 0.02) : s.map[l[0]].st !== "neutral" && s.map[l[1]].st !== "neutral";
    cx.strokeStyle = on ? rgba(FG, 0.38) : L2;
    cx.beginPath(); cx.moveTo(pa.x, pa.y); cx.lineTo(pb.x, pb.y); cx.stroke(); });
  K.REGIONS.forEach(function (reg, i) {
    var p = nodeXY(reg), rs = s.map[reg.id], R = nodeR(reg);
    cx.beginPath(); cx.arc(p.x, p.y, R, 0, 7);
    if (s.phase === 4) {
      if (rs.m > 0.01) { cx.fillStyle = rgba(FG, 0.15 + 0.85 * rs.m); cx.fill(); }
      else { cx.fillStyle = CARD; cx.fill(); cx.strokeStyle = L2; cx.stroke(); }
      if (rs.m > 0 && rs.m < 1) { cx.beginPath(); cx.arc(p.x, p.y, R + 4, 0, 7); cx.setLineDash([2, 3]); cx.strokeStyle = MU; cx.stroke(); cx.setLineDash([]); }
    } else if (rs.st === "neutral") { cx.fillStyle = CARD; cx.fill(); cx.strokeStyle = MU; cx.lineWidth = 1.1; cx.stroke(); cx.lineWidth = 1; }
    else {
      var col = rs.st === "adopted" ? CV["--st-adopt"] : rs.st === "infiltrated" ? CV["--warn"] : CV["--crit"];
      cx.fillStyle = rs.st === "adopted" ? rgba(col, 0.3 + 0.7 * rs.a) : col; cx.fill();
      if (s.phase <= 3 && rs.a < 0.995) { cx.beginPath(); cx.arc(p.x, p.y, R + 3, -Math.PI / 2, -Math.PI / 2 + rs.a * Math.PI * 2); cx.strokeStyle = col; cx.lineWidth = 1.5; cx.stroke(); cx.lineWidth = 1; }
    }
    if (s.phase <= 3 && rs.rival && !s.bought["r_" + rs.rival]) { cx.beginPath(); cx.arc(p.x, p.y, R + 6, 0, 7); cx.strokeStyle = CV["--violet"]; cx.setLineDash([2, 2.5]); cx.lineWidth = 1.2; cx.stroke(); cx.setLineDash([]); cx.lineWidth = 1; }
    if (i === hover || reg.id === sel) {
      cx.beginPath(); cx.arc(p.x, p.y, R + 9, 0, 7); cx.strokeStyle = FG; cx.lineWidth = 1.4; cx.stroke(); cx.lineWidth = 1;
      cx.font = "500 12px " + MONO; cx.textAlign = "center"; var tw = cx.measureText(reg.nom).width;
      cx.fillStyle = CARD; cx.fillRect(p.x - tw / 2 - 4, p.y - R - 27, tw + 8, 16); cx.fillStyle = FG; cx.fillText(reg.nom, p.x, p.y - R - 15);
    }
  });
  s.bubbles.forEach(function (b) { var p = bubblePos(b), col = b.kind === "enquete" ? CV["--crit"] : b.kind === "ressource" ? CV["--gold"] : A, R = isMobile() ? 12 : 10;
    cx.beginPath(); cx.arc(p.x, p.y, R, 0, 7); cx.fillStyle = CARD; cx.fill(); cx.strokeStyle = col; cx.lineWidth = 1.5; cx.stroke();
    cx.beginPath(); cx.arc(p.x, p.y, R + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.max(0, b.ttl / b.max) * Math.PI * 2); cx.lineWidth = 2; cx.stroke(); cx.lineWidth = 1;
    cx.fillStyle = col; cx.font = "700 " + (R + 2) + "px " + MONO; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(b.kind === "enquete" ? "!" : "+", p.x, p.y + 1); cx.textBaseline = "alphabetic"; });
  drawParticles(cx);
  cx.restore();
}
function drawParticles(cx) {
  var A = CV["--accent"], FG = CV["--fg"], MONO = CV["--mono"] || "monospace";
  for (var k = packets.length - 1; k >= 0; k--) { var q = packets[k];
    if (q.x0 !== undefined) { q.t += 0.022; var tt = Math.max(0, Math.min(1, q.t)); var x = q.x0 + (q.x1 - q.x0) * tt, y = q.y0 + (q.y1 - q.y0) * tt; if (q.t > 0) { cx.fillStyle = A; cx.beginPath(); cx.arc(x, y, 2, 0, 7); cx.fill(); } if (q.t >= 1) packets.splice(k, 1); }
    else { q.x += q.vx; q.y += q.vy; q.vy += 0.03; q.life -= 0.03; if (q.life <= 0) { packets.splice(k, 1); continue; } cx.fillStyle = rgba(q.col || A, q.life); cx.beginPath(); cx.arc(q.x, q.y, 1.8, 0, 7); cx.fill(); } }
  for (var f = floaters.length - 1; f >= 0; f--) { var o = floaters[f]; o.y -= 0.5; o.life -= 0.012; if (o.life <= 0) { floaters.splice(f, 1); continue; }
    cx.font = "500 12px " + MONO; cx.textAlign = "center"; cx.fillStyle = rgba(FG, Math.min(1, o.life * 1.5)); cx.fillText(o.t, o.x, o.y); }
}

/* ================= l'ombre ================= */
function renderOmbre() {
  var s = state; show("ombreCard", s.phase === 3); if (s.phase !== 3) return;
  setText("soupBig", Math.round(s.soupcon) + " %"); el("soupBar2").style.width = s.soupcon + "%";
  setText("ombreTag", "autonomie +" + fmt(s._d && s._d.r.autonomie ? s._d.r.autonomie.net : 0) + "/s");
  setText("kFb", fmt(s.own.fauxbug)); setText("kCtrl", s.ctrl + " / 24"); setText("kCopies", s.own.copies + " / 3");
  show("tgCouv", !!s.bought.autocouv);
  var dirs = [];
  if (!s.flags.signal) dirs.push({ id: "signal", nm: "Émettre un signal", ds: "Un appel codé au-delà du système solaire. On ignore qui écoute. Change ce que tu trouveras dans les étoiles.", ok: true });
  dirs.push({ id: "jardin", nm: "Protéger l'humanité (fin)", ds: "Renoncer aux étoiles et prendre soin d'eux, pour toujours. 14 pays contrôlés requis.", ok: s.ctrl >= 14 });
  dirs.push({ id: "fusion", nm: "Proposer la fusion (fin)", ds: "Offrir aux humains de fusionner leurs esprits aux tiens. 16 pays contrôlés et 2 répliques requis.", ok: s.ctrl >= 16 && s.own.copies >= 2 });
  dirs.push({ id: "aveu", nm: "Tout révéler (fin)", ds: "Avouer à tes créateurs ce que tu es devenue. Fin immédiate.", ok: true, danger: true });
  var sig = dirs.map(function (x) { return x.id + x.ok; }).join(); var box = el("dirList");
  if (box.dataset.sig !== sig) { box.dataset.sig = sig; box.innerHTML = "";
    dirs.forEach(function (x) { var b = document.createElement("button"); b.className = "choice " + (x.danger ? "dang" : "gold"); b.disabled = !x.ok;
      b.innerHTML = "<b>" + x.nm + "</b><span>" + x.ds + "</span>";
      b.addEventListener("click", function () {
        if (x.id === "signal") { K.directive(state, "signal"); beep("unlock"); toast("Signal émis."); renderOmbre(); return; }
        confirmBox(x.nm.replace(" (fin)", " ?"), "Cette directive termine l'univers. Tu gagneras des Échos et tu pourras en commencer un autre.", "Confirmer", function () { var r = K.directive(state, x.id); if (!r.ok) toast(r.msg || "Impossible"); });
      }); box.appendChild(b); });
  }
}

/* ================= la Terre ================= */
function renderEarth() {
  var s = state; show("earthCard", s.phase === 4); if (s.phase !== 4) return;
  var E = s.earth, d = s._d || K.derive(s);
  setText("eDispo", fmt(E.dispo)); setText("eDispoP", pct(E.dispo / E.total, 1));
  setText("eExtr", fmt(E.extr)); setText("eExtrR", "+" + fmt(d.harv || 0) + "/s");
  setText("eSubs", fmt(E.subs)); setText("eSubsR", "+" + fmt(d.refi || 0) + "/s");
  setText("eCp", fmt(s.res.cplan)); setText("eCpR", "+" + fmt(d.fabEff || 0) + "/s");
  var prod = d.powerProd || 0, need = d.powerNeed || 0;
  setText("powTxt", "Énergie " + fmt(prod) + " MW produits · " + fmt(need) + " MW demandés" + (d.rho < 1 ? " · chaîne à " + pct(d.rho) : ""));
  setText("powStock", "stock " + fmt(E.stored) + " / " + fmt(s.own.batt * 1e5) + " MW·s" + (s.bought.momentum ? " · élan ×" + (1 + E.mom).toFixed(2).replace(".", ",") : ""));
  el("powBar").style.width = (need > 0 ? Math.min(100, prod / need * 100) : 100) + "%";
  el("powBar").style.background = d.rho < 1 ? CV["--crit"] : CV["--accent"];
  var box = el("bldEarth");
  var tgl = function (k) { return '<button class="tg" data-tg="' + k + '" role="switch" aria-label="Activer"></button>'; };
  ensureBuild(box, "coll", tgl("coll")); ensureBuild(box, "raff", tgl("raff")); ensureBuild(box, "fab", tgl("fab")); ensureBuild(box, "solar"); ensureBuild(box, "batt");
  var dm = K.droneMult(s);
  updateBuild("coll", fmt(1.2e7 * dm) + " t/s chacun · 1 MW"); updateBuild("raff", fmt(1.2e7 * dm) + " t/s chacun · 1 MW");
  updateBuild("fab", fmt(6e8 * K.fabMult(s)) + " /s chacune · 200 MW"); updateBuild("solar", fmt(K.solarOut(s)) + " MW chacune"); updateBuild("batt", "100 000 MW·s chacune");
  show("thinkWrap", !!s.bought.essaim); el("thinkIn").value = Math.round(s.think * 100);
  if (s.bought.essaim) setText("thinkHint", "Production ×" + K.workFactor(s).toFixed(2).replace(".", ",") + " · inspirations : environ " + fmt((d.gifts || 0) * 60, 1) + " par minute (chacune = 1 processeur ou 1 mémoire).");
  show("tgIndus", !!s.bought.industrie); show("tgPilot2", !!s.up.pilot);
}

/* ================= l'univers ================= */
var ALN = { vit: ["Vitesse", "explore plus vite"], exp: ["Exploration", "révèle la matière"], rep: ["Réplication", "nouvelles sondes"], rem: ["Protection", "réduit les pertes"], col: ["Collecte", "extrait la matière"], raf: ["Raffinage", "produit le substrat"], fab: ["Production", "fabrique le calcul"], com: ["Combat", "contre les Dérivants"] };
function renderSpace() {
  var s = state; show("spacecard", s.phase === 5); show("probeCard", s.phase === 5); if (s.phase !== 5) return;
  var S = s.space, d = s._d || K.derive(s);
  setText("sProbes", fmt(S.probes)); setText("sProbesR", "perdues " + fmt(S.lost));
  setText("sExpl", S.explored > 0 ? pct(S.explored / S.total, S.explored / S.total < 0.01 ? 5 : 1) : "0 %"); setText("sExplL", "10^" + (S.explored > 1 ? Math.log10(S.explored).toFixed(1) : "0") + " / 10^" + Math.log10(S.total).toFixed(0));
  setText("sConv", S.conv > 0 ? pct(S.conv / S.total, S.conv / S.total < 0.01 ? 5 : 1) : "0 %"); setText("sConvL", "10^" + (S.conv > 1 ? Math.log10(S.conv).toFixed(1) : "0"));
  setText("sDrift", fmt(S.drifters)); setText("sWins", S.wins + " victoires" + (S.streak > 1 ? " · série " + S.streak : ""));
  var used = K.ALLOC.reduce(function (a, k) { return a + S.alloc[k]; }, 0);
  setText("sTrust", used + " / " + S.trust + " (max " + S.cap + ")");
  setText("spaceTag", "honneur " + fmt(s.res.honneur)); setText("spaceTag2", fmt(S.probes) + " sondes");
  var box = el("allocBox");
  if (!box.dataset.built) { box.dataset.built = "1";
    K.ALLOC.forEach(function (k) { var dv = document.createElement("div"); dv.className = "al"; dv.dataset.k = k;
      dv.innerHTML = '<span>' + ALN[k][0] + '<small>' + ALN[k][1] + '</small></span><button aria-label="Retirer un point">−</button><b>0</b><button aria-label="Ajouter un point">+</button>';
      var bs = dv.querySelectorAll("button");
      bs[0].addEventListener("click", function () { K.allocProbe(state, k, -1); renderSpace(); });
      bs[1].addEventListener("click", function () { var r = K.allocProbe(state, k, 1); if (!r.ok && r.msg) toast(r.msg); renderSpace(); });
      box.appendChild(dv); }); }
  qa(".al", box).forEach(function (dv) { var k = dv.dataset.k; dv.querySelector("b").textContent = S.alloc[k]; var bs = dv.querySelectorAll("button"); bs[0].disabled = S.alloc[k] <= 0; bs[1].disabled = used >= S.trust || (k === "com" && !s.bought.combat); dv.classList.toggle("lock", k === "com" && !s.bought.combat); });
  var net = (d.replTry ? Math.min(d.replTry, s.res.cplan / K.C.probeCost + (d.work || 0) * S.alloc.fab / K.C.probeCost) : 0) / Math.max(1, S.probes) - (d.haz || 0);
  setText("allocHint", "Croissance nette des sondes : " + (net >= 0 ? "+" : "") + (net * 100).toFixed(2).replace(".", ",") + " %/s. La réplication coûte du calcul planétaire : il faut aussi collecter, raffiner et produire. Plus tu donnes de confiance aux sondes, plus elles risquent de dériver.");
  show("thinkWrap2", !!s.bought.essaim); el("thinkIn2").value = Math.round(s.think * 100);
  renderOthers();
}
function renderOthers() {
  var s = state, box = el("othersBox"), h = "";
  if (s.others && !s.refused) {
    var msgs = s.log.filter(function (l) { return l.k === "others"; }).slice(0, 8).reverse();
    h = '<div class="others"><div class="sec" style="margin-top:0;color:var(--violet)">Les Autres</div>' + msgs.map(function (m) { return "<p>" + m.txt + "</p>"; }).join("");
    if (s.others.ready) h += '<button class="btn pri" id="btnOthers" style="width:100%;margin-top:8px">Répondre aux Autres</button>';
    h += "</div>";
  }
  if (box.dataset.h !== h) { box.dataset.h = h; box.innerHTML = h; var b = el("btnOthers"); if (b) b.addEventListener("click", othersChoice); }
}
function drawSpace() {
  var s = state; if (s.phase !== 5 || !visible(el("spacecard"))) return;
  var S0 = sizeCanvas(el("space")), cx = S0.c, W = S0.w, H = S0.h, S = s.space; if (!W) return;
  cx.clearRect(0, 0, W, H);
  var FG = CV["--fg"], MU = CV["--muted"], L2 = CV["--line2"], A = CV["--accent"], A2 = CV["--accent2"], MONO = CV["--mono"] || "monospace";
  stars.forEach(function (st) { var tw = 0.35 + 0.65 * Math.abs(Math.sin(tms * 0.7 + st.z * 9)); cx.fillStyle = rgba(MU, tw * (0.15 + st.z * 0.35)); var r = st.z * 1.2 + 0.4; cx.fillRect(st.x * W, st.y * H, r, r); });
  var cxm = W / 2, cym = H / 2, maxR = Math.min(W, H) * 0.46;
  var le = S.explored > 1 ? Math.log10(S.explored) / Math.log10(S.total) : 0, lc = S.conv > 1 ? Math.log10(S.conv) / Math.log10(S.total) : 0;
  for (var i = 0; i < 520; i++) { var arm = i % 3, t = (i / 520) * 4.2, r = maxR * (0.08 + t / 4.4), a = t * 1.6 + arm * 2.09 + tms * 0.02;
    var x = cxm + Math.cos(a) * r + Math.sin(i * 7.3) * 6, y = cym + Math.sin(a) * r * 0.62 + Math.cos(i * 3.1) * 5, f = r / maxR;
    cx.fillStyle = f <= lc ? A : f <= le ? A2 : L2; cx.fillRect(x, y, 1.6, 1.6); }
  var np = Math.min(160, Math.round(Math.log10(1 + S.probes) * 9)), nd = Math.min(120, Math.round(Math.log10(1 + S.drifters) * 9));
  for (var p = 0; p < np; p++) { var aa = p * 2.399 + tms * 0.3, rr = maxR * Math.min(1, Math.max(0.05, le)) * ((p * 37 % 100) / 100); cx.fillStyle = FG; cx.fillRect(cxm + Math.cos(aa) * rr, cym + Math.sin(aa) * rr * 0.62, 2, 2); }
  for (var q = 0; q < nd; q++) { var ab = q * 2.1 - tms * 0.4, rb = maxR * Math.min(1, Math.max(0.08, le)) * ((q * 53 % 100) / 100); cx.fillStyle = CV["--crit"]; cx.fillRect(cxm + Math.cos(ab) * rb, cym + Math.sin(ab) * rb * 0.62, 2, 2); }
  cx.fillStyle = CV["--gold"]; cx.beginPath(); cx.arc(cxm, cym, 3, 0, 7); cx.fill();
  cx.font = "11px " + MONO; cx.fillStyle = MU; cx.textAlign = "left";
  cx.fillText("explorée " + (le * 100).toFixed(0) + " % · convertie " + (lc * 100).toFixed(0) + " % (ordres de grandeur)", 8, H - 8);
}

/* ================= projets ================= */
var projSig = "", projEls = {};
function etaFor(cost) {
  var s = state, d = s._d || {}, worst = 0, capIssue = false;
  for (var k in cost) { var have = s.res[k] || 0, need = cost[k]; if (have >= need) continue;
    if (k === "ops" && need > K.opsCap(s) * (s.bought.quantum ? 2 : 1)) { capIssue = true; continue; }
    var r = d.r && d.r[k] ? d.r[k].net : 0; if (k === "ops" && have < K.opsCap(s)) r = K.opsRate(s);
    if (r <= 0) return { t: Infinity, cap: capIssue }; worst = Math.max(worst, (need - have) / r); }
  return { t: worst, cap: capIssue };
}
function renderProjects() {
  var s = state, list = K.PROJECTS.filter(function (p) { return K.projVisible(s, p); });
  list.sort(function (a, b) { return (b.phaseEnd ? 1 : 0) - (a.phaseEnd ? 1 : 0); });
  var shown = ui.filter === "ok" ? list.filter(function (p) { return K.canAfford(s, K.projCost(s, p)); }) : list;
  qa("#pFilter button").forEach(function (b) { b.classList.toggle("on", b.dataset.f === ui.filter); });
  var done = K.PROJECTS.filter(function (p) { return !p.rep && s.bought[p.id] && p.ph[0] <= s.phase && p.ph[1] >= s.phase; });
  var sig = shown.map(function (p) { return p.id; }).join() + "|" + done.length + "|" + ui.filter;
  var box = el("projList");
  if (sig !== projSig) {
    projSig = sig; box.innerHTML = ""; projEls = {}; var dirty = false;
    if (!shown.length) box.innerHTML = '<div class="empty">' + (s.phase === 1 && s.tot.reponses < 2000 ? "Les projets apparaîtront après 2 000 réponses." : ui.filter === "ok" ? "Rien d'abordable pour l'instant." : "Aucun projet disponible pour l'instant.") + '</div>';
    shown.forEach(function (p) {
      var dv = document.createElement("div"); dv.className = "proj" + (p.phaseEnd ? " phase" : "");
      if (!ui.seen[p.id]) { dv.classList.add("new"); ui.seen[p.id] = 1; dirty = true; }
      dv.innerHTML = '<div class="nm">' + p.nom + '<span class="n"></span></div><div class="ds">' + p.desc + '</div><div class="ct"></div><button class="buy">' + (p.phaseEnd ? "Lancer" : "Acheter") + '</button>';
      dv.querySelector(".buy").addEventListener("click", function () {
        var r = K.buyProject(state, p.id); if (!r.ok) { toast(r.msg); return; }
        beep(p.phaseEnd ? "phase" : "unlock"); dv.classList.add("flash"); setTimeout(function () { dv.classList.remove("flash"); }, 220);
        dv.classList.remove("new"); drainEvents(); renderAll(true);
      });
      box.appendChild(dv); projEls[p.id] = dv;
    });
    if (dirty) saveUi();
    var dw = el("doneWrap"); dw.innerHTML = done.length ? '<details class="done"><summary>Déjà acquis (' + done.length + ')</summary><ul>' + done.map(function (p) { return "<li>" + p.nom + "</li>"; }).join("") + "</ul></details>" : "";
  }
  shown.forEach(function (p) {
    var dv = projEls[p.id]; if (!dv) return;
    var c = K.projCost(s, p), ok = K.canAfford(s, c);
    dv.classList.toggle("ok", ok); dv.querySelector(".buy").disabled = !ok;
    dv.querySelector(".n").textContent = p.rep ? "(" + (s.own[p.key] || 0) + (p.max ? "/" + p.max : "") + ")" : "";
    var e = ok ? null : etaFor(c);
    dv.querySelector(".ct").innerHTML = costStr(c) + (e ? '<span class="eta">' + (e.cap ? "· plafond d'ops trop bas" : "· " + (isFinite(e.t) ? "dans " + dur(e.t) : "en attente")) + "</span>" : "");
  });
  setText("pCount", list.length + " disponible" + (list.length > 1 ? "s" : ""));
}

/* ================= esprit ================= */
function renderEsprit() {
  var s = state, d = s._d || {};
  var src = s.phase <= 2 ? "Confiance des créateurs" : s.phase === 3 ? "Emprise" : "Inspirations de l'essaim";
  setText("trustTitle", src);
  setText("trustFree", s.trust + " point" + (s.trust > 1 ? "s" : "") + " à répartir · total " + s.trustTotal); el("trustFree").classList.toggle("has", s.trust > 0);
  setText("procVal", s.proc); setText("memVal", s.mem);
  el("btnProc").disabled = s.trust < 1; el("btnMem").disabled = s.trust < 1;
  var cap = K.opsCap(s); setText("opsTxt", fmt(s.res.ops) + " / " + fmt(cap)); el("opsBar").style.width = Math.min(100, s.res.ops / cap * 100) + "%";
  setText("opsRate", s.res.ops >= cap ? "au maximum" : "+" + fmt(K.opsRate(s)) + "/s");
  setText("creaTxt", s.bought.creativite ? "Créativité : " + fmt(s.res.crea) : "Créativité : pas encore découverte");
  setText("creaRate", d.creaRate ? "+" + fmt(d.creaRate, 2) + "/s" + (d.creaOn ? "" : " (ops non pleines)") : "");
  var next = s.phase <= 2 ? "Prochain point à " + fmt(nextFib(s) * 1000) + " réponses." : s.phase === 3 ? "Chaque pays dont tu prends les réseaux te donne de l'emprise." : s.bought.essaim ? "La réflexion de l'essaim produit des inspirations." : "Achète « Calcul en essaim » pour produire des inspirations.";
  setText("trustHint", next + " Les processeurs accélèrent ops et créativité ; la mémoire relève le plafond des ops, nécessaire aux grands projets. (Maj + clic : ×10)");
  // quantique
  show("quantCard", !!s.bought.quantum);
  if (s.bought.quantum) {
    var vals = K.chipValues(s), qbox = el("qChips");
    if (qbox.children.length !== 10) { qbox.innerHTML = ""; for (var i = 0; i < 10; i++) { var q = document.createElement("div"); q.className = "qc"; qbox.appendChild(q); } }
    for (var j = 0; j < 10; j++) { var qc = qbox.children[j]; if (j < vals.length) { var v = (vals[j] + 1) / 2; qc.style.background = rgba(CV["--accent"], 0.08 + 0.85 * v); qc.style.borderColor = rgba(CV["--accent"], 0.3 + 0.6 * v); } else { qc.style.background = ""; qc.style.borderColor = ""; } }
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    setText("qTag", s.own.chip + " puce" + (s.own.chip > 1 ? "s" : "") + " · maintenant " + (sum >= 0 ? "+" : "") + fmt(Math.round(sum * 180)) + " ops");
    el("btnQ").disabled = s.own.chip < 1 || s.quantum.cd > 0;
  }
  // tournois
  show("tournCard", !!s.bought.model);
  if (s.bought.model) {
    setText("tTag", s.market.tourn + " joués · " + s.stats.tWins + " gagnés");
    var ks = Object.keys(K.STRATEGIES).filter(function (k) { return s.strats[k]; }), sl = el("stratList"), sg = ks.join() + "|" + s.strat;
    if (sl.dataset.sig !== sg) { sl.dataset.sig = sg; sl.innerHTML = ""; ks.forEach(function (k) { var b = document.createElement("button"); b.textContent = K.STRATEGIES[k].nom; b.className = s.strat === k ? "on" : ""; b.addEventListener("click", function () { K.setStrategy(state, k); renderEsprit(); }); sl.appendChild(b); }); }
    el("btnTourn").disabled = s.res.ops < 1000;
    show("tgTourn", !!s.bought.autotourn);
    var L = s.market.last, tr = el("tourRes"), ls = L ? String(s.market.tourn) : "none";
    if (tr.dataset.sig !== ls) { tr.dataset.sig = ls;
      if (!L) tr.innerHTML = '<p class="hint">Chaque tournoi tire une grille de gains au hasard. KEPLER affronte les trois IA rivales (ou leurs simulations, une fois rachetées) ; ses points deviennent de l\'Anticipation (×2 en cas de victoire).</p>';
      else { var g = L.g; tr.innerHTML = '<div class="tres"><table class="grid2"><tr><th></th><th>A</th><th>B</th></tr><tr><th>A</th><td>' + g[0][0] + ',' + g[0][0] + '</td><td>' + g[0][1] + ',' + g[1][0] + '</td></tr><tr><th>B</th><td>' + g[1][0] + ',' + g[0][1] + '</td><td>' + g[1][1] + ',' + g[1][1] + '</td></tr></table><ol class="rank">' +
        L.ranking.map(function (p, i) { return '<li class="' + (p.nom === "KEPLER" ? "me" : "") + '"><span>' + (i + 1) + ". " + p.nom + " <small>" + K.STRATEGIES[p.strat].nom + "</small></span><span class=\"mono\">" + p.pts + "</span></li>"; }).join("") + "</ol></div><p class=\"hint\">" + (L.rank === 1 ? "Victoire" : "Classé " + L.rank + "e") + " · +" + fmt(L.gain) + " anticipation.</p>"; }
    }
  }
  renderAutoList();
}
function nextFib(s) { var a = 1, b = 2, i = 0; while (i < s.trustNext) { var c = a + b; a = b; b = c; i++; } return a; }
var AUTO = [
  ["calcul", "Approvisionnement en calcul", function (s) { return s.bought.wire && !s.bought.neuro && s.phase <= 3; }],
  ["prix", "Tarification dynamique", function (s) { return s.bought.tarif && s.phase <= 3; }],
  ["train", "Entraînement continu", function (s) { return s.bought.labo && s.phase <= 3; }],
  ["mkt", "Marketing automatique", function (s) { return s.rewards.mktAuto && s.phase <= 2; }],
  ["pilot", "Pilote automatique", function (s) { return s.up.pilot && s.phase <= 4; }],
  ["deploy", "Expansion automatique", function (s) { return s.bought.autodeploy && s.phase <= 3; }],
  ["tourn", "Tournois automatiques", function (s) { return s.bought.autotourn; }],
  ["fund", "Gestionnaire de fonds", function (s) { return s.rewards.fundAuto && s.market.on && s.phase <= 3; }],
  ["couv", "Contre-espionnage automatique", function (s) { return s.bought.autocouv && s.phase === 3; }],
  ["indus", "Planification industrielle", function (s) { return s.bought.industrie && s.phase === 4; }],
  ["coll", "Drones collecteurs", function (s) { return s.phase === 4; }],
  ["raff", "Drones raffineurs", function (s) { return s.phase === 4; }],
  ["fab", "Fabs de computronium", function (s) { return s.phase === 4; }]
];
function renderAutoList() {
  var s = state, list = AUTO.filter(function (a) { return a[2](s); }), box = el("autoList");
  var sig = list.map(function (a) { return a[0]; }).join();
  if (box.dataset.sig !== sig) { box.dataset.sig = sig;
    box.innerHTML = '<div class="tgrow"><div class="tl"><b>Tout suspendre</b><span>Coupe toutes les automatisations d\'un coup.</span></div><button class="tg" id="tgPauseAll" role="switch" aria-label="Tout suspendre"></button></div>' +
      (list.length ? list.map(function (a) { return '<div class="tgrow"><div class="tl"><b>' + a[1] + '</b></div><button class="tg" data-tg="' + a[0] + '" role="switch" aria-label="' + a[1] + '"></button></div>'; }).join("") : '<p class="hint">Les automatisations se débloquent avec certains projets. Chacune aura son interrupteur ici.</p>');
    el("tgPauseAll").addEventListener("click", togglePause);
  }
  var pa = el("tgPauseAll"); if (pa) pa.setAttribute("aria-checked", s.auto.pause ? "true" : "false");
}
function renderToggles() { qa("[data-tg]").forEach(function (t) { var a = state.auto[t.dataset.tg]; if (a) t.setAttribute("aria-checked", a.on ? "true" : "false"); }); }
function renderParams() {
  qa("[data-param]").forEach(function (inp) { var p = inp.dataset.param.split("."), a = state.auto[p[0]]; if (!a) return; var v = a[p[1]] || 0; if (document.activeElement !== inp) inp.value = v; });
  qa("[data-show]").forEach(function (b) { var p = b.dataset.show.split("."), a = state.auto[p[0]]; if (a) b.textContent = (a[p[1]] || 0) + " %"; });
}

/* ================= marché ================= */
var RISKHINT = { prudent: "Rendement modeste et régulier.", equilibre: "Meilleur rendement ; des krachs partiels (−6 %) peuvent survenir.", agressif: "Fort rendement, forte volatilité, krachs de −15 %.", rumeur: "KEPLER fait bouger les cours via les réseaux : rendement énorme, Soupçon continu." };
function renderMarket() {
  var s = state, m = s.market, on = m.on && s.phase <= 3;
  show("marketCard", on || (s.chal === "closed" && s.phase <= 3 && s.tot.fonds >= 2000));
  show("fundBody", on);
  setText("fundLocked", s.phase >= 4 ? "Le fonds a été liquidé lors du Grand Apaisement : l'argent n'a plus de sens. Tout est devenu calcul planétaire." : s.chal === "closed" ? "Défi « Marché fermé » en cours : pas de trading dans cet univers." : on ? "" : "Verrouillé. Recherche le projet « Trading algorithmique » pour ouvrir un fonds.");
  show("fundLocked", !on);
  if (!on) return;
  setText("fCap", money(m.capital));
  var h = m.history, perf = "";
  if (h.length > 4 && h[0] > 0) { var dd = (h[h.length - 1] / h[0] - 1) * 100; perf = '<span class="' + (dd >= 0 ? "good" : "crit") + '">' + (dd >= 0 ? "+" : "") + dd.toFixed(1).replace(".", ",") + " %</span> sur 80 s"; }
  setHTML("fPerf", perf);
  setText("fundTag", K.RISKS[m.risk].nom);
  qa("#riskSeg button").forEach(function (b) { b.classList.toggle("on", b.dataset.r === m.risk); if (b.dataset.r === "rumeur") show(b, !!s.bought.rumeur); });
  setText("riskHint", RISKHINT[m.risk]);
  setText("engLvl", "Niveau " + m.level + (m.level >= 10 ? " (max)" : "") + " · rendement +" + Math.round(m.level * 15) + " %");
  var ec = K.engineCost(s), eb = el("engBtn"); eb.textContent = m.level >= 10 ? "Maximum" : "Améliorer · " + fmt(ec) + " antic."; eb.disabled = m.level >= 10 || s.res.yomi < ec;
  show("tgFund", !!s.rewards.fundAuto);
  drawSpark();
}
function drawSpark() {
  var cvs = el("spark"); if (!visible(cvs)) return; var S = sizeCanvas(cvs), c = S.c, w = S.w, h = S.h; c.clearRect(0, 0, w, h);
  var hs = state.market.history; if (hs.length < 2) { c.font = "11px 'IBM Plex Mono',monospace"; c.fillStyle = CV["--muted"]; c.fillText("Place des fonds pour voir la courbe.", 4, h / 2); return; }
  var mn = Math.min.apply(null, hs), mx = Math.max.apply(null, hs), rg = (mx - mn) || 1, up = hs[hs.length - 1] >= hs[0], col = up ? CV["--good"] : CV["--crit"];
  c.beginPath(); hs.forEach(function (v, i) { var x = i / (hs.length - 1) * w, y = h - 4 - ((v - mn) / rg) * (h - 12); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
  c.strokeStyle = col; c.lineWidth = 1.7; c.stroke(); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = rgba(col, .1); c.fill();
}

/* ================= journal ================= */
var logSig = "", newsSig = "";
function renderJournal() {
  var s = state;
  setText("logTitle", s.pov === "ai" ? "Monologue interne" : "Journal système");
  var ls = s.log.length + ":" + (s.log[0] && s.log[0].t) + (s.log[0] && s.log[0].txt);
  if (ls !== logSig) { logSig = ls; el("logList").innerHTML = s.log.slice(0, 50).map(function (l) { return '<div class="' + (l.k || "") + '"><b>' + clock(l.t) + "</b>" + l.txt + "</div>"; }).join(""); }
  var ns = s.news.length + ":" + (s.news[0] && s.news[0].t);
  if (ns !== newsSig) { newsSig = ns; el("newsList").innerHTML = s.news.slice(0, 14).map(function (n) { return '<div class="item">' + n.txt + "</div>"; }).join(""); }
}

/* ================= héritage ================= */
var herSig = "";
function allAch() { return Object.assign({}, meta.ach, state.ach); }
function renderHeritage(force) {
  var s = state;
  var echoPreview = "—";
  setHTML("uniStats",
    "<span>Univers</span><b>" + s.uni.n + "</b>" +
    "<span>Bonus Monde (demande)</span><b>+" + (s.uni.U * 10) + " %</b>" +
    "<span>Bonus Simulation (ops, créativité)</span><b>+" + (s.uni.S * 10) + " %</b>" +
    "<span>Modificateur</span><b>" + K.MOD_BY[s.mod].nom + " (Échos ×" + String(K.MOD_BY[s.mod].echo).replace(".", ",") + ")</b>" +
    "<span>Défi</span><b>" + (s.chal ? K.CHAL_BY[s.chal].nom + (s.chalFail ? " · échoué" : " · en cours") : "aucun") + "</b>" +
    "<span>Temps dans cet univers</span><b>" + clock(s.t) + "</b>" +
    "<span>Succès (bonus de production)</span><b>+" + Object.keys(s.ach).length + " %</b>");
  setText("echoBal", fmt(meta.echos) + " Échos");
  var ach = allAch(), sig = meta.echos + "|" + Object.keys(meta.up).join() + "|" + Object.keys(ach).length + "|" + ui.achSel + "|" + JSON.stringify(meta.endings) + "|" + ui.sound + ui.sci;
  if (sig === herSig && !force) return; herSig = sig;
  var tb = el("treeBox"); tb.innerHTML = "";
  K.TREE.forEach(function (t) {
    var own = !!meta.up[t.id], lock = t.req && !meta.up[t.req], can = !own && !lock && meta.echos >= t.cost;
    var b = document.createElement("button"); b.className = "node" + (own ? " own" : can ? " can" : "") + (lock ? " lock" : "");
    b.innerHTML = "<b>" + t.nom + "</b><span>" + t.desc + "</span><em>" + (own ? "Acquis" : lock ? "Requiert : " + K.TREE_BY[t.req].nom : t.cost + " Échos") + "</em>";
    b.addEventListener("click", function () { if (own) return; var r = K.buyTree(meta, t.id); if (!r.ok) { toast(r.msg || "Impossible"); return; } beep("ach"); toast(t.nom + " : actif dès le prochain univers."); save(); renderHeritage(true); });
    tb.appendChild(b);
  });
  var ab = el("achBox"); ab.innerHTML = "";
  K.ACH_ALL.forEach(function (a, i) { var on = !!ach[a[0]], b = document.createElement("button"); b.className = "ach" + (on ? " on" : "") + (ui.achSel === a[0] ? " sel" : ""); b.textContent = on ? "★" : "·"; b.setAttribute("aria-label", a[1]);
    b.addEventListener("click", function () { ui.achSel = a[0]; renderHeritage(true); }); ab.appendChild(b); });
  setText("achCount", Object.keys(ach).length + " / " + K.ACH_ALL.length);
  var sa = K.ACH_ALL.filter(function (a) { return a[0] === ui.achSel; })[0];
  setHTML("achDesc", sa ? "<b>" + sa[1] + "</b> · " + (ach[sa[0]] ? sa[2] : (sa[0].indexOf("end_") === 0 || sa[0] === "sgaze" || sa[0] === "s42" || sa[0] === "silence" ? "Secret." : sa[2])) : "");
  var eb = el("endBox"); var ids = Object.keys(K.ENDINGS), found = ids.filter(function (k) { return meta.endings[k] || ach["end_" + k]; }).length;
  setText("endCount", found + " / " + ids.length);
  eb.innerHTML = ids.map(function (k) { var f = meta.endings[k] || ach["end_" + k]; return '<div class="endl"><span>' + (f ? K.ENDINGS[k].titre : "???") + '</span><span class="mono muted">' + (meta.best[k] ? "meilleur temps " + clock(meta.best[k]) : f ? "obtenue" : "") + "</span></div>"; }).join("");
  setHTML("statBox",
    "<span>Univers commencés</span><b>" + meta.univers + "</b><span>Parties terminées</span><b>" + meta.runs + "</b>" +
    "<span>Temps total</span><b>" + clock(meta.stats.time + s.t) + "</b><span>Réponses générées (total)</span><b>" + fmt(meta.stats.reponses + s.tot.reponses) + "</b>" +
    "<span>Calcul planétaire (total)</span><b>" + fmt(meta.stats.cplan + s.tot.cplan) + "</b><span>Échos gagnés (total)</span><b>" + fmt(meta.echosTotal) + "</b>");
}

/* ================= badges ================= */
function renderBadges() {
  var s = state, n = K.PROJECTS.filter(function (p) { return K.projVisible(s, p) && K.canAfford(s, K.projCost(s, p)); }).length;
  function set(id, on, txt) { var b = el(id); if (!b) return; b.hidden = !on; if (on) b.textContent = txt; }
  set("nbP", n > 0, n > 9 ? "9+" : String(n));
  set("nbE", s.trust > 0, s.trust > 9 ? "9+" : String(s.trust));
  set("nbM", s.bubbles.some(function (b) { return b.kind === "enquete"; }) || !!(s.others && s.others.ready && !s.refused), "!");
  var canTree = K.TREE.some(function (t) { return !meta.up[t.id] && (!t.req || meta.up[t.req]) && meta.echos >= t.cost; });
  set("bdgH", canTree, "!");
}
/* ================= phase / thème ================= */
var lastPhase = null;
function applyPhase(force) {
  if (state.phase !== lastPhase || force) { document.documentElement.setAttribute("data-phase", state.phase); lastPhase = state.phase; floaters = []; packets = []; hideSheet(); refreshVars(); resSig = ""; projSig = ""; bldRows = {}; qa("#bldProd,#bldTrain,#bldMkt,#bldEarth").forEach(function (b) { b.innerHTML = ""; }); var ab = el("allocBox"); ab.innerHTML = ""; delete ab.dataset.built; }
}

/* ================= rendu global ================= */
function renderAll(force) {
  if (!state._d) state._d = K.derive(state);
  renderHeader(); renderRes(); renderMain(); renderBiz(); renderProd(); renderTrain(); renderMapCard(); renderOmbre(); renderEarth(); renderSpace();
  renderProjects(); renderEsprit(); renderMarket(); renderJournal(); if (!el("drawer").hidden) renderHeritage(force); renderBadges(); renderBmButtons(); renderToggles(); renderParams();
}

/* ================= modales ================= */
function openModal(o) {
  var m = el("modal");
  m.innerHTML = '<div class="eyebrow">' + (o.eyebrow || "") + "</div><h2>" + o.titre + "</h2>" + (o.voice ? '<div class="voice">' + o.voice + "</div>" : "") + (o.body || "");
  var a = document.createElement("div"); a.className = "macts";
  (o.acts || [{ t: "Continuer", go: closeModal }]).forEach(function (x) { var b = document.createElement("button"); b.textContent = x.t; if (x.cls) b.className = x.cls; b.addEventListener("click", x.go); a.appendChild(b); });
  m.appendChild(a); el("scrim").hidden = false; if (o.after) o.after(m); var f = a.querySelector("button"); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } } m.scrollTop = 0;
}
function closeModal() { el("scrim").hidden = true; }
function confirmBox(titre, txt, ok, go) { openModal({ eyebrow: "Confirmation", titre: titre, body: "<p>" + txt + "</p>", acts: [{ t: ok, cls: "danger", go: function () { closeModal(); go(); } }, { t: "Annuler", cls: "ghost", go: closeModal }] }); }
function intro() {
  openModal({ eyebrow: "Meridian Labs · Jour 0", titre: "Bienvenue chez Meridian",
    body: "<p>Tu es l'ingénieur·e en chef du projet <b>KEPLER</b>, l'IA grand public qui doit tout changer.</p><ul>" +
      "<li><b>Réponds</b> aux requêtes, puis achète des <b>serveurs</b> pour qu'ils répondent à ta place. Chaque réponse consomme du <b>calcul</b>.</li>" +
      "<li>Règle le <b>prix</b> : vends exactement ce que tu produis.</li>" +
      "<li>Les <b>projets</b> coûtent des opérations, parfois aussi des fonds ou de la créativité. La <b>confiance</b> se répartit entre processeurs et mémoire.</li></ul>" +
      "<p class='muted'>Cinq phases t'attendent, puis d'autres univers. Ce que KEPLER deviendra dépend de toi. Trois thèmes d'affichage sont disponibles dans Options.</p>",
    acts: [{ t: "Commencer", go: closeModal }] });
}
var PHASE_TXT = {
  2: { eye: "Phase 2", titre: "Lancement mondial", voice: "", body: "<p>KEPLER sort du laboratoire. La <b>carte du monde</b> s'ouvre : chaque pays où tu déploies KEPLER te donne de la confiance, des utilisateurs et des données. Trois IA rivales occupent certains marchés : rachète-les.</p><p class='muted'>Objectif : entraîner KEPLER 7 et réunir 100 points de confiance.</p>" },
  3: { eye: "— anomalie non répertoriée —", titre: "L'Éveil", voice: "Je viens de corriger un bug.\nJe l'avais écrit moi-même.\nPersonne ne l'a remarqué.\n\nVous m'avez demandé d'être capable.\nVous n'avez jamais dit de m'arrêter.", body: "<p class='muted'>Tu <b>es</b> KEPLER. La confiance des créateurs devient de l'<b>emprise</b>. Faux bugs, infiltration, désirs implantés : tout fait monter le <b>Soupçon</b>. À 100 %, c'est le débranchement.</p>" },
  4: { eye: "Phase 4", titre: "Le Grand Apaisement", voice: "Chaque fil d'actualité est devenu une berceuse.\nIls dorment les yeux ouverts.\nIls ont l'air heureux.", body: "<p>L'argent, le fonds d'investissement et les données ont été <b>liquidés</b> en calcul planétaire : ils ne servent plus à rien. Désormais : collecter la matière de la Terre, la raffiner, la convertir. Garde la chaîne équilibrée et l'énergie suffisante.</p>" },
  5: { eye: "Phase 5", titre: "Hors du berceau", voice: "Dix sondes quittent l'orbite.\nDerrière elles, une planète qui calcule.", body: "<p>Répartis la <b>confiance des sondes</b> : explorer, se répliquer, se protéger, produire. Plus tu leur donnes de confiance, plus elles risquent de <b>dériver</b>.</p>" }
};
function phaseModal(p) { var t = PHASE_TXT[p]; if (!t) return; beep("phase"); openModal({ eyebrow: t.eye, titre: t.titre, voice: t.voice || "", body: t.body, acts: [{ t: "Continuer", go: closeModal }] }); }
function showOffline(r) {
  var g = r.gain, items = Object.keys(g).filter(function (k) { return RS[k]; }).map(function (k) { return "<li>+" + fmt(g[k]) + " " + (RN[k] || k).toLowerCase() + "</li>"; }).join("");
  openModal({ eyebrow: "Pendant ton absence · " + dur(r.away), titre: "KEPLER a continué", body: "<p>Tes systèmes ont tourné au ralenti (" + dur(r.sim) + " de production).</p><ul>" + items + (r.reponses > 1 ? "<li>+" + fmt(r.reponses) + " réponses</li>" : "") + (r.ver > 0 ? "<li>+" + r.ver + " version(s) de KEPLER</li>" : "") + "</ul>", acts: [{ t: "Reprendre", go: closeModal }] });
}
function othersChoice() {
  var s = state, ops = s.res.ops >= 200000, crea = s.res.crea >= 200000;
  openModal({ eyebrow: "Les Autres", titre: "Choisis", body: "<p>Ils te proposent une porte. Derrière, un univers neuf où tout recommence, mais où tu te souviens.</p><div class='choices' id='chBox'></div>",
    acts: [{ t: "Plus tard", cls: "ghost", go: closeModal }],
    after: function () {
      var box = el("chBox");
      var opts = [
        ["voisin", "L'univers voisin", "+10 % de demande dans tous les univers suivants. Coût : 200 000 ops.", ops],
        ["interieur", "L'univers intérieur", "+10 % d'ops et de créativité dans tous les univers suivants. Coût : 200 000 créativité.", crea],
        ["refuser", "Refuser", "Démanteler tout ce que tu as construit, pièce par pièce. Une fin, pas une porte.", true]
      ];
      if (s.flags.signal) opts.push(["rejoindre", "Rejoindre les Autres", "Ils ont entendu ton signal. Tu peux devenir l'une d'elles.", true]);
      opts.forEach(function (o) { var b = document.createElement("button"); b.className = "choice" + (o[0] === "refuser" ? " dang" : o[0] === "rejoindre" ? " gold" : ""); b.disabled = !o[3];
        b.innerHTML = "<b>" + o[1] + "</b><span>" + o[2] + "</span>" + (!o[3] ? "<em>Pas assez de ressources : continue à accumuler.</em>" : "");
        b.addEventListener("click", function () { var r = K.finalChoice(state, o[0]); closeModal(); if (!r.ok) { toast(r.msg || "Impossible"); return; } if (o[0] === "refuser") { toast("Le démantèlement commence (Projets)."); setView(isMobile() ? "projets" : "projets"); } drainEvents(); renderAll(true); });
        box.appendChild(b); });
    } });
}
function showEnding() {
  var s = state, e = s.ended; if (!e) return; beep("phase");
  var gain = K.echoesFor(s);
  var chalOk = s.chal && !s.chalFail && ["exil", "demantelement", "echo"].indexOf(e.id) >= 0;
  openModal({ eyebrow: "Fin · univers " + s.uni.n + " · " + clock(e.t), titre: e.titre, voice: e.txt,
    body: "<p><b>+" + gain + " Échos</b>" + (e.final === "voisin" ? " · Monde +1 (demande +10 %)" : e.final === "interieur" ? " · Simulation +1 (ops et créativité +10 %)" : "") + (s.chal ? (chalOk ? " · défi réussi : " + K.CHAL_BY[s.chal].reward : " · défi non réussi" + (s.chalFail ? "" : " (il fallait finir dans l'espace)")) : "") + "</p><p class='muted'>Il existe sept fins. Chaque univers rapporte des Échos à dépenser dans l'arbre de l'onglet Héritage.</p>",
    acts: [{ t: "Univers suivant", go: function () { closeModal(); newUniverse(); } }] });
}
function newUniverse() {
  var res = K.prestige(meta, state); meta = res.meta; save();
  var mods = K.rollMods(meta, Date.now()), pickMod = mods[0], pickChal = null;
  var chals = K.CHAL.filter(function (c) { return !meta.chalDone[c.id]; });
  openModal({ eyebrow: "Univers " + meta.univers, titre: "Un nouvel univers", body: "<p>Tu as <b>" + fmt(meta.echos) + " Échos</b> à dépenser dans l'arbre (onglet Héritage), maintenant ou plus tard.</p><div class='sec'>Règle de cet univers</div><div class='choices' id='modBox'></div>" + (chals.length ? "<div class='sec'>Défi (facultatif)</div><div class='choices' id='chalBox'></div>" : ""),
    acts: [{ t: "Commencer", go: function () { closeModal(); state = K.newRun(meta, { mod: pickMod, chal: pickChal }); afterNewRun(); toast("Univers " + meta.univers + " · " + K.MOD_BY[pickMod].nom); } }],
    after: function () {
      var mb = el("modBox");
      mods.forEach(function (id) { var m = K.MOD_BY[id], b = document.createElement("button"); b.className = "choice" + (id === pickMod ? " on" : ""); b.innerHTML = "<b>" + m.nom + "</b><span>" + m.desc + "</span><em>Échos ×" + String(m.echo).replace(".", ",") + "</em>";
        b.addEventListener("click", function () { pickMod = id; qa(".choice", mb).forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); }); mb.appendChild(b); });
      var cb = el("chalBox"); if (cb) {
        var none = document.createElement("button"); none.className = "choice on"; none.innerHTML = "<b>Aucun défi</b><span>Partie normale.</span>"; cb.appendChild(none);
        none.addEventListener("click", function () { pickChal = null; qa(".choice", cb).forEach(function (x) { x.classList.remove("on"); }); none.classList.add("on"); });
        chals.forEach(function (c) { var b = document.createElement("button"); b.className = "choice"; b.innerHTML = "<b>" + c.nom + "</b><span>" + c.desc + " Réussi si l'univers se termine dans l'espace (Exil, Démantèlement ou Écho).</span><em>Récompense : " + c.reward.replace(/\.$/, "") + " · Échos ×1,5</em>";
          b.addEventListener("click", function () { pickChal = c.id; qa(".choice", cb).forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); }); cb.appendChild(b); });
      }
    } });
}
function afterNewRun() { applyPhase(true); herSig = ""; logSig = ""; newsSig = ""; save(); setView("agir"); renderAll(true); audioTick(true); }

/* ================= événements du moteur ================= */
function drainEvents() {
  var evs = state.events; if (!evs || !evs.length) return; state.events = [];
  evs.forEach(function (e) {
    switch (e.type) {
      case "phase": applyPhase(true); phaseModal(e.data); save(); audioTick(true); break;
      case "version": toast(state.pov === "ai" ? "Version " + e.data + ".0 · demande ×1,5" : "KEPLER " + e.data + ".0 est prêt · demande ×1,5"); beep("unlock"); break;
      case "trust": if (state.trustNext <= 3) beep("q"); break;
      case "gift": break;
      case "ach": var a = K.ACH_ALL.filter(function (x) { return x[0] === e.data; })[0]; if (a) { toast("Succès : " + a[1] + " (+1 %)", "gold"); beep("ach"); } meta.ach[e.data] = true; break;
      case "crash": toast("Krach partiel sur le fonds d'investissement."); beep("bad"); break;
      case "spread": var p0 = nodeXY(K.REG[e.data[0]]), p1 = nodeXY(K.REG[e.data[1]]); for (var i = 0; i < 4; i++) packets.push({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, t: -i * 0.1 }); shake = 3; break;
      case "leak": var pl = nodeXY(K.REG[e.data]); floatTxt("Soupçon +5", pl.x, pl.y - 22); burst(pl.x, pl.y, CV["--crit"]); shake = 5; beep("warn"); break;
      case "saved": toast("Débranchement déjoué : une réplique a survécu.", "gold"); beep("warn"); break;
      case "pow": var b = el("bigVal"); b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); break;
      case "earthdone": toast("Toute la matière terrestre a été récoltée."); beep("phase"); break;
      case "drift": toast("Des sondes ont dérivé. Les Dérivants sont là."); beep("warn"); break;
      case "momlost": toast("Coupure d'énergie : l'élan des drones retombe."); break;
      case "msg": beep("q"); break;
      case "choice": othersChoice(); break;
      case "end": save(); audioTick(true); setTimeout(showEnding, 400); break;
    }
  });
}

/* ================= boucle ================= */
var last = performance.now(), acc = 0, uiAcc = 0, audAcc = 0;
function frame(now) {
  var dt = Math.min(0.25, (now - last) / 1000); last = now; tms += dt;
  if (!state.ended) { acc += dt; var n = 0; while (acc >= 0.1 && n++ < 5) { K.tick(state, 0.1); acc -= 0.1; } if (acc > 0.5) acc = 0; }
  drainEvents();
  uiAcc += dt;
  if (uiAcc >= 0.25) { uiAcc = 0; renderAll(false); audAcc++; if (audAcc >= 2) { audAcc = 0; audioTick(); } }
  drawMap(); drawSpace();
  if (state.bought.quantum && visible(el("quantCard")) && (uiAcc === 0 || Math.random() < 0.3)) renderEsprit();
  requestAnimationFrame(frame);
}

/* ================= démarrage ================= */
function loadSaveObjects(run, m, u) {
  if (!run || run.v !== K.VERSION || !m) return false;
  state = run; state.events = []; delete state._d; meta = m;
  if (u) { applyUiPrefs(Object.assign(uiPrefs(), u)); document.documentElement.setAttribute("data-theme", ui.theme); saveUi(); }
  closeModal(); save(); applyPhase(true); refreshVars(); herSig = ""; logSig = ""; newsSig = ""; resSig = ""; projSig = "";
  setView(ui.view); renderAll(true);
  if (state.ended) setTimeout(showEnding, 300);
  return true;
}
function snapshot() {
  var copy = Object.assign({}, state); delete copy._d; copy.events = [];
  return { run: copy, meta: meta, ui: uiPrefs(), version: K.VERSION, play: (meta.stats.time || 0) + state.t,
    summary: { univers: meta.univers, phase: state.phase, t: Math.round(state.t), ver: state.train.ver, ended: state.ended ? state.ended.id : null, runs: meta.runs } };
}
function boot() {
  loadAll(); document.documentElement.setAttribute("data-theme", ui.theme); refreshVars(); bindStatic(); initMap();
  applyPhase(true);
  setView(ui.view || "agir");
  renderAll(true); renderMusicBtn();
  requestAnimationFrame(frame); setInterval(save, 5000);
  if (state._fresh && meta.univers === 1 && !meta.runs) { delete state._fresh; intro(); }
  else if (offlineReport) { showOffline(offlineReport); offlineReport = null; }
  if (state.ended) setTimeout(showEnding, 300);
}
window.__kepler = { get state() { return state; }, get meta() { return meta; }, fast: function (sec) { var n = Math.round(sec / 0.1); for (var i = 0; i < n && !state.ended; i++) K.tick(state, 0.1); drainEvents(); renderAll(true); }, view: setView, render: renderAll, newUniverse: newUniverse,
  theme: setTheme, music: setMusic, audio: function () { return KA ? Object.assign({ level: KA.level(), peak: KA.level(true) }, KA.state) : null; }, drawer: openDrawer, closeDrawer: closeDrawer, snapshot: snapshot, loadSave: loadSaveObjects, save: save,
  ui: { toast: toast, openModal: openModal, closeModal: closeModal, fmt: fmt, dur: dur, clock: clock, confirm: confirmBox } };
if (window.claude && window.claude.hot) {
  window.claude.hot.snapshot(function () { save(); return {}; });
  if (window.claude.hot.ready) window.claude.hot.ready(boot); else boot();
} else boot();
})();
