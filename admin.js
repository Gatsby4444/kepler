/* KEPLER — menu administrateur (réservé au créateur du jeu).
   Le code n'est jamais écrit ici : seule son empreinte PBKDF2 l'est, ce qui empêche de le retrouver en lisant le code.
   Une fois déverrouillé, l'appareil s'en souvient (bouton « Verrouiller » pour l'oublier).
   Avant chaque série d'ajouts, une copie de la partie est gardée pour pouvoir revenir en arrière. */
(function () {
  "use strict";
  var SALT = "cda6aa3a692e72419ff6d3fb7d93addc", ITER = 200000, HASH = "22a84edb435cb1ffb4f6b490b3cdc37bfc8436ce7311bddf24e5a4c5bf3e5022";
  var KEY = "kepler.admin", BACKUP = "kepler4.adminBackup";
  var KG = function () { return window.__kepler; }, K = window.Kepler;
  var unlocked = false, fails = 0, waitUntil = 0, batch = false, amount = 1e6, sig = "";
  function el(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function norm(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function check(code) {
    var sub = window.crypto && window.crypto.subtle;
    if (!sub) return Promise.reject(new Error("crypto"));
    var enc = new TextEncoder();
    return sub.importKey("raw", enc.encode(norm(code)), "PBKDF2", false, ["deriveBits"])
      .then(function (k) { return sub.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(SALT), iterations: ITER }, k, 256); })
      .then(function (b) { return hex(b) === HASH; });
  }
  function fmt(n) { return KG().ui.fmt(n); }
  function toast(t, c) { KG().ui.toast(t, c); }

  /* ---------- montants : « 2,5M », « 1Md », « 3e12 », « 1 000 000 » ---------- */
  var SUF = { "": 1, k: 1e3, m: 1e6, md: 1e9, t: 1e12, qa: 1e15, qi: 1e18, sx: 1e21, sp: 1e24, oc: 1e27, no: 1e30, dc: 1e33 };
  function parseAmount(str) {
    var s = String(str || "").replace(/[\s  ]/g, "").replace(",", ".");
    var m = s.match(/^(\d*\.?\d+)(e[+-]?\d+)?([a-zA-Z]*)$/); if (!m) return NaN;
    var mul = SUF[m[3].toLowerCase()]; if (mul === undefined) return NaN;
    var v = parseFloat(m[1] + (m[2] || "")) * mul;
    return isFinite(v) && v > 0 ? Math.min(v, 1e300) : NaN;
  }

  /* ---------- ce que le menu peut ajouter ---------- */
  function rows(s) {
    var api = KG(), N = api.names, shown = api.resList(s).L.map(function (x) { return x.k; }), out = [];
    shown.forEach(function (k) { out.push({ id: "res:" + k, nom: N[k], get: function () { return s.res[k] || 0; }, add: function (v) { addRes(s, k, v); } }); });
    if (s.earth && s.phase === 4) {
      out.push({ id: "earth:extr", nom: N.extraite, get: function () { return s.earth.extr; }, add: function (v) { s.earth.extr += v; } });
      out.push({ id: "earth:subs", nom: N.substrat, get: function () { return s.earth.subs; }, add: function (v) { s.earth.subs += v; } });
    }
    if (s.space && s.phase === 5) out.push({ id: "space:probes", nom: "Sondes", get: function () { return s.space.probes; }, add: function (v) { s.space.probes += v; } });
    var other = Object.keys(s.res).filter(function (k) { return shown.indexOf(k) < 0; }).map(function (k) {
      return { id: "res:" + k, nom: N[k] || k, get: function () { return s.res[k] || 0; }, add: function (v) { addRes(s, k, v); } };
    });
    return { main: out, other: other };
  }
  function addRes(s, k, v) {
    s.res[k] = (s.res[k] || 0) + v;
    if (k === "fonds") s.tot.fonds += v;
    if (k === "ops") { // au-delà du plafond, les ops s'évaporent : on agrandit la mémoire pour les garder
      var need = Math.ceil(s.res.ops / K.C.opsPerMem);
      if (need > s.mem) { s.mem = need; toast("Mémoire portée à " + fmt(need) + " pour garder ces ops."); }
    }
  }
  function before() {
    var api = KG();
    if (!batch) { var snap = api.snapshot(); lsSet(BACKUP, JSON.stringify({ at: Date.now(), run: snap.run, meta: snap.meta })); batch = true; }
    api.state.flags.admin = true;
  }
  function after(msg) { var api = KG(); api.save(); api.render(true); sig = ""; render(); if (msg) toast(msg); }

  /* ---------- panneau ---------- */
  var PRESETS = [["1k", 1e3], ["1M", 1e6], ["1Md", 1e9], ["1T", 1e12], ["1Qa", 1e15], ["1Sx", 1e21]];
  function build() {
    var p = el("pAdmin"); if (!p) return;
    p.innerHTML =
      '<section class="card"><div class="hd"><span class="t">Montant à ajouter</span></div><div class="bd adm">' +
        '<div class="apre">' + PRESETS.map(function (x) { return '<button class="btn sm" data-amt="' + x[1] + '">' + x[0] + "</button>"; }).join("") + "</div>" +
        '<label class="hint" for="admAmt" style="display:block;margin:12px 0 6px">Ou un montant libre : 2,5M · 1Md · 3e12 · 1 000 000</label>' +
        '<input type="text" id="admAmt" inputmode="text" autocomplete="off" spellcheck="false" value="1M" aria-label="Montant à ajouter">' +
        '<p class="hint" id="admAmtTxt" style="margin:6px 0 0"></p></div></section>' +
      '<section class="card"><div class="hd"><span class="t">Ressources de cette phase</span><button class="btn sm" id="admAll">Tout ajouter</button></div><div class="bd"><div class="arows" id="admMain"></div></div></section>' +
      '<section class="card"><div class="hd"><span class="t">Esprit</span></div><div class="bd"><div class="arows" id="admMind"></div>' +
        '<p class="hint" style="margin:8px 0 0">La mémoire relève le plafond des ops (1 000 par point) ; les processeurs accélèrent les ops et la créativité.</p></div></section>' +
      '<section class="card"><div class="hd"><span class="t">Autres ressources</span></div><div class="bd"><p class="hint" style="margin:0 0 8px">Pas utilisées dans la phase actuelle : les ajouter ne sert qu\'à préparer la suite.</p><div class="arows" id="admOther"></div></div></section>' +
      '<section class="card"><div class="hd"><span class="t">Héritage</span></div><div class="bd"><div class="arows" id="admMeta"></div></div></section>' +
      '<section class="card"><div class="hd"><span class="t">Sécurité</span></div><div class="bd">' +
        '<p class="hint" style="margin:0 0 10px" id="admUndoTxt"></p>' +
        '<div class="acts" style="margin-top:0"><button class="btn sm" id="admUndo">Annuler mes ajouts</button><button class="btn sm" id="admLock">Verrouiller le menu</button></div></div></section>';
    p.addEventListener("click", onClick);
    el("admAmt").addEventListener("input", function () { var v = parseAmount(this.value); if (isFinite(v)) amount = v; showAmount(isFinite(v)); });
    showAmount(true);
  }
  function showAmount(ok) {
    var t = el("admAmtTxt"); if (!t) return;
    t.textContent = ok ? "Chaque bouton « + » ajoute " + fmt(amount) + (amount >= 1e3 ? " (" + amount.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + ")" : "") + "." : "Montant non reconnu : " + fmt(amount) + " reste sélectionné.";
    t.style.color = ok ? "" : "var(--crit)";
    Array.prototype.forEach.call(document.querySelectorAll("#pAdmin [data-amt]"), function (b) { b.classList.toggle("pri", +b.dataset.amt === amount); });
    Array.prototype.forEach.call(document.querySelectorAll("#pAdmin [data-big]"), function (b) { b.textContent = "+" + fmt(amount); });
  }
  function rowHtml(r) { return '<div class="arow"><span class="alab"><span class="an">' + r.nom + '</span><span class="av" data-v="' + r.id + '"></span></span><button class="btn sm" data-add="' + r.id + '" data-big="1">+' + fmt(amount) + "</button></div>"; }
  function mindRows(s) {
    var L = [
      { id: "trust", nom: "Points de confiance à répartir", get: function () { return s.trust; }, add: function (v) { s.trust += v; s.trustTotal += v; } },
      { id: "proc", nom: "Processeurs", get: function () { return s.proc; }, add: function (v) { s.proc += v; } },
      { id: "mem", nom: "Mémoire", get: function () { return s.mem; }, add: function (v) { s.mem += v; } }
    ];
    if (s.space && s.phase === 5) L.push({ id: "ptrust", nom: "Confiance des sondes", get: function () { return s.space.trust; }, add: function (v) { s.space.trust += v; s.space.cap = Math.max(s.space.cap, s.space.trust); } });
    return L;
  }
  var cur = {};
  function render() {
    var api = KG(); if (!api || !unlocked) return;
    var p = el("pAdmin"); if (!p) return; if (!p.firstChild) build();
    var s = api.state, meta = api.meta, R = rows(s), M = mindRows(s);
    var E = [{ id: "echos", nom: "Échos", get: function () { return meta.echos; }, add: function (v) { meta.echos += v; meta.echosTotal += v; } }];
    cur = {}; R.main.concat(R.other, E).forEach(function (r) { cur[r.id] = r; }); M.forEach(function (r) { cur[r.id] = r; });
    var key = s.phase + "|" + R.main.map(function (r) { return r.id; }).join() + "|" + R.other.length + "|" + M.length;
    if (key !== sig) {
      sig = key;
      el("admMain").innerHTML = R.main.map(function (r) { return rowHtml(r); }).join("");
      el("admOther").innerHTML = R.other.map(function (r) { return rowHtml(r); }).join("") || '<p class="hint" style="margin:0">Aucune.</p>';
      el("admMind").innerHTML = M.map(function (r) { return '<div class="arow"><span class="alab"><span class="an">' + r.nom + '</span><span class="av" data-v="' + r.id + '"></span></span><span class="asm">' +
        [1, 10, 100].map(function (n) { return '<button class="btn sm" data-add="' + r.id + '" data-n="' + n + '">+' + n + "</button>"; }).join("") + "</span></div>"; }).join("");
      el("admMeta").innerHTML = E.map(function (r) { return rowHtml(r); }).join("");
    }
    Array.prototype.forEach.call(p.querySelectorAll("[data-v]"), function (n) {
      var r = cur[n.dataset.v]; if (!r) return; var v = r.get();
      var t = n.dataset.v === "res:fonds" ? fmt(v) + " €" : n.dataset.v === "res:ops" ? fmt(v) + " / " + fmt(K.opsCap(s)) : fmt(v);
      if (n.textContent !== t) n.textContent = t;
    });
    var b = null; try { b = JSON.parse(lsGet(BACKUP) || "null"); } catch (e) {}
    el("admUndo").disabled = !b;
    var ut = b ? "Une copie de ta partie a été gardée " + (function (ms) { var m = Math.round(ms / 60000); return m < 1 ? "il y a moins d'une minute" : "il y a " + KG().ui.dur(ms / 1000); })(Date.now() - b.at) + ", juste avant ta dernière série d'ajouts." : "Avant chaque série d'ajouts, une copie de ta partie est gardée sur cet appareil : tu pourras revenir en arrière.";
    if (el("admUndoTxt").textContent !== ut) el("admUndoTxt").textContent = ut;
  }
  function onClick(e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.dataset.amt) { amount = +t.dataset.amt; el("admAmt").value = t.textContent; showAmount(true); return; }
    if (t.dataset.add) {
      var r = cur[t.dataset.add]; if (!r) return; var v = t.dataset.n ? +t.dataset.n : amount;
      before(); r.add(v); after("+" + fmt(v) + " · " + r.nom); return;
    }
    if (t.id === "admAll") {
      var s = KG().state, R = rows(s); before(); R.main.forEach(function (r) { r.add(amount); }); after("+" + fmt(amount) + " sur chaque ressource de la phase"); return;
    }
    if (t.id === "admUndo") {
      var b = null; try { b = JSON.parse(lsGet(BACKUP) || "null"); } catch (e2) {}
      if (!b) return;
      KG().ui.confirm("Annuler mes ajouts", "La partie revient à son état d'il y a " + KG().ui.dur((Date.now() - b.at) / 1000) + ", juste avant tes derniers ajouts. Ce que tu as joué depuis est aussi annulé.", "Revenir en arrière", function () {
        if (KG().loadSave(b.run, b.meta)) {
          lsDel(BACKUP); batch = false; sig = ""; KG().drawer("admin"); toast("Partie restaurée.");
          // retour en arrière voulu : la copie en ligne est remplacée, sans demander de choisir entre les deux
          if (window.KeplerCloud && window.KeplerCloud.status === "ok") window.KeplerCloud.push(true);
        }
        else toast("Copie illisible : rien n'a changé.");
      });
      return;
    }
    if (t.id === "admLock") { lsDel(KEY); unlocked = false; batch = false; showTab(); KG().drawer("options"); toast("Menu administrateur verrouillé sur cet appareil."); return; }
  }

  /* ---------- accès ---------- */
  function showTab() { var b = document.querySelector('.dtabs [data-d="admin"]'); if (b) b.hidden = !unlocked; renderEntry(); }
  function renderEntry() { var t = el("admEntryTxt"); if (t) t.textContent = unlocked ? "Déverrouillé sur cet appareil." : "Réservé au créateur du jeu. Protégé par un code."; var b = el("btnAdmin"); if (b) b.textContent = unlocked ? "Ouvrir le menu administrateur" : "Accès administrateur"; }
  function open() {
    if (unlocked) { KG().drawer("admin"); return; }
    var api = KG();
    api.ui.openModal({ eyebrow: "Administrateur", titre: "Code d'accès", body: '<p>Entre le code du menu administrateur.</p><input type="text" id="admCode" class="admcode" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="20" aria-label="Code administrateur"><p class="hint" id="admMsg" style="margin:8px 0 0;min-height:1.4em"></p>',
      acts: [{ t: "Déverrouiller", go: submit }, { t: "Annuler", cls: "ghost", go: api.ui.closeModal }],
      after: function () { var i = el("admCode"); i.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); }); setTimeout(function () { try { i.focus({ preventScroll: true }); } catch (e) { i.focus(); } }, 30); } });
  }
  function submit() {
    var i = el("admCode"), m = el("admMsg"); if (!i) return;
    if (Date.now() < waitUntil) { m.textContent = "Trop d'essais. Réessaie dans " + Math.ceil((waitUntil - Date.now()) / 1000) + " s."; return; }
    var code = i.value; m.textContent = "Vérification…"; m.style.color = "";
    check(code).then(function (ok) {
      if (!ok) { fails++; if (fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; } m.textContent = "Code incorrect."; m.style.color = "var(--crit)"; i.select(); return; }
      lsSet(KEY, norm(code)); unlocked = true; fails = 0; showTab(); KG().ui.closeModal(); KG().drawer("admin"); toast("Menu administrateur déverrouillé.");
    }, function () { m.textContent = "Ce navigateur ne permet pas de vérifier le code (page non sécurisée)."; m.style.color = "var(--crit)"; });
  }
  function init() {
    if (!KG()) return;
    var b = el("btnAdmin"); if (b) b.addEventListener("click", open);
    var tab = document.querySelector('.dtabs [data-d="admin"]'); if (tab) tab.hidden = true;
    renderEntry();
    var saved = lsGet(KEY);
    if (saved) check(saved).then(function (ok) { unlocked = ok; if (!ok) lsDel(KEY); showTab(); }, function () {});
    setInterval(function () { var d = el("drawer"); if (unlocked && d && !d.hidden && d.getAttribute("data-tab") === "admin") render(); }, 500);
  }
  window.KeplerAdmin = { render: function () { render(); }, onClose: function () { batch = false; }, get unlocked() { return unlocked; }, parse: parseAmount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
