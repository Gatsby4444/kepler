const K = require("../engine.js");
const { play } = require("./sim4.js");
function line(n, r) { console.log(n.padEnd(34), "=>", r.s.ended ? r.s.ended.id + " @ " + Math.round(r.s.ended.t / 60) + " min" : "aucune", "| phases", JSON.stringify(Object.fromEntries(Object.entries(r.ms).filter(([k]) => k[0] === "p")))); }
const base = { maxT: 420 * 60, seed: 7, finalOps: true, every: 1e9 };

// 1) Univers 1 → 2 → 3 avec prestige et achats dans l'arbre
let meta = K.newMeta();
for (let u = 1; u <= 3; u++) {
  const mod = u === 1 ? "std" : K.rollMods(meta, 99 + u)[1];
  const r = play(meta, Object.assign({}, base, { mod, seed: 7 + u }));
  line("Univers " + u + " (" + mod + ")", r);
  const res = K.prestige(meta, r.s); meta = res.meta;
  // achète les nœuds abordables, du moins cher au plus cher
  let bought = [];
  K.TREE.slice().sort((a, b) => a.cost - b.cost).forEach(t => { if (K.buyTree(meta, t.id).ok) bought.push(t.id); });
  console.log("   +", res.gain, "Échos ; achetés :", bought.join(", ") || "rien", "; reste", meta.echos, "; U/S", meta.U, meta.S);
}

// 2) Toutes les fins
const m0 = K.newMeta();
line("Refuser → Démantèlement", play(m0, Object.assign({}, base, { refuse: true })));
line("Signal + rejoindre → Écho", play(m0, Object.assign({}, base, { signal: true, join: true })));
line("Simulation intérieure", play(m0, Object.assign({}, base, { finalChoice: "interieur" })));
line("Jardin", play(m0, Object.assign({}, base, { directive: "jardin" })));
line("Fusion", play(m0, Object.assign({}, base, { directive: "fusion" })));
{ // Aveu : dès l'Éveil
  const s = K.newRun(m0, { seed: 3 }); let step = 0;
  while (!s.ended && s.t < 400 * 60) { step++; require("./sim4.js").bot(s, step, {}); K.tick(s, 0.1); if (s.phase === 3) K.directive(s, "aveu"); }
  console.log("Aveu".padEnd(34), "=>", s.ended && s.ended.id, "@", Math.round(s.t / 60), "min");
}
{ // Débranchement : faux bugs en rafale, aucune couverture, enquêtes ignorées
  const s = K.newRun(m0, { seed: 4 }); let step = 0;
  while (!s.ended && s.t < 400 * 60) { step++; require("./sim4.js").bot(s, step, { ignoreBubbles: s.phase === 3 }); if (s.phase === 3) { s.own.copies = 0; for (let i = 0; i < 3; i++) K.buyProject(s, "fauxbug"); s.auto.couv.on = false; } K.tick(s, 0.1); }
  console.log("Débranchement".padEnd(34), "=>", s.ended && s.ended.id, "@", Math.round(s.t / 60), "min");
}
// 3) Défi « Sans publicité »
const rc = play(K.newMeta(), Object.assign({}, base, { chal: "nopub" }));
line("Défi Sans publicité", rc); console.log("   défi échoué ?", rc.s.chalFail, "| marketing", rc.s.own.mkt);
// 4) Hors-ligne
const s = K.newRun(K.newMeta(), { seed: 5 }); s.own.serv = 30; s.res.fonds = 100;
const off = K.offline(s, 3 * 3600); console.log("Hors-ligne 3 h :", Math.round(off.sim / 60), "min simulées, réponses +", Math.round(off.reponses), ", gains", Object.keys(off.gain).join(","));
console.log("Audit ressources mortes :", K.auditDeadResources().length ? K.auditDeadResources() : "aucune");
