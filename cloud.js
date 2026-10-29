/* =====================================================================
   KEPLER — sauvegarde en ligne (Supabase), sans bibliothèque externe.
   - Un compte anonyme est créé automatiquement pour cet appareil.
   - La partie est envoyée régulièrement ; une partie plus avancée en
     ligne n'est jamais écrasée sans l'accord du joueur.
   - Un code de récupération relie un autre appareil à la même partie.
   La sauvegarde locale (localStorage) reste la source principale : si le
   serveur est injoignable, le jeu continue normalement.
   ===================================================================== */
(function () {
  "use strict";
  var CFG = window.KEPLER_CLOUD || {
    url: "https://bcqcnphdtgbsulgjuuad.supabase.co",
    // Clés publiques (faites pour être dans le navigateur). La seconde sert de repli.
    keys: [
      "sb_publishable_Rc-7e0v4A94ezhBqR7gSSQ_kAnpheh0",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjcWNucGhkdGdic3VsZ2p1dWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNzQ5NjEsImV4cCI6MjEwODg1MDk2MX0.CM2kCCIx5X1hPX5yarIJ24JtnlJPNviG8x7rZoA-S9Y"
    ]
  };
  if (CFG === false || !CFG.url) return;
  var SKEY = "kepler.cloud.session", CKEY = "kepler.cloud.code";
  var PUSH_EVERY = 30000;
  var st = { status: "init", msg: "", lastOk: 0, lastPush: 0, dirty: false, busy: false, keyIdx: 0, retryT: null, backoff: 15000, hasCloud: false, started: false };
  var session = null;

  function G() { return window.__kepler; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------- requêtes ---------------- */
  function call(path, body, withAuth, keepalive) {
    var headers = { apikey: CFG.keys[st.keyIdx], "Content-Type": "application/json" };
    if (withAuth && session) headers.Authorization = "Bearer " + session.at;
    return fetch(CFG.url + path, { method: "POST", headers: headers, body: JSON.stringify(body || {}), keepalive: !!keepalive, cache: "no-store" })
      .then(function (r) {
        return r.text().then(function (txt) {
          var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
          if (!r.ok) {
            var m = data && typeof data === "object" ? (data.msg || data.message || data.error_description || data.error) : null;
            var err = new Error(m || ("HTTP " + r.status)); err.status = r.status; err.code = data && typeof data === "object" ? (data.error_code || data.code) : null;
            throw err;
          }
          return data;
        });
      });
  }
  function callKey(path, body, withAuth, keepalive) {
    return call(path, body, withAuth, keepalive).catch(function (e) {
      if (e.status === 401 && /api key/i.test(e.message) && st.keyIdx < CFG.keys.length - 1) { st.keyIdx++; return call(path, body, withAuth, keepalive); }
      throw e;
    });
  }
  function keepSession(d) {
    session = { at: d.access_token, rt: d.refresh_token, exp: Date.now() + (d.expires_in || 3600) * 1000, uid: d.user && d.user.id };
    lsSet(SKEY, JSON.stringify(session));
  }
  function ensureAuth() {
    if (session && session.at && session.exp - 60000 > Date.now()) return Promise.resolve();
    var refresh = session && session.rt
      ? callKey("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.rt }).then(keepSession, function (e) {
          if (e.status >= 400 && e.status < 500) { session = null; lsDel(SKEY); return null; }
          throw e;
        })
      : Promise.resolve(null);
    return refresh.then(function () {
      if (session && session.at && session.exp - 60000 > Date.now()) return;
      return callKey("/auth/v1/signup", { data: {} }).then(keepSession);
    });
  }
  function rpc(name, args, keepalive) {
    return ensureAuth().then(function () {
      return callKey("/rest/v1/rpc/" + name, args, true, keepalive).catch(function (e) {
        if (e.status === 401 && session) { session.exp = 0; return ensureAuth().then(function () { return callKey("/rest/v1/rpc/" + name, args, true, keepalive); }); }
        throw e;
      });
    });
  }

  /* ---------------- état et affichage ---------------- */
  function setStatus(s, msg) { st.status = s; st.msg = msg || ""; render(); }
  function ago(t) {
    if (!t) return "";
    var ms = typeof t === "number" ? t : Date.parse(t); var sec = Math.max(0, (Date.now() - ms) / 1000);
    if (sec < 10) return "à l'instant"; if (sec < 60) return "il y a " + Math.round(sec) + " s";
    if (sec < 3600) return "il y a " + Math.round(sec / 60) + " min"; if (sec < 86400) return "il y a " + Math.round(sec / 3600) + " h";
    return "il y a " + Math.round(sec / 86400) + " j";
  }
  function describe(sum, play) {
    sum = sum || {}; var d = G() && G().ui ? G().ui.dur : function (x) { return Math.round(x / 60) + " min"; };
    return "univers " + (sum.univers || 1) + " · phase " + (sum.phase || 1) + " · " + d(play || 0) + " de jeu";
  }
  function fail(e) {
    var net = !e || e.name === "TypeError" || /fetch|network|load failed/i.test(e.message || "");
    if (e && (e.code === "anonymous_provider_disabled" || /anonymous sign-ins are disabled/i.test(e.message || ""))) {
      setStatus("disabled"); schedule(300000); return;
    }
    if (net) setStatus("offline"); else setStatus("error", e.message);
    schedule(st.backoff); st.backoff = Math.min(st.backoff * 2, 600000);
  }
  function schedule(ms) { clearTimeout(st.retryT); st.retryT = setTimeout(start, ms); }

  /* ---------------- synchronisation ---------------- */
  function args(force) {
    var sn = G().snapshot();
    return { p_run: sn.run, p_meta: sn.meta, p_ui: sn.ui, p_version: sn.version, p_play: sn.play, p_summary: sn.summary, p_client_saved_at: new Date().toISOString(), p_force: !!force };
  }
  function applyCloud(cloud, msg) {
    if (!cloud || !G() || !G().loadSave) return false;
    var ok = G().loadSave(cloud.run, cloud.meta, cloud.ui || null);
    if (ok) { st.lastOk = Date.now(); st.dirty = false; if (msg) G().ui.toast(msg); }
    else G().ui.toast("Cette sauvegarde en ligne vient d'une autre version du jeu.");
    render(); return ok;
  }
  function askConflict(cloud) {
    var sn = G().snapshot();
    G().ui.openModal({
      eyebrow: "Sauvegarde en ligne", titre: "Une partie plus avancée existe en ligne",
      body: "<p>En ligne : <b>" + esc(describe(cloud.summary, cloud.play_seconds)) + "</b>" + (cloud.updated_at ? ", sauvegardée " + ago(cloud.updated_at) : "") + ".</p>" +
        "<p>Sur cet appareil : <b>" + esc(describe(sn.summary, sn.play)) + "</b>.</p>" +
        "<p class='muted'>Si tu gardes celle de cet appareil, elle remplacera la partie en ligne.</p>",
      acts: [
        { t: "Charger la partie en ligne", go: function () { G().ui.closeModal(); applyCloud(cloud, "Partie en ligne chargée."); } },
        { t: "Garder celle de cet appareil", cls: "ghost", go: function () { G().ui.closeModal(); push(true); } }
      ]
    });
  }
  function push(force, keepalive) {
    if (!G() || !G().snapshot) return Promise.resolve();
    if (st.busy && !keepalive) return Promise.resolve();
    var a = args(force);
    if (keepalive && JSON.stringify(a).length > 60000) keepalive = false; // limite des envois en arrière-plan
    st.busy = true; st.lastPush = Date.now(); st.dirty = false;
    return rpc("kepler_push", a, keepalive).then(function (r) {
      st.busy = false;
      if (r && r.conflict) {
        return rpc("kepler_pull", {}).then(function (cloud) { if (cloud) askConflict(cloud); });
      }
      st.hasCloud = true; st.lastOk = Date.now(); st.backoff = 15000; setStatus("ok");
    }, function (e) { st.busy = false; st.dirty = true; fail(e); });
  }
  function start() {
    if (!G() || !G().snapshot) { schedule(1000); return; }
    st.started = true;
    try { session = session || JSON.parse(lsGet(SKEY) || "null"); } catch (e) { session = null; }
    if (st.status !== "ok") setStatus("connexion");
    rpc("kepler_pull", {}).then(function (cloud) {
      var sn = G().snapshot();
      st.hasCloud = !!cloud;
      if (cloud && cloud.game_version === sn.version && cloud.play_seconds > sn.play + 120) {
        var fresh = sn.meta.runs === 0 && sn.meta.univers === 1 && sn.run.t < 120;
        if (fresh) { applyCloud(cloud, "Partie retrouvée en ligne."); st.backoff = 15000; setStatus("ok"); return; }
        askConflict(cloud); setStatus("ok"); return;
      }
      return push(cloud && cloud.game_version !== sn.version);
    }).catch(fail);
  }

  /* ---------------- code de récupération ---------------- */
  function createCode() {
    var first = st.hasCloud ? Promise.resolve() : push(false);
    setStatus("connexion");
    return first.then(function () { return rpc("kepler_create_code", {}); }).then(function (code) {
      lsSet(CKEY, code); st.backoff = 15000; setStatus("ok");
      G().ui.toast("Code de récupération créé. Note-le.");
    }).catch(fail);
  }
  function claim(code) {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 16) { G().ui.toast("Le code compte 16 caractères (4 groupes de 4)."); return; }
    G().ui.confirm("Récupérer cette partie ?", "La partie liée à ce code va remplacer celle de cet appareil. Les deux appareils partageront ensuite la même sauvegarde.", "Récupérer", function () {
      setStatus("connexion");
      rpc("kepler_claim_code", { p_code: code }).then(function (r) {
        if (!r || !r.ok) { setStatus("ok"); G().ui.toast(r && r.reason === "déjà relié" ? "Cet appareil est déjà relié à cette partie." : "Code inconnu : vérifie-le."); return; }
        lsSet(CKEY, code.replace(/(.{4})(?=.)/g, "$1-"));
        st.hasCloud = true; setStatus("ok");
        if (r.save) applyCloud(r.save, "Partie récupérée.");
      }).catch(fail);
    });
  }

  /* ---------------- panneau Options ---------------- */
  var STATUS = {
    init: "Préparation…", connexion: "Connexion au serveur…",
    ok: function () { return st.lastOk ? "<b>Sauvegardée en ligne</b> " + ago(st.lastOk) + "." : "<b>Connectée.</b>"; },
    offline: "<b>Hors ligne.</b> Ta partie reste enregistrée sur cet appareil ; nouvel essai automatique.",
    disabled: "<b>La sauvegarde en ligne n'est pas encore activée sur le serveur.</b> Ta partie reste enregistrée sur cet appareil.",
    error: function () { return "<b>Erreur du serveur :</b> " + esc(st.msg) + ". Nouvel essai automatique."; }
  };
  function render() {
    var box = document.getElementById("cloudBox"); if (!box) return;
    var drawer = document.getElementById("drawer"); if (drawer && drawer.hidden && box.dataset.ready) return;
    var stt = STATUS[st.status]; stt = typeof stt === "function" ? stt() : stt;
    var code = lsGet(CKEY), live = st.status === "ok";
    var h = '<p class="st">' + stt + "</p>" +
      '<div class="acts" style="margin-top:0"><button class="btn sm" data-c="push"' + (st.status === "disabled" || st.status === "connexion" ? " disabled" : "") + ">Sauvegarder maintenant</button></div>" +
      '<div class="sec">Changer d\'appareil</div>' +
      '<p class="hint" style="margin-top:0">Crée un code de récupération et note-le. Saisi sur un autre appareil, il y charge ta partie et relie les deux appareils. Il te permet aussi de tout retrouver si tu effaces ton navigateur.</p>' +
      (code ? '<div class="codebox" id="cCode">' + esc(code) + '</div><div class="acts"><button class="btn sm" data-c="copy">Copier le code</button><button class="btn sm" data-c="code"' + (live ? "" : " disabled") + ">Nouveau code</button></div>"
            : '<div class="acts" style="margin-top:0"><button class="btn sm pri" data-c="code"' + (live ? "" : " disabled") + ">Créer mon code</button></div>") +
      '<div class="sec">J\'ai déjà un code</div>' +
      '<label class="hint" for="cIn" style="display:block;margin:0 0 6px">Code à 16 caractères</label>' +
      '<input type="text" id="cIn" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="24">' +
      '<div class="acts"><button class="btn sm" data-c="claim"' + (st.status === "disabled" ? " disabled" : "") + ">Récupérer ma partie</button></div>" +
      '<p class="hint">Aucune adresse e-mail n\'est demandée : un compte anonyme est créé pour cet appareil.</p>';
    var keep = document.getElementById("cIn"), val = keep ? keep.value : "";
    box.innerHTML = h; box.dataset.ready = "1";
    var inp = document.getElementById("cIn"); if (inp && val) inp.value = val;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#cloudBox [data-c]"); if (!b || b.disabled) return;
    var c = b.dataset.c;
    if (c === "push") { setStatus("connexion"); push(false).then(function () { if (st.status === "ok") G().ui.toast("Sauvegardée en ligne."); }); }
    if (c === "code") { if (lsGet(CKEY)) G().ui.confirm("Créer un nouveau code ?", "L'ancien code ne fonctionnera plus.", "Nouveau code", createCode); else createCode(); }
    if (c === "copy") { var t = lsGet(CKEY) || ""; try { navigator.clipboard.writeText(t).then(function () { G().ui.toast("Code copié."); }, function () { G().ui.toast("Sélectionne le code pour le copier."); }); } catch (x) { G().ui.toast("Sélectionne le code pour le copier."); } }
    if (c === "claim") { var v = document.getElementById("cIn"); claim(v ? v.value : ""); }
  });

  /* ---------------- rythme ---------------- */
  setInterval(function () {
    if (st.status === "ok" && st.dirty && Date.now() - st.lastPush > PUSH_EVERY) push(false);
    var d = document.getElementById("drawer"); if (d && !d.hidden && st.status === "ok") render();
  }, 5000);
  document.addEventListener("visibilitychange", function () { if (document.hidden && st.status === "ok" && st.dirty) push(false, true); });

  window.KeplerCloud = {
    dirty: function () { st.dirty = true; },
    render: render, push: push, start: start,
    get status() { return st.status; }, get lastOk() { return st.lastOk; }
  };
  setTimeout(start, 1200);
})();
