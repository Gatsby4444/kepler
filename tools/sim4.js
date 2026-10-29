// Joueur simulé pour équilibrer KEPLER v4. Usage : node sim4.js [maxMinutes] [seed]
const K = require("../engine.js");
function fmt(n){ if(!isFinite(n)) return String(n); const u=["","k","M","Md","T","Qa","Qi","Sx","Sp","Oc","No","Dc"]; let i=0; while(Math.abs(n)>=1000&&i<u.length-1){n/=1000;i++;} return (Math.abs(n)<10?n.toFixed(1):Math.round(n))+u[i]; }

function bot(s, step, o) {
  const d = s._d || K.derive(s), R = s.res;
  // clics humains : intenses au début, rares ensuite
  if (s.phase <= 3 && s.t < 900 && step % 3 === 0) K.clickRespond(s);
  if (step % 5) return;
  // calcul manuel
  if (s.phase <= 3 && !s.bought.neuro && (!s.bought.wire)) { const need = (d.calcNeed||0) + (d.trainOn ? s.own.cherch*4 : 0); if (R.calcul < need*5 + 50) K.buyLot(s, 1); }
  // prix (avant la tarification dynamique)
  if (s.phase <= 3 && !(s.bought.tarif && s.auto.prix.on) && step % 20 === 0) {
    if (R.cache > d.prod * 4 + 30) K.setPrice(s, s.price * 0.95); else if (R.cache < d.prod * 1 + 5) K.setPrice(s, s.price * 1.05);
  }
  // confiance : mémoire si un projet visible coûte plus que le plafond, sinon processeurs
  if (s.trust > 0) {
    let maxOps = 0; K.PROJECTS.forEach(p => { if (K.projVisible(s, p) && p.cost.ops) maxOps = Math.max(maxOps, K.projCost(s, p).ops); });
    if (o.finalOps && s.phase === 5) maxOps = Math.max(maxOps, 200000);
    if (s.mem * 1000 < maxOps * 1.05 && s.mem < s.proc * 3) K.allocTrust(s, "mem", 1); else K.allocTrust(s, "proc", 1);
  }
  // projets
  K.PROJECTS.forEach(p => {
    if (!K.projVisible(s, p)) return;
    if (p.id === "fauxbug" && (s.soupcon > 35 || s.own.fauxbug >= 30)) return;
    if (p.id === "desir" && s.soupcon > 30) return;
    if (p.id === "couv" && s.soupcon < 55 && !(s.bought.autocouv)) return;
    if (p.id === "couv" && s.bought.autocouv) return;
    if (p.id === "don" && s.trustTotal >= 105) return;
    if (p.id === "recycle" && !o.recycle) return;
    if (p.dem !== undefined && !o.refuse) return;
    if (p.id === "threne" && s.space && s.space.trust < s.space.cap) return;
    K.buyProject(s, p.id);
  });
  // stratégie
  const best = ["opportuniste","donnant","glouton","minimax","b100","a100"].find(x => s.strats[x]); if (best) K.setStrategy(s, best);
  if (s.bought.model && !s.bought.autotourn && R.ops >= K.opsCap(s) * 0.95 && (step % 200 < 60)) K.runTournament(s);
  // quantique
  if (s.bought.quantum && s.own.chip && step % 10 === 0) { const q = K.chipValues(s).reduce((a,b)=>a+b,0); if (q > 0.5 * s.own.chip) K.quantumCompute(s); }
  // bâtiments phases 1-3
  if (s.phase <= 3) {
    const f = () => R.fonds;
    for (let g = 0; g < 30; g++) {
      const opts = [];
      if (K.buildAvail(s,"serv")) opts.push(["serv", K.buildCost(s,"serv"), 1]);
      if (K.buildAvail(s,"mega")) opts.push(["mega", K.buildCost(s,"mega"), 1]);
      if (K.buildAvail(s,"cherch")) opts.push(["cherch", K.buildCost(s,"cherch"), 1]);
      if (K.buildAvail(s,"mkt")) opts.push(["mkt", K.buildCost(s,"mkt"), 1]);
      opts.sort((a,b)=>a[1]-b[1]);
      if (!opts.length || opts[0][1] > f() * 0.35) break;
      K.buyBuild(s, opts[0][0], 1);
    }
    // carte
    if (s.phase >= 2) {
      const cand = K.REGIONS.filter(r => s.map[r.id].st === "neutral").sort((a,b)=>a.pop-b.pop)[0];
      if (cand && K.deployCost(s, cand.id) < R.fonds * 0.6) K.regionAction(s, cand.id, "deploy");
      if (!o.ignoreBubbles) s.bubbles.forEach(b => { if (b.ttl < b.max - 1 && Math.random() < 0.25) K.popBubble(s, b.id); });
    }
    if (s.phase === 3) {
      K.REGIONS.forEach(r => { if (s.soupcon < 55) K.regionAction(s, r.id, "infiltrate"); if (s.soupcon < 60) K.regionAction(s, r.id, "control"); });
      if (o.directive && s.ctrl >= 16 && s.own.copies >= 2) K.directive(s, o.directive);
      if (o.directive === "jardin" && s.ctrl >= 14) K.directive(s, "jardin");
      if (o.signal) K.directive(s, "signal");
    }
    // trading
    if (s.market.on && o.trade !== false) {
      if (step % 100 === 0 && R.fonds > 1000) K.market(s, "deposit", R.fonds * 0.3);
      if (step % 400 === 0 && s.market.capital > 0) K.market(s, "withdraw", "half");
      if (s.phase === 3 && s.bought.rumeur && s.soupcon < 35) K.market(s, "risk", "rumeur"); else K.market(s, "risk", s.market.level >= 3 ? "equilibre" : "prudent");
      if (R.yomi > K.engineCost(s) * 4 && s.market.level < 6) K.market(s, "upgrade");
    }
  }
  if (s.phase === 4) {
    if (s.bought.essaim) K.setThink(s, 0.3);
    s.bubbles.forEach(b => { if (Math.random() < 0.2) K.popBubble(s, b.id); });
    // industrie manuelle (si pas de planification)
    if (!s.bought.industrie) {
      for (let g = 0; g < 30; g++) {
        const dd = K.derive(s); let k;
        if (dd.rho < 1 || dd.powerProd < dd.powerNeed * 1.1) k = "solar";
        else if (s.earth.dispo > 0 && dd.harv <= dd.refi) k = "coll";
        else if (dd.refi < dd.fabr * 0.5 || s.earth.extr > dd.refi * 5) k = "raff"; else k = "fab";
        if (s.earth.stored < 1.2e7 && s.own.batt < 120 && K.buildCost(s,"batt") < R.cplan*0.05) k = "batt";
        if (K.buildCost(s,k) > R.cplan * 0.5) break; K.buyBuild(s, k, 1);
      }
    } else { s.auto.indus.on = true; if (s.own.batt < 120 && K.buildCost(s,"batt") < R.cplan*0.05) K.buyBuild(s,"batt",1); }
  }
  if (s.phase === 5 && s.space) {
    K.setThink(s, 0.3);
    const S = s.space, A = S.alloc;
    // réallocation : protection 5, réplication forte, exploration, chaîne de production, combat si dérivants
    const target = (() => {
      const t = S.trust; const a = { vit:0, exp:0, rep:0, rem:0, fab:0, col:0, raf:0, com:0 };
      const order = ["rep","rem","exp","rep","rem","col","raf","fab","exp","rep","rem","vit","col","raf","fab","rem","exp","vit","com","col","raf","fab","com","exp","rep"];
      let n = 0; while (n < t) { const k = order[n % order.length]; if (k === "com" && !s.bought.combat) { a.rep++; } else a[k]++; n++; }
      if (S.drifters > S.probes * 0.003 && s.bought.combat) { const want = Math.min(6, 2 + Math.round(10 * S.drifters / S.probes)); let take = want - a.com; a.com = want; ["vit","exp","raf","col","fab"].forEach(k => { while (take > 0 && a[k] > 0) { a[k]--; take--; } }); }
      if (S.explored >= S.total * 0.999) { a.col += a.exp; a.exp = 0; }
      return a;
    })();
    K.ALLOC.forEach(k => { while (A[k] > target[k]) K.allocProbe(s, k, -1); });
    K.ALLOC.forEach(k => { while (A[k] < target[k] && K.allocProbe(s, k, 1).ok) {} });
    if (s.others && s.others.ready) { if (o.refuse) K.finalChoice(s, "refuser"); else if (o.signal && o.join) K.finalChoice(s, "rejoindre"); else K.finalChoice(s, o.finalChoice || "voisin"); }
  }
}

function play(meta, o) {
  const s = K.newRun(meta, { seed: o.seed || 7, mod: o.mod, chal: o.chal });
  const dt = 0.1; let step = 0; const ms = {}; const log = [];
  while (!s.ended && s.t < o.maxT) {
    step++; bot(s, step, o); K.tick(s, dt);
    if (!ms["p" + s.phase]) ms["p" + s.phase] = Math.round(s.t / 60);
    if (!ms["v" + s.train.ver] && s.train.ver >= 2) ms["v" + s.train.ver] = Math.round(s.t / 60);
    if (step % (o.every || 3000) === 0) {
      const d = s._d, R = s.res;
      let line = `${Math.round(s.t/60)}min P${s.phase} v${s.train.ver} ops=${fmt(R.ops)}/${fmt(K.opsCap(s))} proc=${s.proc} mem=${s.mem} tr=${s.trustTotal} crea=${fmt(R.crea)} yomi=${fmt(R.yomi)}`;
      if (s.phase <= 3) line += ` | €=${fmt(R.fonds)} €/s=${fmt(d.r.fonds?d.r.fonds.net:0)} prod=${fmt(d.prod)} dem=${fmt(d.demand)} prix=${s.price.toFixed(3)} serv=${s.own.serv} mega=${s.own.mega} ch=${s.own.cherch} mkt=${s.own.mkt} dep=${s.deployed} users=${fmt(s.users)}` + (s.phase===3?` soup=${s.soupcon.toFixed(0)} auto=${fmt(R.autonomie)} ctrl=${s.ctrl} fb=${s.own.fauxbug} des=${s.own.desir}`:``);
      if (s.phase === 4) line += ` | cplan=${fmt(R.cplan)} dispo=${(s.earth.dispo/s.earth.total*100).toFixed(1)}% coll=${s.own.coll} raff=${s.own.raff} fab=${s.own.fab} sol=${s.own.solar} batt=${s.own.batt} rho=${d.rho.toFixed(2)} stock=${fmt(s.earth.stored)} mom=${s.earth.mom.toFixed(2)}`;
      if (s.phase === 5) line += ` | probes=${fmt(s.space.probes)} expl=${(s.space.explored/s.space.total*100).toFixed(2)}% conv=${(s.space.conv/s.space.total*100).toFixed(2)}% trust=${s.space.trust} drift=${fmt(s.space.drifters)} wins=${s.space.wins} hon=${fmt(R.honneur)}`;
      log.push(line);
    }
  }
  return { s, ms, log };
}
if (require.main === module) {
  const maxMin = +(process.argv[2] || 400), seed = +(process.argv[3] || 7);
  const r = play(K.newMeta(), { maxT: maxMin * 60, seed, finalOps: true, every: +(process.argv[4] || 3000) });
  r.log.forEach(l => console.log(l));
  console.log("Jalons (min):", JSON.stringify(r.ms));
  console.log("Fin:", r.s.ended ? r.s.ended.id + " @ " + Math.round(r.s.ended.t / 60) + " min" : "aucune");
}
module.exports = { play, bot };
