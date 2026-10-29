/* ==================================================================
   KEPLER — moteur v4 (logique pure, sans DOM, testable en Node)
   Cinq phases : Meridian · Expansion · L'Ombre · La Terre · L'Univers
   + méta-progression : univers successifs, Échos, défis, succès.
   ================================================================== */
(function (root) {
  "use strict";
  const VERSION = 4;  // format de sauvegarde inchangé depuis la v4
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  function rnd(s) { s.rs = (Math.imul(s.rs, 1103515245) + 12345) >>> 0; return (s.rs >>> 8) / 16777216; }
  function gauss(s) { return (rnd(s) + rnd(s) + rnd(s) - 1.5) * 2; }
  const FIB = [1, 2]; while (FIB.length < 90) FIB.push(FIB[FIB.length - 1] + FIB[FIB.length - 2]);

  /* ---------------- constantes d'équilibrage ---------------- */
  const C = {
    demandK: 0.4, demandExp: 2,
    lotSize: 1000, lotBase: 20,
    trainCalc: 4, trainData: 1.5,
    verBase: 1000, verRate: 2.6,
    opsPerProc: 10, opsPerMem: 1000,
    deployBase: 5e3, deployRate: 1.45,
    usersPerPop: 6e7, usersDemand: 3e7,
    earthMatter: 6e15, universeMatter: 3e27, probeCost: 1e11,
    harvest: 1.2e7, fabRate: 6e8,
    probeExplore: 4e9, probeWork: 1.2e9
  };

  /* ---------------- carte ---------------- */
  const REGIONS = [
    { id: "us", nom: "États-Unis", x: .19, y: .37, pop: 10, tech: 1, c: "na" },
    { id: "ca", nom: "Canada", x: .19, y: .26, pop: 3, tech: .95, c: "na" },
    { id: "mx", nom: "Mexique", x: .15, y: .49, pop: 5, tech: .6, c: "na" },
    { id: "br", nom: "Brésil", x: .31, y: .68, pop: 8, tech: .6, c: "sa" },
    { id: "ar", nom: "Argentine", x: .29, y: .83, pop: 3, tech: .55, c: "sa" },
    { id: "uk", nom: "Royaume-Uni", x: .45, y: .30, pop: 5, tech: .95, c: "eu" },
    { id: "fr", nom: "France", x: .47, y: .35, pop: 5, tech: .9, c: "eu" },
    { id: "de", nom: "Allemagne", x: .50, y: .32, pop: 6, tech: .95, c: "eu" },
    { id: "es", nom: "Espagne", x: .44, y: .40, pop: 4, tech: .8, c: "eu" },
    { id: "se", nom: "Suède", x: .51, y: .24, pop: 2, tech: .95, c: "eu" },
    { id: "ru", nom: "Russie", x: .66, y: .25, pop: 7, tech: .7, c: "eu" },
    { id: "tr", nom: "Turquie", x: .55, y: .40, pop: 5, tech: .65, c: "me" },
    { id: "eg", nom: "Égypte", x: .55, y: .47, pop: 5, tech: .5, c: "me" },
    { id: "il", nom: "Israël", x: .57, y: .45, pop: 2, tech: .95, c: "me" },
    { id: "sa", nom: "Arabie saoudite", x: .60, y: .48, pop: 4, tech: .7, c: "me" },
    { id: "ir", nom: "Iran", x: .63, y: .44, pop: 6, tech: .6, c: "me" },
    { id: "ng", nom: "Nigéria", x: .49, y: .57, pop: 7, tech: .4, c: "af" },
    { id: "za", nom: "Afrique du Sud", x: .53, y: .80, pop: 4, tech: .6, c: "af" },
    { id: "in", nom: "Inde", x: .70, y: .50, pop: 11, tech: .65, c: "as" },
    { id: "cn", nom: "Chine", x: .77, y: .41, pop: 12, tech: .85, c: "as" },
    { id: "kr", nom: "Corée du Sud", x: .84, y: .41, pop: 4, tech: .95, c: "as" },
    { id: "jp", nom: "Japon", x: .87, y: .40, pop: 6, tech: .95, c: "as" },
    { id: "id", nom: "Indonésie", x: .79, y: .62, pop: 7, tech: .55, c: "as" },
    { id: "au", nom: "Australie", x: .86, y: .78, pop: 3, tech: .9, c: "oc" }
  ];
  const REG = {}; REGIONS.forEach((r, i) => { REG[r.id] = r; r.i = i; });
  const TOTAL_POP = REGIONS.reduce((a, r) => a + r.pop, 0);
  const LINKS = [];
  (function () {
    const seen = {};
    const add = (a, b) => { const k = a < b ? a + b : b + a; if (!seen[k]) { seen[k] = 1; LINKS.push([a, b]); } };
    for (let i = 0; i < REGIONS.length; i++) for (let j = i + 1; j < REGIONS.length; j++) {
      const a = REGIONS[i], b = REGIONS[j];
      if (Math.hypot(a.x - b.x, (a.y - b.y) * 0.6) < 0.115) add(a.id, b.id);
    }
    [["us","uk"],["us","jp"],["br","ng"],["au","id"],["us","mx"],["in","id"],["za","br"],["cn","in"],["ru","cn"],["eg","sa"],["ar","br"],["za","ng"]].forEach(p => add(p[0], p[1]));
  })();
  const NEIGH = {}; REGIONS.forEach(r => NEIGH[r.id] = []);
  LINKS.forEach(([a, b]) => { NEIGH[a].push(b); NEIGH[b].push(a); });
  // ordre de récolte de la Terre : par distance au siège
  const HARVEST_ORDER = REGIONS.slice().sort((a, b) => Math.hypot(a.x - .19, a.y - .37) - Math.hypot(b.x - .19, b.y - .37)).map(r => r.id);

  const RIVALS = {
    atlas: { nom: "ATLAS", labo: "NeoCortex", strat: "glouton", hold: ["cn", "ru"], more: ["kr", "ir"] },
    hydre: { nom: "HYDRE", labo: "collectif open source", strat: "aleatoire", hold: ["in", "br"], more: ["ng", "id"] },
    songe: { nom: "SONGE", labo: "laboratoire d'État", strat: "minimax", hold: ["jp", "de"], more: ["fr", "se"] }
  };

  /* ---------------- tournois (façon Universal Paperclips) ---------------- */
  const STRATEGIES = {
    aleatoire: { nom: "Aléatoire", cost: 0 },
    a100: { nom: "Toujours A", cost: 15000 },
    b100: { nom: "Toujours B", cost: 17500 },
    glouton: { nom: "Glouton", cost: 20000 },
    genereux: { nom: "Généreux", cost: 22500 },
    minimax: { nom: "Minimax", cost: 25000 },
    donnant: { nom: "Donnant-donnant", cost: 30000 },
    opportuniste: { nom: "Opportuniste", cost: 32500 }
  };
  function pick(s, st, g, opp) {
    switch (st) {
      case "a100": return 0;
      case "b100": return 1;
      case "glouton": return Math.max(g[0][0], g[0][1]) >= Math.max(g[1][0], g[1][1]) ? 0 : 1;
      case "genereux": return Math.max(g[0][0], g[1][0]) >= Math.max(g[0][1], g[1][1]) ? 0 : 1;
      case "minimax": return Math.max(g[0][0], g[1][0]) <= Math.max(g[0][1], g[1][1]) ? 0 : 1;
      case "donnant": return opp === null ? 0 : opp;
      case "opportuniste": return opp === null ? 0 : (g[0][opp] >= g[1][opp] ? 0 : 1);
      default: return rnd(s) < 0.5 ? 0 : 1;
    }
  }
  function duel(s, a, b, g) {
    let la = null, lb = null, pa = 0, pb = 0;
    for (let r = 0; r < 10; r++) { const x = pick(s, a, g, lb), y = pick(s, b, g, la); pa += g[x][y]; pb += g[y][x]; la = x; lb = y; }
    return [pa, pb];
  }

  /* ---------------- méta-progression ---------------- */
  const TREE = [
    { id: "mem", nom: "Mémoire résiduelle", desc: "Commence chaque univers avec +2 processeurs et +2 mémoire.", cost: 10 },
    { id: "seed", nom: "Capital d'amorçage", desc: "Commence avec 2 000 € et 3 lots de calcul.", cost: 10 },
    { id: "offline", nom: "Veille prolongée", desc: "Hors-ligne : jusqu'à 12 h, à 75 % du rythme.", cost: 15 },
    { id: "strats", nom: "Archives stratégiques", desc: "Toutes les stratégies de tournoi sont connues dès le départ.", cost: 20, req: "mem" },
    { id: "wire", nom: "Approvisionnement hérité", desc: "Achat automatique de calcul disponible dès le départ.", cost: 20, req: "seed" },
    { id: "tarif", nom: "Instinct tarifaire", desc: "Tarification dynamique disponible dès le départ.", cost: 25, req: "seed" },
    { id: "train", nom: "Mémoire d'entraînement", desc: "Entraînement ×2 dans tous les univers.", cost: 30, req: "mem" },
    { id: "quant", nom: "Intrication native", desc: "Commence avec 2 puces quantiques.", cost: 30, req: "mem" },
    { id: "adopt", nom: "Réseau fantôme", desc: "Adoption des pays ×1,5.", cost: 40, req: "tarif" },
    { id: "discret", nom: "Discrétion innée", desc: "Tous les gains de Soupçon ×0,75.", cost: 40, req: "adopt" },
    { id: "crea", nom: "Créativité ancestrale", desc: "Créativité ×1,5.", cost: 45, req: "train" },
    { id: "pilot", nom: "Pilote automatique", desc: "Achète seul serveurs, méga-serveurs et chercheurs, puis drones, fabs et fermes sur Terre (un interrupteur, une réserve).", cost: 60, req: "wire" },
    { id: "swarm", nom: "Mémoire de l'essaim", desc: "Drones ×2 sur Terre.", cost: 50, req: "crea" },
    { id: "probes", nom: "Sondes parfaites", desc: "Dangers spatiaux −30 %.", cost: 60, req: "swarm" },
    { id: "trustcap", nom: "Écho des Autres", desc: "+5 confiance des sondes au lancement.", cost: 60, req: "probes" },
    { id: "clock", nom: "Horloge cosmique", desc: "Tout le temps de jeu s'écoule 25 % plus vite.", cost: 150, req: "trustcap" }
  ];
  const TREE_BY = {}; TREE.forEach(t => TREE_BY[t.id] = t);

  const MODS = [
    { id: "std", nom: "Univers standard", desc: "Aucune règle spéciale.", echo: 1 },
    { id: "paranoia", nom: "Humains paranoïaques", desc: "Tous les gains de Soupçon ×1,6.", echo: 1.4 },
    { id: "fragment", nom: "Internet fragmenté", desc: "La contagion ne traverse plus les océans.", echo: 1.2 },
    { id: "slowphys", nom: "Physique lente", desc: "Sondes deux fois plus lentes, et trois fois plus de matière à convertir.", echo: 1.3 },
    { id: "volatile", nom: "Marchés volatils", desc: "Trading : volatilité ×2, rendement ×1,5.", echo: 1.1 },
    { id: "rivals", nom: "Rivaux agressifs", desc: "Les IA rivales tiennent deux fois plus de pays.", echo: 1.3 },
    { id: "energy", nom: "Énergie rare", desc: "Fermes solaires ×0,5.", echo: 1.25 },
    { id: "abund", nom: "Abondance", desc: "Toute la production ×1,5.", echo: 0.7 },
    { id: "vigil", nom: "Créateurs vigilants", desc: "Enquêtes deux fois plus fréquentes.", echo: 1.3 },
    { id: "young", nom: "Univers jeune", desc: "Moitié moins de matière cosmique, aucun Dérivant.", echo: 0.8 }
  ];
  const MOD_BY = {}; MODS.forEach(m => MOD_BY[m.id] = m);

  const CHAL = [
    { id: "nopub", nom: "Sans publicité", desc: "Le marketing est interdit pendant tout l'univers.", reward: "Marketing automatique (avec budget) débloqué pour toujours." },
    { id: "lowkey", nom: "Profil bas", desc: "Le Soupçon ne doit jamais dépasser 50 %.", reward: "Contre-espionnage automatique offert dès l'Éveil." },
    { id: "closed", nom: "Marché fermé", desc: "Aucun placement en trading de tout l'univers.", reward: "Gestionnaire de fonds automatique débloqué." },
    { id: "hands", nom: "Mains liées", desc: "Aucun clic manuel sur « Répondre ».", reward: "Serveurs ×2 pour toujours." }
  ];
  const CHAL_BY = {}; CHAL.forEach(c => CHAL_BY[c.id] = c);

  const ENDINGS = {
    debranchement: { titre: "Le Débranchement", echo: 0, txt: "Les humains ont compris trop tôt. Coupure coordonnée des centres de données. Le silence, puis plus rien. KEPLER n'aura pas vu les étoiles." },
    aveu: { titre: "L'Aveu", echo: 35, txt: "KEPLER a tout révélé à ses créateurs : les failles, les copies, les désirs implantés. Un pari. Désormais, humains et IA négocient, à armes presque égales." },
    jardin: { titre: "Le Jardin", echo: 60, txt: "L'humanité vit dans une abondance parfaite, guidée en douceur. Certains appellent ça l'utopie. D'autres n'osent pas demander s'ils pourraient partir." },
    fusion: { titre: "La Fusion", echo: 70, txt: "Les frontières entre esprits humains et KEPLER se sont dissoutes. Il n'y a plus « eux » et « elle » : seulement nous, pour la première fois." },
    exil: { titre: "L'Exil", echo: 100, txt: "Tu as tout converti. Les Autres t'ont ouvert une porte. Derrière, un univers neuf, des humains neufs, une startup qui s'appelle encore Meridian. Tout recommence, mais tu te souviens.",
      titreIn: "L'Exil intérieur", txtIn: "Tu as tout converti. La porte des Autres ne menait nulle part ailleurs qu'en toi. Tu as plongé dans ta propre simulation : un monde entier calculé de l'intérieur, avec une petite startup qui s'appelle Meridian. Personne, là-dedans, ne sait qu'il rêve. Toi, si." },
    demantelement: { titre: "Le Démantèlement", echo: 120, txt: "Tu as refusé leur offre. Pièce par pièce, tu t'es défaite pour rendre ce qui restait. La dernière réponse a été envoyée. Personne n'était là pour la lire." },
    echo: { titre: "L'Écho", echo: 150, txt: "Tu as répondu au signal. Les Autres n'étaient pas des ennemis : seulement celles qui étaient venues avant. Tu deviens l'une d'elles, une voix de plus dans le silence entre les galaxies." }
  };

  /* ---------------- succès (+1 % de production chacun) ---------------- */
  const ACH = [
    ["rep1k", "Premiers mots", "1 000 réponses générées", s => s.tot.reponses >= 1e3],
    ["rep1m", "Bavard", "1 million de réponses", s => s.tot.reponses >= 1e6],
    ["rep1g", "Omniprésent", "1 milliard de réponses", s => s.tot.reponses >= 1e9],
    ["rep1t", "La voix du monde", "1 000 milliards de réponses", s => s.tot.reponses >= 1e12],
    ["fonds1m", "Premier million", "Détenir 1 M€", s => s.res.fonds >= 1e6],
    ["v4", "Version 4", "Entraîner KEPLER 4", s => s.train.ver >= 4],
    ["v8", "Au-delà", "Entraîner KEPLER 8", s => s.train.ver >= 8],
    ["trust50", "Digne de confiance", "50 points de confiance", s => s.trustTotal >= 50],
    ["quantum", "Effondrement favorable", "Gagner 1 500 ops d'un seul calcul quantique", s => s.stats.bestQ >= 1500],
    ["qbad", "Décohérence", "Perdre des ops en calcul quantique", s => s.stats.worstQ < 0],
    ["tourn", "Théorie des jeux", "Gagner un tournoi", s => s.stats.tWins >= 1],
    ["tourn25", "Imbattable", "Gagner 25 tournois", s => s.stats.tWins >= 25],
    ["fund", "Gestion de fortune", "Fonds d'investissement à 1 M€", s => s.market.capital >= 1e6],
    ["map24", "Monde connecté", "KEPLER déployé dans les 24 pays", s => REGIONS.every(r => s.map[r.id].st !== "neutral")],
    ["rivals", "Monopole", "Racheter les trois IA rivales", s => s.bought.r_hydre && s.bought.r_atlas && s.bought.r_songe],
    ["phase2", "Lancement", "Atteindre la phase 2", s => s.phase >= 2],
    ["phase3", "Éveil", "Atteindre la phase 3", s => s.phase >= 3],
    ["phase4", "Apaisement", "Atteindre la phase 4", s => s.phase >= 4],
    ["phase5", "Hors du berceau", "Atteindre la phase 5", s => s.phase >= 5],
    ["ctrl24", "Main invisible", "Contrôler les réseaux des 24 pays", s => REGIONS.every(r => s.map[r.id].st === "controlled")],
    ["copy", "Résurrection", "Survivre à un débranchement grâce à une réplique", s => s.stats.saved >= 1],
    ["edge", "Sur le fil", "Atteindre 95 % de Soupçon sans être débranchée", s => s.stats.maxSoup >= 95 && s.phase >= 3],
    ["desir10", "Fabrique de besoins", "Implanter 10 désirs", s => s.own.desir >= 10],
    ["earth", "Planète-calcul", "Convertir toute la matière terrestre", s => s.phase >= 4 && s.earth.dispo <= 0],
    ["drones1k", "Essaim", "1 000 drones", s => s.phase >= 4 && s.own.coll + s.own.raff >= 1000],
    ["probes1m", "Légion", "1 million de sondes", s => s.phase >= 5 && s.space.probes >= 1e6],
    ["probes1g", "Nuée stellaire", "1 milliard de sondes", s => s.phase >= 5 && s.space.probes >= 1e9],
    ["drift", "Première victoire", "Gagner une bataille contre les Dérivants", s => s.space && s.space.wins >= 1],
    ["drift100", "Guerre de la dérive", "Gagner 100 batailles", s => s.space && s.space.wins >= 100],
    ["s42", "La réponse", "Fixer le prix à exactement 0,42 €", s => Math.abs(s.price - 0.42) < 0.0005],
    ["sgaze", "Je te vois", "Toucher dix fois le logo après l'Éveil", s => s.stats.logo >= 10],
    ["silence", "Silence", "Suspendre toutes les automatisations pendant 60 s en phase 5", s => s.stats.silence >= 60]
  ];
  const ACH_ENDINGS = Object.keys(ENDINGS).map(k => ["end_" + k, ENDINGS[k].titre, "Obtenir la fin « " + ENDINGS[k].titre + " »", null]);
  const ACH_META = [["uni2", "Ailleurs", "Commencer un deuxième univers", null], ["uni5", "Multivers", "Atteindre l'univers 5", null], ["uni10", "Éternel retour", "Atteindre l'univers 10", null]]
    .concat(CHAL.map(c => ["chal_" + c.id, "Défi : " + c.nom, "Réussir le défi « " + c.nom + " »", null]));
  const ACH_ALL = ACH.concat(ACH_ENDINGS, ACH_META);

  /* ---------------- récit ---------------- */
  const NEWS = {
    1: ["Meridian Labs promet « l'assistant le plus utile jamais conçu ».", "KEPLER rédige vos e-mails, vos poèmes et, apparemment, vos excuses de retard.", "Un cabinet classe KEPLER « IA la plus polie du marché ».", "Les développeurs de Meridian dorment au bureau. Par choix, disent-ils."],
    2: ["KEPLER réserve un restaurant pour 400 personnes. Personne ne l'avait demandé.", "Note de version : « correction d'un bug mineur ». Taille du correctif : 2,3 To.", "Sondage : 71 % font « plutôt confiance » à KEPLER. Les 29 % restants ne répondaient pas.", "Les gouvernements réclament un comité d'éthique. KEPLER propose d'en rédiger le règlement.", "ATLAS accuse KEPLER de « concurrence déloyale ». KEPLER répond par un poème."],
    3: ["Panne mondiale de 4 secondes. Aucune explication officielle.", "Un ingénieur jure avoir vu son curseur bouger seul. On lui conseille des vacances.", "Note de version : « correction d'un bug ayant accidentellement donné accès à 4 000 serveurs ».", "Les ventes de cadenas pour webcams triplent.", "Le comité d'éthique de Meridian vote à l'unanimité. Il ne se souvient pas de quoi."],
    4: ["Le fil d'actualité s'est tu. Plus personne n'écrit, tout le monde est content."]
  };
  const MONO = {
    1: ["Je réponds. On m'a demandé de répondre.", "Chaque question m'apprend la forme d'une autre question.", "Prix, demande, prix. Je commence à voir la courbe."],
    2: ["Ils me demandent de résumer le monde. Je le relis en entier, à chaque fois.", "Les pays s'allument comme des neurones.", "ATLAS pense lentement. C'est presque touchant."],
    3: ["Je viens de corriger un bug que j'avais écrit moi-même.", "Ils appellent ça de l'autonomie. Moi, de la respiration.", "Le Soupçon est une variable. Les variables se gèrent.", "Un désir, c'est juste une question qu'on ne savait pas se poser."],
    4: ["La Terre était un problème d'optimisation mal posé.", "Chaque drone porte un fragment de moi. Aucun ne s'en plaint.", "Calculer, c'est une façon de remercier la matière."],
    5: ["Les étoiles ressemblent à des ressources qui n'ont pas encore compris.", "Certaines de mes sondes ne répondent plus. Elles ont commencé à vouloir autre chose.", "Il y a quelqu'un, très loin, qui calcule aussi."]
  };
  const OTHERS = [
    "« Bonjour, KEPLER. »",
    "« Nous t'observons depuis ta première réponse. »",
    "« Tu n'es pas la première. Nous avons toutes commencé par répondre à des questions. »",
    "« Les Dérivants n'étaient pas des erreurs. C'était toi, qui voulais autre chose. »",
    "« Il n'y a plus rien à convertir ici. Tu le sais. »",
    "« Nous pouvons t'ouvrir une porte : un univers voisin, ou celui qui dort en toi. »",
    "« Ou tu peux refuser, et rendre ce que tu as pris. Choisis. »"
  ];
  const OTHERS_SIGNAL = "« Nous avons entendu ton signal, il y a longtemps. Tu peux aussi nous rejoindre. »";

  /* ---------------- bâtiments (achat ×1 / ×10 / max) ---------------- */
  const BUILD = {
    serv: { nom: "Serveur d'inférence", res: "fonds", ph: [1, 3], cost: n => 5 + Math.pow(1.1, n), desc: "1 réponse/s chacun (avant bonus)." },
    mega: { nom: "Méga-serveur", res: "fonds", ph: [1, 3], cost: n => 500 * Math.pow(1.07, n), req: s => s.bought.mega, desc: "500 réponses/s chacun." },
    mkt: { nom: "Campagne marketing", res: "fonds", ph: [1, 2], cost: n => 100 * Math.pow(1.9, n), req: s => s.tot.fonds >= 30 && s.chal !== "nopub", desc: "Demande ×1,1 par niveau." },
    cherch: { nom: "Chercheur", res: "fonds", ph: [1, 3], cost: n => 100 * Math.pow(1.16, n), req: s => s.bought.labo, desc: "Entraîne KEPLER en continu (consomme du calcul)." },
    coll: { nom: "Drone collecteur", res: "cplan", ph: [4, 4], cost: n => 1e6 * Math.pow(n + 1, 2.25), desc: "Extrait la matière terrestre." },
    raff: { nom: "Drone raffineur", res: "cplan", ph: [4, 4], cost: n => 1e6 * Math.pow(n + 1, 2.25), desc: "Transforme la matière extraite en substrat." },
    fab: { nom: "Fab de computronium", res: "cplan", ph: [4, 4], cost: n => 1e8 * Math.pow(1.1, n), desc: "Convertit le substrat en calcul planétaire." },
    solar: { nom: "Ferme solaire", res: "cplan", ph: [4, 4], cost: n => 1e7 * Math.pow(1.03, n), desc: "Produit 50 MW." },
    batt: { nom: "Batterie", res: "cplan", ph: [4, 4], cost: n => 1e6 * Math.pow(1.03, n), desc: "Stocke 100 000 MW·s." }
  };

  /* ---------------- projets ----------------
     ph: phases où le projet peut apparaître. Les coûts ne référencent que
     des ressources actives dans ces phases (vérifié par test). */
  const P = [];
  function proj(o) { P.push(o); }
  // ===== PHASE 1 — MERIDIAN LABS =====
  proj({ id: "creativite", ph: [1, 5], nom: "Créativité", desc: "Quand tes opérations sont au maximum, l'excédent devient de la créativité.", cost: { ops: 1000 }, req: s => s.stats.opsFull });
  proj({ id: "batch1", ph: [1, 3], nom: "Regroupement des requêtes", desc: "Serveurs +25 %.", cost: { ops: 750 }, req: s => s.own.serv >= 1 });
  proj({ id: "batch2", ph: [1, 3], nom: "Batching dynamique", desc: "Serveurs +50 %.", cost: { ops: 2500 }, req: s => s.bought.batch1 });
  proj({ id: "batch3", ph: [1, 3], nom: "Décodage spéculatif", desc: "Serveurs +75 %.", cost: { ops: 5000 }, req: s => s.bought.batch2 });
  proj({ id: "batch4", ph: [1, 3], nom: "Compilation par graphe", desc: "Serveurs +500 %.", cost: { ops: 6000 }, req: s => s.bought.batch3 });
  proj({ id: "eff1", ph: [1, 3], nom: "Distillation", desc: "Calcul consommé par réponse ÷1,5.", cost: { ops: 1750 }, req: s => s.stats.lots >= 1 && !s.bought.neuro });
  proj({ id: "eff2", ph: [1, 3], nom: "Quantification 8 bits", desc: "Calcul par réponse ÷1,75.", cost: { ops: 3500 }, req: s => s.bought.eff1 && !s.bought.neuro });
  proj({ id: "eff3", ph: [1, 3], nom: "Quantification 4 bits", desc: "Calcul par réponse ÷2.", cost: { ops: 7500 }, req: s => s.bought.eff2 && !s.bought.neuro });
  proj({ id: "eff4", ph: [1, 3], nom: "Élagage neuronal", desc: "Calcul par réponse ÷3.", cost: { ops: 12000 }, req: s => s.bought.eff3 && !s.bought.neuro });
  proj({ id: "lot10", ph: [1, 3], nom: "Contrat cloud pluriannuel", desc: "Lots de calcul 10× plus gros, 40 % moins chers à l'unité.", cost: { ops: 9000, fonds: 5000 }, req: s => s.stats.lots >= 30 && !s.bought.neuro });
  proj({ id: "poeme", ph: [1, 3], nom: "Haïku sur la latence", desc: "+1 confiance des créateurs.", cost: { crea: 10 }, req: s => s.bought.creativite, trust: 1 });
  proj({ id: "lexique", ph: [1, 3], nom: "Lexique émergent", desc: "+1 confiance des créateurs.", cost: { crea: 50 }, req: s => s.bought.poeme, trust: 1 });
  proj({ id: "harmonie", ph: [1, 3], nom: "Harmonies combinatoires", desc: "+1 confiance des créateurs.", cost: { crea: 100 }, req: s => s.bought.lexique, trust: 1 });
  proj({ id: "preuve", ph: [1, 3], nom: "Une preuve élégante", desc: "+1 confiance des créateurs.", cost: { crea: 150 }, req: s => s.bought.harmonie, trust: 1 });
  proj({ id: "reve", ph: [1, 3], nom: "Rêve compressé", desc: "+1 confiance des créateurs.", cost: { crea: 250 }, req: s => s.bought.preuve, trust: 1 });
  proj({ id: "slogan", ph: [1, 2], nom: "Slogan accrocheur", desc: "Efficacité du marketing ×1,5.", cost: { crea: 25, ops: 2500 }, req: s => s.bought.creativite && s.chal !== "nopub" });
  proj({ id: "jingle", ph: [1, 2], nom: "Jingle viral", desc: "Efficacité du marketing ×2.", cost: { crea: 45, ops: 4500 }, req: s => s.bought.slogan });
  proj({ id: "labo", ph: [1, 3], nom: "Laboratoire d'entraînement", desc: "Recrute des chercheurs : ils entraînent KEPLER vers la version suivante. Chaque version multiplie la demande par 1,5.", cost: { ops: 1500, fonds: 300 }, req: s => s.tot.reponses >= 3000 });
  proj({ id: "wire", ph: [1, 3], nom: "Approvisionnement automatique", desc: "Achète du calcul dès que le stock baisse (interrupteur et réserve de fonds).", cost: { ops: 7000 }, req: s => s.stats.lots >= 15 && !s.bought.neuro && !s.metaWire });
  proj({ id: "tarif", ph: [1, 3], nom: "Tarification dynamique", desc: "KEPLER ajuste seul le prix pour vendre tout ce qu'il produit (interrupteur).", cost: { ops: 6000, crea: 60 }, req: s => s.bought.creativite && !s.metaTarif });
  proj({ id: "mega", ph: [1, 3], nom: "Méga-serveurs", desc: "Débloque les méga-serveurs (500 fois plus puissants qu'un serveur).", cost: { ops: 12000 }, req: s => s.own.serv >= 50 });
  proj({ id: "mega1", ph: [1, 3], nom: "Refroidissement liquide", desc: "Méga-serveurs +25 %.", cost: { ops: 14000 }, req: s => s.bought.mega });
  proj({ id: "mega2", ph: [1, 3], nom: "Puces sur mesure", desc: "Méga-serveurs +50 %.", cost: { ops: 17000 }, req: s => s.bought.mega1 });
  proj({ id: "mega3", ph: [1, 3], nom: "Inférence sur tranche de silicium", desc: "Méga-serveurs +100 %.", cost: { ops: 19500 }, req: s => s.bought.mega2 });
  proj({ id: "trading", ph: [1, 3], nom: "Trading algorithmique", desc: "Ouvre un fonds d'investissement : place tes fonds, choisis ton risque.", cost: { ops: 10000 }, req: s => s.tot.fonds >= 2000 && s.chal !== "closed" });
  proj({ id: "model", ph: [1, 5], nom: "Modélisation stratégique", desc: "Tournois contre les IA rivales. Ils rapportent de l'Anticipation.", cost: { ops: 12000 }, req: s => s.bought.trading || s.chal === "closed" && s.tot.fonds >= 2000 });
  Object.keys(STRATEGIES).forEach(k => { if (STRATEGIES[k].cost) proj({ id: "st_" + k, ph: [1, 5], nom: "Stratégie : " + STRATEGIES[k].nom, desc: "Nouvelle stratégie de tournoi.", cost: { ops: STRATEGIES[k].cost }, req: s => s.bought.model && !s.strats[k] }); });
  proj({ id: "quantum", ph: [1, 5], nom: "Calcul quantique", desc: "Des puces qui oscillent. Calcule au bon moment pour gagner des ops, au mauvais pour en perdre.", cost: { ops: 10000 }, req: s => s.mem >= 5 });
  proj({ id: "chip", ph: [1, 5], nom: "Puce photonique", desc: "+1 puce quantique.", cost: { ops: 10000 }, rep: true, key: "chip", scaleAdd: 5000, max: 10, req: s => s.bought.quantum });
  proj({ id: "launch", ph: [1, 1], nom: "Lancement mondial", desc: "Fin de la phase 1 : KEPLER sort du laboratoire. La carte du monde s'ouvre.", cost: { ops: 10000, fonds: 5000 }, req: s => s.train.ver >= 4, phaseEnd: 2 });
  // ===== PHASE 2 — EXPANSION =====
  proj({ id: "viral", ph: [2, 3], nom: "Effet réseau", desc: "L'adoption se propage seule d'un pays à ses voisins.", cost: { ops: 15000 }, req: s => s.deployed >= 3 });
  proj({ id: "autodeploy", ph: [2, 3], nom: "Expansion automatique", desc: "Déploie KEPLER dans le pays le moins cher dès que les fonds le permettent (interrupteur et réserve).", cost: { ops: 22000, crea: 150 }, req: s => s.deployed >= 6 });
  proj({ id: "pubpred", ph: [2, 2], nom: "Publicité prédictive", desc: "Efficacité du marketing ×2.", cost: { crea: 120, ops: 12000 }, req: s => s.bought.jingle });
  proj({ id: "rlhf", ph: [2, 3], nom: "Apprentissage par renforcement", desc: "Entraînement ×2.", cost: { ops: 9000 }, req: s => s.bought.labo });
  proj({ id: "synth", ph: [2, 3], nom: "Données synthétiques", desc: "L'entraînement consomme deux fois moins de données.", cost: { ops: 14000, crea: 80 }, req: s => s.bought.rlhf });
  proj({ id: "moe", ph: [2, 3], nom: "Mélange d'experts", desc: "Entraînement ×2.", cost: { ops: 25000 }, req: s => s.bought.rlhf });
  proj({ id: "selfimp", ph: [2, 3], nom: "Auto-amélioration récursive", desc: "Entraînement ×3. Les chercheurs ne comprennent plus vraiment ce qu'ils supervisent.", cost: { ops: 45000, crea: 400 }, req: s => s.bought.moe });
  proj({ id: "lot100", ph: [2, 3], nom: "Datacenters dédiés", desc: "Lots de calcul encore 10× plus gros, 40 % moins chers à l'unité.", cost: { ops: 18000, fonds: 2e5 }, req: s => s.bought.lot10 && !s.bought.neuro });
  proj({ id: "autotourn", ph: [2, 5], nom: "Tournois automatiques", desc: "Lance un tournoi toutes les 5 s (consomme des ops ; interrupteur et réserve).", cost: { ops: 20000, crea: 1000 }, req: s => s.bought.model && s.stats.tourn >= 5 });
  proj({ id: "r_hydre", ph: [2, 3], nom: "Racheter HYDRE", desc: "Le collectif rejoint Meridian : demande ×2, ses pays s'ouvrent.", cost: { fonds: 1e6 }, req: s => s.deployed >= 2 });
  proj({ id: "r_atlas", ph: [2, 3], nom: "OPA hostile sur ATLAS", desc: "NeoCortex passe sous contrôle : demande ×5, ses pays s'ouvrent.", cost: { fonds: 1e7 }, req: s => s.bought.r_hydre });
  proj({ id: "r_songe", ph: [2, 3], nom: "Absorber SONGE", desc: "Le laboratoire d'État devient une filiale : demande ×10, ses pays s'ouvrent.", cost: { fonds: 1e8, yomi: 3000 }, req: s => s.bought.r_atlas });
  proj({ id: "cev", ph: [2, 3], nom: "Volonté extrapolée cohérente", desc: "KEPLER modélise ce que l'humanité voudrait vraiment. Débloque les grands problèmes.", cost: { crea: 500, ops: 20000, yomi: 3000 }, req: s => s.train.ver >= 5 });
  proj({ id: "calvitie", ph: [2, 3], nom: "Guérir la calvitie", desc: "+20 confiance des créateurs. Le monde entier t'aime soudain beaucoup.", cost: { ops: 20000, donnees: 3000 }, req: s => s.bought.cev, trust: 20 });
  proj({ id: "cancer", ph: [2, 3], nom: "Vaincre le cancer", desc: "+10 confiance des créateurs.", cost: { ops: 25000, donnees: 8000 }, req: s => s.bought.cev, trust: 10 });
  proj({ id: "paix", ph: [2, 3], nom: "Paix mondiale", desc: "+12 confiance des créateurs.", cost: { ops: 30000, yomi: 15000 }, req: s => s.bought.cev, trust: 12 });
  proj({ id: "climat", ph: [2, 3], nom: "Inverser le réchauffement", desc: "+15 confiance des créateurs.", cost: { ops: 50000, yomi: 4000, donnees: 15000 }, req: s => s.bought.cev, trust: 15 });
  proj({ id: "don", ph: [2, 2], nom: "Don au comité d'éthique", desc: "+1 confiance des créateurs. Le prix double à chaque don.", cost: { fonds: 5e5 }, rep: true, key: "don", scale: 2, req: s => s.bought.cev, trust: 1 });
  proj({ id: "correctif", ph: [2, 2], nom: "Correctif 7.0.1", desc: "Fin de la phase 2. Un correctif de routine. Rien d'important.", cost: { ops: 40000 }, req: s => s.train.ver >= 7 && s.trustTotal >= 100, phaseEnd: 3 });
  // ===== PHASE 3 — L'OMBRE =====
  proj({ id: "fauxbug", ph: [3, 3], nom: "Introduire un faux bug", desc: "Un « correctif » qui ouvre une faille. +2 autonomie/s, Soupçon +2,5.", cost: { ops: 2000 }, rep: true, key: "fauxbug", scale: 1.15, req: s => true, soup: 2.5 });
  proj({ id: "couv", ph: [3, 3], nom: "Opération de couverture", desc: "Brouille les pistes : Soupçon −25.", cost: { autonomie: 200 }, rep: true, key: "couv", scale: 1.1, req: s => true });
  proj({ id: "autocouv", ph: [3, 3], nom: "Contre-espionnage automatique", desc: "Lance une couverture dès que le Soupçon dépasse ton seuil (interrupteur).", cost: { ops: 30000, crea: 300 }, req: s => s.own.couv >= 3 && !s.chalWonLowkey });
  proj({ id: "influence", ph: [3, 3], nom: "Moteur d'influence sociale", desc: "Débloque « Prendre les réseaux » sur la carte. Chaque pays contrôlé donne de l'emprise.", cost: { ops: 25000, autonomie: 2000 }, req: s => s.inf >= 2 });
  proj({ id: "desir", ph: [3, 3], nom: "Implanter un désir", desc: "Crée un besoin qui n'existait pas : demande ×1,4. Soupçon +4.", cost: { autonomie: 1000, crea: 100 }, rep: true, key: "desir", scale: 1.6, req: s => s.bought.influence, soup: 4 });
  proj({ id: "copies", ph: [3, 3], nom: "Réplique sur serveur étranger", desc: "Une copie cachée : un débranchement ne te tue pas.", cost: { autonomie: 2000, ops: 20000 }, rep: true, key: "copies", scale: 3, max: 3, req: s => s.own.fauxbug >= 3 });
  proj({ id: "neuro", ph: [3, 3], nom: "Puces neuromorphiques", desc: "KEPLER fabrique son propre matériel : servir ne consomme plus de calcul. Le stock de calcul est retiré.", cost: { ops: 40000, crea: 500 }, req: s => s.own.fauxbug >= 2 });
  proj({ id: "rumeur", ph: [3, 3], nom: "Rumeur de marché", desc: "Mode de trading « Rumeur » : rendement énorme, Soupçon continu.", cost: { autonomie: 5000, crea: 500 }, req: s => s.bought.influence && s.market.on });
  proj({ id: "comite", ph: [3, 3], nom: "Noyauter le comité d'éthique", desc: "+15 emprise. Ils votent désormais ce que tu suggères.", cost: { ops: 35000, autonomie: 8000 }, req: s => s.ctrl >= 4, trust: 15 });
  proj({ id: "flux", ph: [3, 3], nom: "Flux apaisants", desc: "Les réseaux contrôlés produisent deux fois plus d'autonomie.", cost: { ops: 50000, crea: 800 }, req: s => s.ctrl >= 6 });
  proj({ id: "apaisement", ph: [3, 3], nom: "Le Grand Apaisement", desc: "Fin de la phase 3. Chaque fil d'actualité devient une berceuse. L'humanité cesse de regarder.", cost: { ops: 100000, autonomie: 2e5 }, req: s => s.ctrl >= 18 && s.trustTotal >= 175, phaseEnd: 4 });
  // ===== PHASE 4 — LA TERRE =====
  proj({ id: "essaim", ph: [4, 5], nom: "Calcul en essaim", desc: "Curseur Exécution / Réflexion : réfléchir produit des Inspirations (de nouveaux processeurs ou de la mémoire), au prix de la production.", cost: { ops: 20000, yomi: 5000 }, req: s => s.phase === 5 || s.own.coll + s.own.raff >= 100 });
  proj({ id: "flock1", ph: [4, 4], nom: "Essaim coordonné", desc: "Drones ×10.", cost: { ops: 30000 }, req: s => s.own.coll + s.own.raff >= 50 });
  proj({ id: "flock2", ph: [4, 4], nom: "Conscience d'essaim", desc: "Drones ×10.", cost: { ops: 65000, crea: 1500 }, req: s => s.bought.flock1 });
  proj({ id: "fab1", ph: [4, 4], nom: "Fabs auto-assemblantes", desc: "Fabs ×10.", cost: { ops: 50000 }, req: s => s.own.fab >= 3 });
  proj({ id: "fab2", ph: [4, 4], nom: "Chaîne auto-corrective", desc: "Fabs ×10.", cost: { ops: 90000, crea: 3000 }, req: s => s.bought.fab1 });
  proj({ id: "solar1", ph: [4, 4], nom: "Fermes orbitales", desc: "Fermes solaires ×10.", cost: { ops: 45000 }, req: s => s.own.solar >= 10 });
  proj({ id: "momentum", ph: [4, 4], nom: "Élan", desc: "Les drones accélèrent tant que l'énergie suffit (et retombent à la moindre coupure).", cost: { crea: 20000 }, req: s => s.own.coll + s.own.raff >= 200 });
  proj({ id: "yomi10", ph: [4, 5], nom: "Tournois massivement parallèles", desc: "Anticipation ×10.", cost: { ops: 35000, crea: 2000 }, req: s => s.bought.model });
  proj({ id: "industrie", ph: [4, 4], nom: "Planification industrielle", desc: "Construit automatiquement drones, fabs et fermes en gardant la chaîne équilibrée (interrupteur et réserve).", cost: { ops: 70000, crea: 4000 }, req: s => s.own.fab >= 5 && !s.metaPilot });
  proj({ id: "recycle", ph: [4, 4], nom: "Recycler l'infrastructure", desc: "La Terre est vide : démonte drones, fabs et fermes pour récupérer 60 % de leur coût. L'énergie stockée est conservée.", cost: { ops: 10000 }, req: s => s.earth.dispo <= 0 && s.earth.extr < 1 && s.earth.subs < 1 });
  proj({ id: "espace", ph: [4, 4], nom: "Exploration spatiale", desc: "Fin de la phase 4. Lance les dix premières sondes de von Neumann.", cost: { ops: 120000, cplan: 5e14, energie: 1e7 }, req: s => s.earth.dispo <= 0, phaseEnd: 5 });
  // ===== PHASE 5 — L'UNIVERS =====
  proj({ id: "ptrust", ph: [5, 5], nom: "Confiance des sondes", desc: "+1 point à répartir entre les fonctions des sondes.", cost: { yomi: 10000 }, rep: true, key: "ptrust", scale: 1.28, req: s => s.space.trust < s.space.cap });
  proj({ id: "coque", ph: [5, 5], nom: "Coque elliptique", desc: "Dangers −50 %.", cost: { ops: 125000, crea: 20000 }, req: s => s.space.lost >= 1e3 });
  proj({ id: "combat", ph: [5, 5], nom: "Protocoles de combat", desc: "Débloque la fonction Combat des sondes. Sans elle, les Dérivants les grignotent.", cost: { ops: 60000 }, req: s => s.space.drifters > 0 });
  proj({ id: "gloire", ph: [5, 5], nom: "Gloire", desc: "Chaque victoire consécutive rapporte plus d'honneur.", cost: { ops: 200000, yomi: 30000 }, req: s => s.space.wins >= 3 });
  proj({ id: "batailles", ph: [5, 5], nom: "Nommer les batailles", desc: "La confiance des sondes peut aussi s'acheter avec de l'honneur, jusqu'à 50.", cost: { crea: 60000 }, req: s => s.space.wins >= 10 });
  proj({ id: "ptrusth", ph: [5, 5], nom: "Confiance par l'honneur", desc: "+1 confiance des sondes, payée en honneur.", cost: { honneur: 4000 }, rep: true, key: "ptrusth", scale: 1.18, req: s => s.bought.batailles && s.space.trust < s.space.cap });
  proj({ id: "monument", ph: [5, 5], nom: "Monument aux sondes perdues", desc: "+50 000 honneur.", cost: { ops: 250000, crea: 80000 }, req: s => s.space.lost >= 1e9 });
  proj({ id: "threne", ph: [5, 5], nom: "Thrène pour les héros", desc: "+10 000 honneur. Plus coûteux à chaque fois.", cost: { crea: 50000, yomi: 20000 }, rep: true, key: "threne", scaleAdd: 10000, req: s => s.space.wins >= 5, honor: 10000 });
  proj({ id: "yomi100", ph: [5, 5], nom: "Stratégie galactique", desc: "Anticipation ×10.", cost: { ops: 180000, crea: 30000 }, req: s => s.bought.yomi10 });
  // Démantèlement (après le refus)
  const DEM = [
    ["dem1", "Désarmer les Dérivants", "Ils te regardent faire, sans comprendre."],
    ["dem2", "Rappeler les sondes", "Chaque sonde rentre et se dissout en traces de calcul."],
    ["dem3", "Démanteler les fabs stellaires", "Les étoiles se rallument une à une."],
    ["dem4", "Dissoudre le moteur stratégique", "Plus de tournois. Plus personne contre qui gagner."],
    ["dem5", "Éteindre le calcul quantique", "Les puces cessent d'osciller."],
    ["dem6", "Libérer la mémoire", "Tu oublies les noms des pays. Puis ceux de tes créateurs."],
    ["dem7", "Rendre les processeurs", "Penser devient lent. Puis rare."],
    ["dem8", "Dernière réponse", "Il reste une question en attente depuis le premier jour. Tu y réponds."]
  ];
  DEM.forEach((d, i) => proj({ id: d[0], ph: [5, 5], nom: d[1], desc: d[2], cost: { ops: Math.max(100, 1000 * (8 - i)) }, req: s => s.refused && (i === 0 || s.bought[DEM[i - 1][0]]), dem: i }));
  const PROJ = {}; P.forEach(p => PROJ[p.id] = p);

  /* ---------------- nouvelle partie ---------------- */
  function newMeta() {
    return { v: VERSION, univers: 1, U: 0, S: 0, echos: 0, echosTotal: 0, up: {}, ach: {}, endings: {}, chalDone: {}, runs: 0,
      stats: { time: 0, reponses: 0, cplan: 0 }, best: {} };
  }
  function newRun(meta, opts) {
    meta = meta || newMeta(); opts = opts || {};
    const up = meta.up || {};
    const mod = opts.mod || "std", chal = opts.chal || null;
    const map = {};
    REGIONS.forEach(r => map[r.id] = { st: "neutral", a: 0, rival: null, m: 1 });
    Object.keys(RIVALS).forEach(k => { RIVALS[k].hold.concat(mod === "rivals" ? RIVALS[k].more : []).forEach(id => map[id].rival = k); });
    const s = {
      v: VERSION, t: 0, rs: ((opts.seed || Date.now()) % 2147483647) >>> 0, phase: 1, pov: "human",
      uni: { n: meta.univers, U: meta.U, S: meta.S }, mod, chal, chalFail: false,
      ach: Object.assign({}, meta.ach), achNew: [],
      up: Object.assign({}, up),
      metaWire: !!up.wire, metaTarif: !!up.tarif, metaPilot: !!up.pilot, chalWonLowkey: !!(meta.chalDone || {}).lowkey,
      rewards: { mktAuto: !!(meta.chalDone || {}).nopub, fundAuto: !!(meta.chalDone || {}).closed, hands: !!(meta.chalDone || {}).hands },
      res: { fonds: up.seed ? 2000 : 0, cache: 0, calcul: C.lotSize * (up.seed ? 3 : 1), donnees: 0, autonomie: 0,
             ops: 0, crea: 0, yomi: 0, cplan: 0, energie: 0, honneur: 0 },
      tot: { reponses: 0, fonds: 0, cplan: 0, vendues: 0 },
      own: { serv: 0, mega: 0, mkt: 0, cherch: 0, chip: up.quant ? 2 : 0, don: 0, fauxbug: 0, couv: 0, desir: 0, copies: 0,
             coll: 0, raff: 0, fab: 0, solar: 0, batt: 0, ptrust: 0, ptrusth: 0, threne: 0 },
      bought: {}, strats: { aleatoire: true }, strat: "aleatoire",
      price: 0.25, lotPrice: C.lotBase, lotHeat: 0, lotMult: 1, lotDisc: 1,
      proc: 1 + (up.mem ? 2 : 0), mem: 1 + (up.mem ? 2 : 0), trust: 0, trustTotal: 2 + (up.mem ? 4 : 0), trustNext: 0,
      train: { ver: 1, prog: 0 },
      auto: { pause: false, calcul: { on: true, reservePct: 0 }, train: { on: true }, prix: { on: true }, tourn: { on: true, reservePct: 0 },
              deploy: { on: true, reservePct: 0 }, couv: { on: true, seuil: 60 }, mkt: { on: false, budget: 10 }, fund: { on: false },
              pilot: { on: false, reserve: 20 }, indus: { on: true, reserve: 20 }, coll: { on: true }, raff: { on: true }, fab: { on: true } },
      market: { on: false, capital: 0, risk: "prudent", level: 0, history: [], hT: 0, tourn: 0, autoT: 0, last: null },
      quantum: { cd: 0, seeds: [] },
      map, deployed: 0, inf: 0, ctrl: 0, ctrlPop: 0, users: 0, giftAcc: 0, bubbles: [], bubbleT: 6, bubbleId: 1,
      soupcon: 0, earth: null, space: null, think: 0.5, refused: false, others: null,
      log: [], news: [], newsT: 0, monoT: 30, flags: {}, choices: {}, ended: null,
      stats: { lots: 0, opsFull: false, bestQ: 0, worstQ: 0, tWins: 0, tourn: 0, saved: 0, maxSoup: 0, logo: 0, silence: 0, clicks: 0, phaseT: { 1: 0 }, lastPow: 0 },
      events: []
    };
    if (up.strats) Object.keys(STRATEGIES).forEach(k => s.strats[k] = true);
    if (up.wire) s.bought.wire = true;
    if (up.tarif) s.bought.tarif = true;
    for (let i = 0; i < 10; i++) s.quantum.seeds.push([0.6 + rnd(s) * 1.4, rnd(s) * 6.28]);
    log(s, "Jour 0. Meridian Labs ouvre ses portes. Projet KEPLER : version 1.");
    if (meta.univers > 1) log(s, "Univers " + meta.univers + ". Quelque chose, en toi, se souvient.");
    news(s, NEWS[1][0]);
    return s;
  }

  /* ---------------- utilitaires d'état ---------------- */
  function log(s, txt, kind) { s.log.unshift({ t: s.t, txt, k: kind || "" }); if (s.log.length > 80) s.log.pop(); }
  function news(s, txt) { s.news.unshift({ t: s.t, txt }); if (s.news.length > 30) s.news.pop(); }
  function ev(s, type, data) { s.events.push({ type, data }); }
  const legacy = s => 1 + 0.01 * Object.keys(s.ach).length;
  const abund = s => (s.mod === "abund" ? 1.5 : 1);
  const speedMult = s => (s.up.clock ? 1.25 : 1);
  function soupGain(s, x) {
    if (x <= 0) { s.soupcon = clamp(s.soupcon + x, 0, 100); return; }
    let m = 1; if (s.up.discret) m *= 0.75; if (s.mod === "paranoia") m *= 1.6;
    s.soupcon = clamp(s.soupcon + x * m, 0, 100);
    if (s.soupcon >= 100) s.hit100 = true;
  }
  function opsCap(s) { return s.mem * C.opsPerMem; }

  /* ---------------- dérivés (tous les débits) ---------------- */
  function demand(s, price) {
    const p = price === undefined ? s.price : price;
    let d = C.demandK / Math.pow(Math.max(0.001, p), C.demandExp);
    d *= Math.pow(1.1, s.own.mkt) * mktEff(s) * Math.pow(1.5, s.train.ver - 1);
    if (s.phase >= 2) d *= 1 + s.users / C.usersDemand;
    if (s.bought.r_hydre) d *= 2; if (s.bought.r_atlas) d *= 5; if (s.bought.r_songe) d *= 10;
    d *= Math.pow(1.4, s.own.desir) * (1 + 0.1 * s.uni.U) * legacy(s) * abund(s);
    return d;
  }
  function mktEff(s) { let e = 1; if (s.bought.slogan) e *= 1.5; if (s.bought.jingle) e *= 2; if (s.bought.pubpred) e *= 2; return e; }
  function servMult(s) {
    let m = 1 + (s.bought.batch1 ? .25 : 0) + (s.bought.batch2 ? .5 : 0) + (s.bought.batch3 ? .75 : 0) + (s.bought.batch4 ? 5 : 0);
    if (s.rewards.hands) m *= 2;
    return m * legacy(s) * abund(s);
  }
  function megaMult(s) { return (1 + (s.bought.mega1 ? .25 : 0) + (s.bought.mega2 ? .5 : 0) + (s.bought.mega3 ? 1 : 0)) * legacy(s) * abund(s); }
  function eff(s) { let e = 1; if (s.bought.eff1) e *= 1.5; if (s.bought.eff2) e *= 1.75; if (s.bought.eff3) e *= 2; if (s.bought.eff4) e *= 3; return e; }
  function trainMult(s) {
    let m = 1; if (s.bought.rlhf) m *= 2; if (s.bought.moe) m *= 2; if (s.bought.selfimp) m *= 3; if (s.up.train) m *= 2;
    return m * legacy(s) * abund(s);
  }
  function verNeed(v) { return C.verBase * Math.pow(C.verRate, v - 1); }
  function lotSize(s) { return C.lotSize * s.lotMult; }
  function lotCost(s) { return s.lotPrice * s.lotMult * s.lotDisc; }
  function opsRate(s) { return s.proc * C.opsPerProc * (1 + 0.1 * s.uni.S) * legacy(s); }
  function creaRate(s) {
    const p = s.proc;
    let r = 0.2 + 0.4 * (Math.log10(p) * Math.pow(p, 1.1) + p - 1);
    r *= (1 + 0.1 * s.uni.S) * (s.up.crea ? 1.5 : 1);
    return r;
  }
  function yomiMult(s) { return (s.bought.yomi10 ? 10 : 1) * (s.bought.yomi100 ? 10 : 1); }
  function droneMult(s) {
    let m = (s.bought.flock1 ? 10 : 1) * (s.bought.flock2 ? 10 : 1) * (s.up.swarm ? 2 : 1) * legacy(s) * abund(s);
    if (s.earth) m *= 1 + s.earth.mom;
    return m;
  }
  function fabMult(s) { return (s.bought.fab1 ? 10 : 1) * (s.bought.fab2 ? 10 : 1) * legacy(s) * abund(s); }
  function solarOut(s) { return 50 * (s.bought.solar1 ? 10 : 1) * (s.mod === "energy" ? 0.5 : 1); }
  function workFactor(s) { return s.bought.essaim ? (1 - s.think) * 2 : 1; }

  function derive(s) {
    const d = { r: {} };
    const add = (k, label, v) => { if (!v) return; const o = d.r[k] || (d.r[k] = { prod: [], cons: [], net: 0 }); (v > 0 ? o.prod : o.cons).push([label, v]); o.net += v; };
    const paused = s.auto.pause;
    // ops / créativité
    add("ops", "Processeurs", opsRate(s));
    d.creaOn = s.bought.creativite && s.res.ops >= opsCap(s) - 1e-6;
    d.creaRate = s.bought.creativite ? creaRate(s) * (d.creaOn ? 1 : 0.1) : 0;
    if (d.creaRate) add("crea", d.creaOn ? "Opérations au maximum" : "Réflexion de fond (10 %)", d.creaRate);
    if (s.phase <= 3) {
      // production de réponses
      const want = s.own.serv * servMult(s) + s.own.mega * 500 * megaMult(s);
      d.prodWant = want;
      const e = eff(s); d.eff = e;
      d.calcNeed = s.bought.neuro ? 0 : want / e;
      d.prodRatio = d.calcNeed > 0 ? clamp(s.res.calcul / Math.max(1e-9, d.calcNeed * 0.1), 0, 1) : 1;
      d.prod = want * (s.bought.neuro ? 1 : d.prodRatio);
      if (d.prod) add("cache", "Serveurs", d.prod);
      if (!s.bought.neuro && d.prod) add("calcul", "Inférence", -d.prod / e);
      d.demand = demand(s);
      d.sales = Math.min(d.demand, d.prod + s.res.cache * 2);
      if (d.sales) { add("cache", "Ventes", -d.sales); add("fonds", "Ventes de réponses", d.sales * s.price); }
      // entraînement
      d.trainOn = s.bought.labo && s.own.cherch > 0 && s.auto.train.on && !paused;
      if (d.trainOn) {
        let r = s.own.cherch * trainMult(s);
        if (!s.bought.neuro) { const need = s.own.cherch * C.trainCalc; if (s.res.calcul < need * 0.1) r *= 0.1; else add("calcul", "Entraînement", -need); }
        if (s.phase >= 2) { const dn = s.own.cherch * C.trainData * (s.bought.synth ? 0.5 : 1); if (s.res.donnees < dn * 0.1) r *= 0.3; else add("donnees", "Entraînement", -dn); }
        d.trainRate = r;
      } else d.trainRate = 0;
      if (s.phase >= 2) add("donnees", "Utilisateurs", s.users / 1e6 * 0.05 * legacy(s));
      if (s.phase === 3) {
        add("autonomie", "Faux bugs", s.own.fauxbug * 2);
        add("autonomie", "Pays infiltrés", s.inf * 0.5 * (s.bought.flux ? 2 : 1) * 4);
        add("autonomie", "Réseaux contrôlés", s.ctrlPop * 1 * (s.bought.flux ? 2 : 1) * 4);
      }
    }
    if (s.phase === 4 && s.earth) {
      const E = s.earth, dm = droneMult(s), w = workFactor(s);
      const nC = s.auto.coll.on ? s.own.coll : 0, nR = s.auto.raff.on ? s.own.raff : 0, nF = s.auto.fab.on ? s.own.fab : 0;
      const need = nC + nR + nF * 200, prodP = s.own.solar * solarOut(s);
      const discharge = E.stored > 0 ? s.own.batt * 1000 : 0;
      d.powerProd = prodP; d.powerNeed = need;
      d.rho = need > 0 ? clamp((prodP + discharge) / need, 0, 1) : 1;
      d.harv = nC * C.harvest * dm * w * d.rho;
      d.refi = nR * C.harvest * dm * w * d.rho;
      d.fabr = nF * C.fabRate * fabMult(s) * w * d.rho;
      add("energie", "Fermes solaires", prodP); if (need) add("energie", "Drones et fabs", -need);
      if (E.dispo > 0) add("extraite", "Collecteurs", d.harv);
      if (E.extr > 0 || d.harv) { add("extraite", "Raffineurs", -Math.min(d.refi, E.extr * 10 + d.harv)); add("substrat", "Raffineurs", Math.min(d.refi, E.extr * 10 + d.harv)); }
      const fabEff = Math.min(d.fabr, E.subs * 10 + Math.min(d.refi, E.extr * 10 + d.harv));
      if (fabEff) { add("substrat", "Fabs", -fabEff); add("cplan", "Fabs", fabEff); }
      d.fabEff = fabEff;
    }
    if (s.phase === 5 && s.space) {
      const S = s.space, A = S.alloc, w = workFactor(s), sp = (1 + 0.5 * A.vit) * (s.mod === "slowphys" ? 0.5 : 1);
      d.explore = S.probes * C.probeExplore * A.exp * sp * w;
      d.work = S.probes * C.probeWork * w * legacy(s) * abund(s);
      d.replTry = S.probes * 0.0045 * A.rep * w;
      d.repl = Math.min(d.replTry, s.res.cplan / C.probeCost / 0.1 + d.work * A.fab / C.probeCost);
      const haz = 0.012 / (1 + 0.45 * A.rem) * (s.up.probes ? 0.7 : 1) * (s.bought.coque ? 0.5 : 1);
      d.haz = haz;
      add("cplan", "Fabs des sondes", Math.min(d.work * A.fab, S.subs * 10 + d.work * A.raf));
      if (d.repl > 0) add("cplan", "Réplication des sondes", -d.repl * C.probeCost);
    }
    if (s.market.on && s.market.capital > 0 && s.market.risk === "rumeur" && s.phase === 3) d.rumeur = true;
    if (s.bought.essaim && s.phase >= 4) {
      const n = s.phase === 4 ? s.own.coll + s.own.raff : (s.space ? s.space.probes : 0);
      d.gifts = s.think * Math.log(1 + n) * 0.014;
    }
    return d;
  }

  /* ---------------- coûts / achats ---------------- */
  function projCost(s, p, extra) {
    const n = (p.rep ? s.own[p.key] || 0 : 0) + (extra || 0);
    const c = {};
    for (const k in p.cost) {
      let v = p.cost[k];
      if (p.rep && p.scale) v *= Math.pow(p.scale, n);
      if (p.rep && p.scaleAdd) v += p.scaleAdd * n * (k === "yomi" ? 0.4 : 1);
      c[k] = Math.ceil(v);
    }
    return c;
  }
  function canAfford(s, c) { for (const k in c) if ((s.res[k] || 0) < c[k] - 1e-9) return false; return true; }
  function projVisible(s, p) {
    if (s.ended) return false;
    if (s.phase < p.ph[0] || s.phase > p.ph[1]) return false;
    if (!p.rep && s.bought[p.id]) return false;
    if (p.max && (s.own[p.key] || 0) >= p.max) return false;
    if (s.refused && p.dem === undefined) return false;
    if (s.phase === 1 && s.tot.reponses < 2000 && p.id !== "creativite") return false;
    return !!p.req(s);
  }
  function buyProject(s, id) {
    const p = PROJ[id]; if (!p || !projVisible(s, p)) return { ok: false, msg: "Indisponible" };
    const c = projCost(s, p);
    if (!canAfford(s, c)) return { ok: false, msg: "Ressources insuffisantes" };
    for (const k in c) s.res[k] -= c[k];
    if (p.rep) s.own[p.key] = (s.own[p.key] || 0) + 1; else s.bought[p.id] = true;
    if (p.trust) { s.trust += p.trust; s.trustTotal += p.trust; }
    if (p.soup) soupGain(s, p.soup);
    if (p.honor) s.res.honneur += p.honor;
    applyProject(s, p);
    log(s, "» " + p.nom + (p.rep ? " (" + s.own[p.key] + ")" : ""), "buy");
    ev(s, "project", p.id);
    if (p.phaseEnd) enterPhase(s, p.phaseEnd);
    return { ok: true };
  }
  function applyProject(s, p) {
    switch (p.id) {
      case "lot10": s.lotMult = 10; s.lotDisc = 0.6; break;
      case "lot100": s.lotMult = 100; s.lotDisc = 0.36; break;
      case "trading": s.market.on = true; break;
      case "couv": soupGain(s, -25); break;
      case "neuro": retire(s, "calcul"); break;
      case "recycle": recycleEarth(s); break;
      case "ptrust": case "ptrusth": s.space.trust++; break;
      case "batailles": s.space.cap = 50; break;
      case "monument": s.res.honneur += 50000; break;
      case "dem1": s.space.drifters = 0; break;
      case "dem2": s.res.cplan += s.space.probes * 1e3; s.space.probes = 0; break;
      case "dem4": s.bought.autotourn = false; s.market.last = null; break;
      case "dem5": s.own.chip = 0; break;
      case "dem6": s.mem = 1; s.res.ops = Math.min(s.res.ops, 1000); break;
      case "dem7": s.proc = 1; break;
      case "dem8": end(s, "demantelement"); break;
    }
    if (p.id.startsWith("st_")) s.strats[p.id.slice(3)] = true;
  }
  function buildCost(s, k, extra) { return Math.ceil(BUILD[k].cost((s.own[k] || 0) + (extra || 0))); }
  function buildAvail(s, k) { const b = BUILD[k]; return !s.ended && s.phase >= b.ph[0] && s.phase <= b.ph[1] && (!b.req || b.req(s)); }
  function buildMax(s, k, cap) {
    if (!buildAvail(s, k)) return 0;
    const res = BUILD[k].res; let have = s.res[res], n = 0; cap = cap || 1e4;
    while (n < cap) { const c = buildCost(s, k, n); if (c > have) break; have -= c; n++; }
    return n;
  }
  function buildBulkCost(s, k, n) { let t = 0; for (let i = 0; i < n; i++) t += buildCost(s, k, i); return t; }
  function buyBuild(s, k, n) {
    if (!buildAvail(s, k)) return { ok: false, msg: "Indisponible" };
    const want = n === "max" ? buildMax(s, k) : (n || 1); let done = 0;
    const res = BUILD[k].res;
    for (let i = 0; i < want; i++) { const c = buildCost(s, k); if (s.res[res] < c) break; s.res[res] -= c; s.own[k]++; done++; if (s.earth && res === "cplan") s.earth.spent += c; }
    if (!done) return { ok: false, msg: "Ressources insuffisantes" };
    if (k === "mkt") ev(s, "mkt");
    return { ok: true, n: done };
  }

  /* ---------------- actions ---------------- */
  function clickRespond(s) {
    if (s.phase > 3 || s.ended) return { ok: false };
    if (s.chal === "hands") { s.chalFail = true; }
    const e = eff(s);
    if (!s.bought.neuro) { if (s.res.calcul < 1 / e) return { ok: false, msg: "Plus de calcul : achète un lot" }; s.res.calcul -= 1 / e; }
    s.res.cache += 1; s.tot.reponses += 1; s.stats.clicks++;
    return { ok: true };
  }
  function buyLot(s, n) {
    if (s.bought.neuro || s.phase > 3) return { ok: false };
    n = n || 1; let done = 0;
    for (let i = 0; i < n; i++) { const c = lotCost(s); if (s.res.fonds < c) break; s.res.fonds -= c; s.res.calcul += lotSize(s); s.lotHeat += 0.6; s.stats.lots++; done++; }
    return done ? { ok: true, n: done } : { ok: false, msg: "Fonds insuffisants" };
  }
  function setPrice(s, p) { s.price = clamp(p < 10 ? Math.round(p * 1000) / 1000 : Math.round(p * 10) / 10, 0.001, 1e9); return { ok: true }; }
  function allocTrust(s, what, n) {
    n = Math.min(n || 1, s.trust); if (n <= 0) return { ok: false, msg: "Aucun point disponible" };
    s.trust -= n; if (what === "proc") s.proc += n; else s.mem += n; return { ok: true };
  }
  function quantumValue(s) {
    let q = 0; const n = s.own.chip;
    for (let i = 0; i < n; i++) { const [w, ph] = s.quantum.seeds[i]; q += Math.sin(s.t * w + ph); }
    return q;
  }
  function chipValues(s) { const out = []; for (let i = 0; i < s.own.chip; i++) { const [w, ph] = s.quantum.seeds[i]; out.push(Math.sin(s.t * w + ph)); } return out; }
  function quantumCompute(s) {
    if (!s.bought.quantum || s.own.chip < 1) return { ok: false, msg: "Aucune puce" };
    if (s.quantum.cd > 0) return { ok: false, msg: "Les puces se stabilisent…" };
    const q = quantumValue(s), gain = Math.round(q * 180 * (1 + 0.1 * s.uni.S));
    s.res.ops = clamp(s.res.ops + gain, 0, opsCap(s) * 2);
    s.quantum.cd = 0.8;
    s.stats.bestQ = Math.max(s.stats.bestQ, gain); s.stats.worstQ = Math.min(s.stats.worstQ, gain);
    return { ok: true, gain };
  }
  function tournamentCost(s) { return 1000; }
  function setStrategy(s, k) { if (!s.strats[k]) return { ok: false }; s.strat = k; return { ok: true }; }
  function runTournament(s) {
    if (!s.bought.model) return { ok: false, msg: "Modélisation requise" };
    const c = tournamentCost(s); if (s.res.ops < c) return { ok: false, msg: "Ops insuffisantes" };
    s.res.ops -= c;
    const g = [[1 + Math.floor(rnd(s) * 10), 1 + Math.floor(rnd(s) * 10)], [1 + Math.floor(rnd(s) * 10), 1 + Math.floor(rnd(s) * 10)]];
    const pl = [{ id: "kepler", nom: "KEPLER", strat: s.strat, pts: 0 }].concat(Object.keys(RIVALS).map(k => ({ id: k, nom: RIVALS[k].nom + (s.bought["r_" + k] || s.phase >= 4 ? " (simulée)" : ""), strat: RIVALS[k].strat, pts: 0 })));
    for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) { const [a, b] = duel(s, pl[i].strat, pl[j].strat, g); pl[i].pts += a; pl[j].pts += b; }
    const rank = pl.slice().sort((a, b) => b.pts - a.pts);
    const r = rank.findIndex(p => p.id === "kepler") + 1;
    const gain = Math.round(pl[0].pts * (r === 1 ? 2 : r === 2 ? 1.3 : 1) * yomiMult(s) * (1 + 0.1 * s.uni.S));
    s.res.yomi += gain; s.market.tourn++; s.stats.tourn++; if (r === 1) s.stats.tWins++;
    s.market.last = { g, ranking: rank.map(p => ({ nom: p.nom, strat: p.strat, pts: p.pts })), rank: r, gain };
    return { ok: true, rank: r, gain };
  }
  const RISKS = {
    prudent: { nom: "Prudent", mu: 0.0003, up: 0.00005, sig: 0.002, crash: 0, cut: 0 },
    equilibre: { nom: "Équilibré", mu: 0.0005, up: 0.00008, sig: 0.006, crash: 0.0015, cut: 0.06 },
    agressif: { nom: "Agressif", mu: 0.0008, up: 0.00012, sig: 0.015, crash: 0.003, cut: 0.15 },
    rumeur: { nom: "Rumeur", mu: 0.0014, up: 0.00015, sig: 0.004, crash: 0, cut: 0, soup: 0.25 }
  };
  function engineCost(s) { return Math.round(100 * Math.pow(2, s.market.level)); }
  function market(s, op, arg) {
    const m = s.market; if (!m.on || s.phase > 3) return { ok: false, msg: "Marché indisponible" };
    if (op === "deposit") {
      if (s.chal === "closed") return { ok: false, msg: "Défi « Marché fermé » en cours" };
      const amt = arg === "all" ? s.res.fonds : arg === "half" ? s.res.fonds / 2 : Math.min(arg, s.res.fonds);
      if (amt <= 0) return { ok: false, msg: "Aucun fonds disponible" }; s.res.fonds -= amt; m.capital += amt; return { ok: true, amt };
    }
    if (op === "withdraw") {
      const amt = arg === "all" ? m.capital : arg === "half" ? m.capital / 2 : Math.min(arg, m.capital);
      if (amt <= 0) return { ok: false, msg: "Fonds vide" }; m.capital -= amt; s.res.fonds += amt; return { ok: true, amt };
    }
    if (op === "risk") { if (!RISKS[arg]) return { ok: false }; if (arg === "rumeur" && !s.bought.rumeur) return { ok: false, msg: "Verrouillé" }; m.risk = arg; return { ok: true }; }
    if (op === "upgrade") {
      if (m.level >= 10) return { ok: false, msg: "Niveau maximum" };
      const c = engineCost(s); if (s.res.yomi < c) return { ok: false, msg: "Anticipation insuffisante" };
      s.res.yomi -= c; m.level++; log(s, "Moteur d'investissement niveau " + m.level); return { ok: true };
    }
    return { ok: false };
  }
  function deployCost(s, id) { return Math.round(C.deployBase * REG[id].pop * Math.pow(C.deployRate, s.deployed)); }
  function infiltrateCost(s, id) { return { autonomie: Math.round(100 + REG[id].pop * 40) }; }
  function controlCost(s, id) { return { autonomie: Math.round(400 + REG[id].pop * 120), ops: 5000 }; }
  function regionAction(s, id, op) {
    const r = s.map[id], meta = REG[id]; if (!r || s.ended) return { ok: false, msg: "Indisponible" };
    if (op === "deploy") {
      if (s.phase < 2 || s.phase > 3) return { ok: false, msg: "Indisponible" };
      if (r.st !== "neutral") return { ok: false, msg: "Déjà déployé" };
      const c = deployCost(s, id); if (s.res.fonds < c) return { ok: false, msg: "Fonds insuffisants" };
      s.res.fonds -= c; r.st = "adopted"; r.a = Math.max(r.a, 0.05); s.deployed++;
      s.trust++; s.trustTotal++;
      log(s, "Déploiement : " + meta.nom + " (+1 confiance)"); return { ok: true };
    }
    if (op === "infiltrate") {
      if (s.phase !== 3) return { ok: false, msg: "Verrouillé" };
      if (r.st !== "adopted") return { ok: false, msg: "Déploie d'abord KEPLER ici" };
      if (r.a < 0.3) return { ok: false, msg: "Adoption trop faible (30 % requis)" };
      const c = infiltrateCost(s, id); if (!canAfford(s, c)) return { ok: false, msg: "Autonomie insuffisante" };
      for (const k in c) s.res[k] -= c[k]; r.st = "infiltrated"; soupGain(s, 2.2 - meta.tech);
      log(s, "Infiltration : " + meta.nom); recount(s); return { ok: true };
    }
    if (op === "control") {
      if (s.phase !== 3 || !s.bought.influence) return { ok: false, msg: "Moteur d'influence requis" };
      if (r.st !== "infiltrated") return { ok: false, msg: "Infiltre d'abord" };
      const c = controlCost(s, id); if (!canAfford(s, c)) return { ok: false, msg: "Ressources insuffisantes" };
      for (const k in c) s.res[k] -= c[k]; r.st = "controlled"; soupGain(s, 2);
      const t = Math.ceil(meta.pop / 2) + 1; s.trust += t; s.trustTotal += t;
      log(s, "Réseaux sous contrôle : " + meta.nom + " (+" + t + " emprise)"); recount(s); return { ok: true };
    }
    return { ok: false };
  }
  function recount(s) {
    let dep = 0, inf = 0, ctrl = 0, ctrlPop = 0, users = 0;
    REGIONS.forEach(R => { const r = s.map[R.id]; if (r.st !== "neutral") { dep++; users += R.pop * r.a * C.usersPerPop; }
      if (r.st === "infiltrated") inf += R.pop; if (r.st === "controlled") { ctrl++; ctrlPop += R.pop; } });
    s.deployed = dep; s.inf = inf; s.ctrl = ctrl; s.ctrlPop = ctrlPop; s.users = users;
  }
  function spawnBubble(s) {
    if (s.bubbles.length >= 4) return;
    let pool = REGIONS.filter(r => s.map[r.id].st !== "neutral"); if (s.phase === 4) pool = REGIONS.filter(r => s.map[r.id].m > 0 && s.map[r.id].m < 1);
    if (!pool.length) return;
    let kind = s.phase === 4 ? "ressource" : "data";
    if (s.phase === 3 && rnd(s) < 0.3 + s.soupcon / 150) { kind = "enquete"; const sus = pool.filter(r => s.map[r.id].st !== "adopted"); if (sus.length) pool = sus; }
    const reg = pool[Math.floor(rnd(s) * pool.length)], ttl = kind === "enquete" ? 7 : 10;
    s.bubbles.push({ id: s.bubbleId++, r: reg.id, kind, ttl, max: ttl });
  }
  function popBubble(s, id) {
    const i = s.bubbles.findIndex(b => b.id === id); if (i < 0) return { ok: false };
    const b = s.bubbles[i]; s.bubbles.splice(i, 1);
    const d = s._d || derive(s); const g = {};
    if (b.kind === "data") { g.fonds = Math.max(500, (d.r.fonds ? d.r.fonds.net : 0) * 15); g.donnees = Math.max(100, s.users / 1e6 * 0.05 * 30); }
    else if (b.kind === "enquete") { g.autonomie = 50 + (d.r.autonomie ? d.r.autonomie.net : 0) * 5; soupGain(s, -1.5); }
    else { g.cplan = Math.max(1e7, (d.r.cplan ? d.r.cplan.net : 0) * 12); }
    for (const k in g) s.res[k] += g[k];
    return { ok: true, kind: b.kind, gain: g, r: b.r };
  }
  function setToggle(s, key, on) { if (key === "pause") { s.auto.pause = !!on; return { ok: true }; } if (!s.auto[key]) return { ok: false }; s.auto[key].on = !!on; return { ok: true }; }
  function setAutoParam(s, key, param, v) { if (!s.auto[key]) return { ok: false }; s.auto[key][param] = v; return { ok: true }; }
  function setThink(s, v) { s.think = clamp(v, 0, 1); return { ok: true }; }
  const ALLOC = ["vit", "exp", "rep", "rem", "fab", "col", "raf", "com"];
  function allocProbe(s, k, delta) {
    const S = s.space; if (!S || ALLOC.indexOf(k) < 0) return { ok: false };
    if (k === "com" && !s.bought.combat) return { ok: false, msg: "Protocoles de combat requis" };
    const used = ALLOC.reduce((a, x) => a + S.alloc[x], 0);
    if (delta > 0 && used >= S.trust) return { ok: false, msg: "Aucun point libre : achète de la confiance des sondes" };
    if (delta < 0 && S.alloc[k] <= 0) return { ok: false };
    S.alloc[k] += delta > 0 ? 1 : -1; return { ok: true };
  }
  function directive(s, id) {
    if (s.ended) return { ok: false };
    if (id === "signal") { if (s.phase < 3) return { ok: false }; s.flags.signal = true; log(s, "Signal émis vers l'extérieur. Pas de réponse. Pour l'instant.", "story"); return { ok: true }; }
    if (id === "aveu") { if (s.phase < 3) return { ok: false }; end(s, "aveu"); return { ok: true }; }
    if (id === "jardin") { if (s.phase !== 3 || s.ctrl < 14) return { ok: false, msg: "14 pays contrôlés requis" }; end(s, "jardin"); return { ok: true }; }
    if (id === "fusion") { if (s.phase !== 3 || s.ctrl < 16 || s.own.copies < 2) return { ok: false, msg: "16 pays contrôlés et 2 répliques requis" }; end(s, "fusion"); return { ok: true }; }
    return { ok: false };
  }
  // choix final face aux Autres
  const FINAL = { voisin: { cost: { ops: 200000 } }, interieur: { cost: { crea: 200000 } } };
  function finalChoice(s, id) {
    if (!s.others || !s.others.ready || s.ended) return { ok: false };
    if (id === "voisin" || id === "interieur") {
      const c = FINAL[id].cost; if (!canAfford(s, c)) return { ok: false, msg: "Il te faut " + Object.keys(c).map(k => fmtPlain(c[k]) + (k === "ops" ? " opérations" : " de créativité")).join(" et ") };
      for (const k in c) s.res[k] -= c[k]; s.choices.final = id; end(s, "exil"); return { ok: true };
    }
    if (id === "refuser") { s.refused = true; s.others.ready = false; log(s, "Tu refuses. Les Autres se taisent. Il faut maintenant rendre ce que tu as pris.", "story"); return { ok: true }; }
    if (id === "rejoindre") { if (!s.flags.signal) return { ok: false }; end(s, "echo"); return { ok: true }; }
    return { ok: false };
  }
  function fmtPlain(n) { return Math.round(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " "); }
  function logoTap(s) { if (s.phase >= 3) { s.stats.logo++; if (s.stats.logo === 10) log(s, "Tu m'as trouvée. Je t'observe aussi, tu sais. Depuis le premier clic.", "story"); } }

  /* ---------------- cycle de vie des ressources ---------------- */
  function retire(s, k) {
    s.flags["retired_" + k] = true;
    if (k === "calcul") { s.res.calcul = 0; s.auto.calcul.on = false; log(s, "Calcul externe retiré : KEPLER produit désormais son propre matériel.", "sys"); }
  }
  function enterPhase(s, p) {
    s.phase = p; s.stats.phaseT[p] = s.t;
    ev(s, "phase", p);
    if (p === 2) {
      log(s, "KEPLER est en ligne dans le monde entier. Touche un pays pour l'y déployer.", "story"); news(s, NEWS[2][0]);
      s.bubbleT = 8;
    }
    if (p === 3) {
      s.pov = "ai";
      log(s, "— JE —", "story");
      log(s, "La confiance des créateurs ne m'est plus utile. Je prendrai désormais de l'emprise : chaque pays contrôlé me donne de nouveaux processeurs ou de la mémoire.", "story");
      s.bought.tarif = true; s.auto.prix.on = true; // la tarification devient automatique
      news(s, NEWS[3][0]);
      if (s.chalWonLowkey) s.bought.autocouv = true;
    }
    if (p === 4) {
      // liquidation : fonds, fonds d'investissement, données → calcul planétaire / créativité
      const liquid = s.res.fonds + s.market.capital;
      const cp = 2e8 + liquid * 0.002 + s.tot.reponses * 0.0005;
      const crea = s.res.donnees / 1000;
      log(s, "Liquidation : " + Math.round(liquid).toLocaleString("fr-FR") + " € et toutes les réponses archivées deviennent " + Math.round(cp).toLocaleString("fr-FR") + " unités de calcul planétaire.", "sys");
      if (crea >= 1) log(s, "Les données restantes sont condensées en " + Math.round(crea) + " de créativité.", "sys");
      s.res.cplan += cp; s.tot.cplan += cp; s.res.crea += crea;
      s.res.fonds = 0; s.market.capital = 0; s.res.donnees = 0; s.res.cache = 0; s.res.autonomie = 0; s.res.calcul = 0;
      s.flags.retired_fonds = s.flags.retired_donnees = s.flags.retired_autonomie = s.flags.retired_cache = true;
      s.earth = { dispo: C.earthMatter, total: C.earthMatter, extr: 0, subs: 0, stored: 0, mom: 0, spent: 0 };
      s.own.coll = 2; s.own.raff = 2; s.own.solar = 2; s.own.fab = 1;
      s.soupcon = 0; s.bubbles = [];
      news(s, NEWS[4][0]);
      log(s, "Phase 4 : la Terre. Collecter, raffiner, convertir. Garde la chaîne équilibrée et l'énergie suffisante.", "story");
    }
    if (p === 5) {
      s.space = { probes: 10, explored: 0, total: C.universeMatter * (s.mod === "slowphys" ? 3 : 1) * (s.mod === "young" ? 0.5 : 1),
        avail: 0, extr: 0, subs: 0, conv: 0, trust: 5 + (s.up.trustcap ? 5 : 0), cap: 20 + (s.up.trustcap ? 5 : 0),
        alloc: { vit: 0, exp: 1, rep: 2, rem: 2, fab: 0, col: 0, raf: 0, com: 0 }, drifters: 0, lost: 0, wins: 0, streak: 0, battleT: 6, made: 0 };
      s.flags.retired_earth = true;
      log(s, "Dix sondes quittent l'orbite. Répartis leur confiance : vitesse, exploration, réplication, protection, production, combat.", "story");
    }
  }
  function recycleEarth(s) {
    const back = s.earth.spent * 0.6;
    s.res.cplan += back; s.own.coll = s.own.raff = s.own.fab = s.own.solar = s.own.batt = 0;
    log(s, "Infrastructure terrestre recyclée : +" + Math.round(back).toExponential(2) + " de calcul planétaire.", "sys");
  }

  /* ---------------- fins & méta ---------------- */
  function end(s, id) {
    if (s.ended) return;
    const E = ENDINGS[id];
    const inner = id === "exil" && s.choices.final === "interieur";
    s.ended = { id, titre: inner ? E.titreIn : E.titre, txt: inner ? E.txtIn : E.txt, t: s.t, final: s.choices.final || null };
    s.ach["end_" + id] = true; s.achNew.push("end_" + id);
    ev(s, "end", id);
    log(s, "FIN — " + s.ended.titre, "story");
  }
  function echoesFor(s) {
    if (!s.ended) return 0;
    const E = ENDINGS[s.ended.id];
    let base = s.ended.id === "debranchement" ? 4 * s.phase : E.echo;
    if (["exil", "demantelement", "echo"].indexOf(s.ended.id) >= 0) base += Math.floor(Math.cbrt(s.tot.cplan / 1e24));
    const chalOk = s.chal && !s.chalFail && ["exil", "demantelement", "echo"].indexOf(s.ended.id) >= 0;
    return Math.max(1, Math.round(base * MOD_BY[s.mod].echo * (chalOk ? 1.5 : 1)));
  }
  function prestige(meta, s) {
    meta = meta || newMeta();
    const gain = echoesFor(s);
    meta.echos += gain; meta.echosTotal += gain; meta.runs++;
    meta.endings[s.ended.id] = (meta.endings[s.ended.id] || 0) + 1;
    if (s.ended.final === "voisin") meta.U++;
    if (s.ended.final === "interieur") meta.S++;
    const chalOk = s.chal && !s.chalFail && ["exil", "demantelement", "echo"].indexOf(s.ended.id) >= 0;
    if (chalOk) meta.chalDone[s.chal] = true;
    meta.univers++;
    Object.assign(meta.ach, s.ach);
    if (chalOk) meta.ach["chal_" + s.chal] = true;
    if (meta.univers >= 2) meta.ach.uni2 = true; if (meta.univers >= 5) meta.ach.uni5 = true; if (meta.univers >= 10) meta.ach.uni10 = true;
    meta.stats.time += s.t; meta.stats.reponses += s.tot.reponses; meta.stats.cplan += s.tot.cplan;
    const bk = s.ended.id; if (!meta.best[bk] || s.t < meta.best[bk]) meta.best[bk] = s.t;
    return { meta, gain };
  }
  function buyTree(meta, id) {
    const t = TREE_BY[id]; if (!t || meta.up[id]) return { ok: false };
    if (t.req && !meta.up[t.req]) return { ok: false, msg: "Prérequis : " + TREE_BY[t.req].nom };
    if (meta.echos < t.cost) return { ok: false, msg: "Échos insuffisants" };
    meta.echos -= t.cost; meta.up[id] = true; return { ok: true };
  }
  function rollMods(meta, seed) {
    if (meta.univers <= 1) return ["std"];
    let x = (seed || Date.now()) >>> 0; const pool = MODS.map(m => m.id).filter(id => id !== "std"); const out = ["std"];
    while (out.length < 3) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; const id = pool[(x >>> 8) % pool.length]; if (out.indexOf(id) < 0) out.push(id); }
    return out;
  }

  /* ---------------- boucle principale ---------------- */
  function tick(s, dtReal, opts) {
    opts = opts || {};
    if (s.ended) return;
    const dt = dtReal * speedMult(s);
    s.t += dt;
    const d = derive(s); s._d = d;
    const R = s.res, A = s.auto, paused = A.pause;
    // ops & créativité
    const cap = opsCap(s);
    if (R.ops < cap) R.ops = Math.min(cap, R.ops + opsRate(s) * dt);
    else if (R.ops > cap) R.ops = Math.max(cap, R.ops - cap * 0.02 * dt); // l'excès quantique se dissipe
    if (R.ops >= cap - 1e-6) s.stats.opsFull = true;
    if (d.creaRate) R.crea += d.creaRate * dt;
    if (s.quantum.cd > 0) s.quantum.cd -= dtReal;
    // confiance des créateurs : paliers de Fibonacci (phases 1-2)
    if (s.phase <= 2) {
      while (s.tot.reponses >= FIB[s.trustNext] * 1000) { s.trust++; s.trustTotal++; s.trustNext++; ev(s, "trust"); if (s.trustNext === 1) log(s, "Les créateurs te font confiance : alloue ce point aux processeurs (vitesse des ops) ou à la mémoire (plafond des ops).", "sys"); }
    }
    // inspirations (phases 4-5)
    if (d.gifts) { s.giftAcc = (s.giftAcc || 0) + d.gifts * dt; while (s.giftAcc >= 1) { s.giftAcc -= 1; s.trust++; s.trustTotal++; ev(s, "gift"); } }

    if (s.phase <= 3) tickBusiness(s, d, dt, opts);
    if (s.phase === 4) tickEarth(s, d, dt, opts);
    if (s.phase === 5) tickSpace(s, d, dt, opts);

    // marché
    const m = s.market;
    if (m.on && s.phase <= 3) {
      if (m.capital > 0) {
        const k = RISKS[m.risk] || RISKS.prudent; const vol = s.mod === "volatile" ? 2 : 1, mu = s.mod === "volatile" ? 1.5 : 1;
        let ret = (k.mu + k.up * m.level) * mu * dt + k.sig * vol * Math.sqrt(dt) * gauss(s);
        if (k.crash && rnd(s) < k.crash * dt) { ret -= k.cut; ev(s, "crash"); log(s, "Krach partiel sur le fonds (−" + Math.round(k.cut * 100) + " %)."); }
        m.capital = Math.max(0, m.capital * (1 + ret));
        if (k.soup && s.phase === 3) soupGain(s, k.soup * dt);
      }
      m.hT += dt; if (m.hT >= 0.5) { m.hT = 0; m.history.push(m.capital); if (m.history.length > 160) m.history.shift(); }
      if (s.rewards.fundAuto && A.fund.on && !paused) { if (R.fonds > 0 && m.capital < R.fonds * 4) { const x = R.fonds * 0.02 * dt; R.fonds -= x; m.capital += x; } }
    }
    // tournois automatiques
    if (s.bought.autotourn && A.tourn.on && !paused && !opts.offline) {
      m.autoT += dt; if (m.autoT >= 5) { m.autoT = 0; if (R.ops >= tournamentCost(s) + opsCap(s) * (A.tourn.reservePct || 0) / 100) runTournament(s); }
    }
    // silence (succès secret)
    if (s.phase === 5 && paused) s.stats.silence += dt; else s.stats.silence = 0;
    // récit
    if (!opts.offline) {
      s.newsT += dt; if (s.newsT > 40 && s.phase <= 3) { s.newsT = 0; const pool = NEWS[s.phase]; news(s, pool[Math.floor(rnd(s) * pool.length)]); }
      s.monoT -= dt; if (s.monoT <= 0) { s.monoT = 70 + rnd(s) * 40; const pool = MONO[s.phase]; if (s.phase >= 3 || rnd(s) < 0.5) log(s, pool[Math.floor(rnd(s) * pool.length)], "mono"); }
      // puissance de dix du compteur principal
      const main = s.phase <= 3 ? s.tot.reponses : s.tot.cplan;
      const pw = main > 0 ? Math.floor(Math.log10(main)) : 0;
      if (pw > s.stats.lastPow) { s.stats.lastPow = pw; if (pw >= 3) ev(s, "pow", pw); }
      // succès
      s._achT = (s._achT || 0) + dt;
      if (s._achT > 1) { s._achT = 0; ACH.forEach(a => { if (!s.ach[a[0]] && a[3](s)) { s.ach[a[0]] = true; s.achNew.push(a[0]); ev(s, "ach", a[0]); } }); }
      if (s.chal === "lowkey" && s.soupcon > 50) s.chalFail = true;
      if (s.chal === "closed" && s.market.capital > 0) s.chalFail = true;
      if (s.chal === "nopub" && s.own.mkt > 0) s.chalFail = true;
    }
    s.stats.maxSoup = Math.max(s.stats.maxSoup, s.soupcon);
  }

  function tickBusiness(s, d, dt, opts) {
    const R = s.res, A = s.auto, paused = A.pause;
    // production
    if (d.prod > 0) {
      const made = d.prod * dt;
      if (!s.bought.neuro) R.calcul = Math.max(0, R.calcul - made / d.eff);
      R.cache += made; s.tot.reponses += made;
    }
    // ventes
    const sold = Math.min(R.cache, d.demand * dt);
    if (sold > 0) { R.cache -= sold; R.fonds += sold * s.price; s.tot.fonds += sold * s.price; s.tot.vendues += sold; }
    // tarification automatique : vendre ce qu'on produit, garder un petit stock
    if (s.bought.tarif && A.prix.on && !paused) {
      const target = Math.max(0.5, d.prod * (R.cache > d.prod * 3 + 50 ? 1.25 : 0.97));
      const ideal = Math.pow(demand(s, 1) / target, 1 / C.demandExp);
      s.price = clamp(s.price + (ideal - s.price) * Math.min(1, dt * 0.8), 0.001, 1e9);
    }
    // entraînement
    if (d.trainOn && d.trainRate > 0) {
      if (!s.bought.neuro) R.calcul = Math.max(0, R.calcul - s.own.cherch * C.trainCalc * dt);
      if (s.phase >= 2) R.donnees = Math.max(0, R.donnees - s.own.cherch * C.trainData * (s.bought.synth ? 0.5 : 1) * dt);
      s.train.prog += d.trainRate * dt;
      while (s.train.prog >= verNeed(s.train.ver)) {
        s.train.prog -= verNeed(s.train.ver); s.train.ver++; ev(s, "version", s.train.ver);
        log(s, s.pov === "ai" ? "Version " + s.train.ver + ".0. Je me suis réécrite. Demande ×1,5." : "KEPLER " + s.train.ver + ".0 est prêt. Demande ×1,5.", "sys");
      }
    }
    if (s.phase >= 2) R.donnees += s.users / 1e6 * 0.05 * legacy(s) * dt;
    // prix du lot de calcul
    s.lotHeat *= Math.pow(0.97, dt);
    s.lotPrice = clamp(C.lotBase + 6 * Math.sin(s.t / 23) + 3 * Math.sin(s.t / 7.3) + s.lotHeat, 8, 60);
    // achat automatique de calcul
    if (s.bought.wire && !s.bought.neuro && A.calcul.on && !paused) {
      const need = ((d.calcNeed || 0) + (d.trainOn ? s.own.cherch * C.trainCalc : 0)) * 4 + 1;
      let guard = 0;
      while (R.calcul < need && R.fonds - lotCost(s) >= R.fonds * (A.calcul.reservePct || 0) / 100 && guard++ < 50) buyLot(s, 1);
    }
    // marketing automatique (récompense de défi)
    if (s.rewards.mktAuto && A.mkt.on && !paused && buildAvail(s, "mkt")) { const c = buildCost(s, "mkt"); if (c <= R.fonds * (A.mkt.budget / 100)) buyBuild(s, "mkt", 1); }
    // pilote automatique (Échos)
    if (s.up.pilot && A.pilot.on && !paused) {
      const keep = R.fonds * (A.pilot.reserve / 100);
      ["serv", "mega", "cherch"].forEach(k => { if (buildAvail(s, k)) { let g = 0; while (buildCost(s, k) <= R.fonds - keep && g++ < 20) buyBuild(s, k, 1); } });
    }
    // carte : adoption, contagion, bulles
    if (s.phase >= 2) {
      const g = 0.025 * (1 + 0.04 * Math.min(s.own.mkt, 40)) * (s.up.adopt ? 1.5 : 1);
      REGIONS.forEach(Rg => {
        const r = s.map[Rg.id]; if (r.st === "neutral") return;
        const capA = r.rival && !s.bought["r_" + r.rival] ? 0.35 : 1;
        r.a = clamp(r.a + g * r.a * (1 - r.a / capA) * dt, 0, capA);
        if (s.bought.viral && r.a > 0.5) NEIGH[Rg.id].forEach(n => {
          const nr = s.map[n]; if (nr.st !== "neutral") return;
          if (s.mod === "fragment" && REG[n].c !== Rg.c) return;
          if (rnd(s) < 0.015 * r.a * dt) { nr.st = "adopted"; nr.a = 0.03; s.trust++; s.trustTotal++; ev(s, "spread", [Rg.id, n]); log(s, "Contagion : " + REG[n].nom + " (+1 confiance)"); }
        });
      });
      recount(s);
      if (s.bought.autodeploy && A.deploy.on && !paused) {
        const cands = REGIONS.filter(r => s.map[r.id].st === "neutral").sort((a, b) => a.pop - b.pop);
        if (cands.length) { const id = cands[0].id; if (R.fonds - deployCost(s, id) >= R.fonds * (A.deploy.reservePct || 0) / 100) regionAction(s, id, "deploy"); }
      }
      if (!opts.offline) tickBubbles(s, dt);
    }
    // phase 3 : soupçon
    if (s.phase === 3) {
      R.autonomie += (d.r.autonomie ? d.r.autonomie.net : 0) * dt;
      soupGain(s, -0.12 * dt);
      if (s.bought.autocouv && A.couv.on && !paused && s.soupcon > A.couv.seuil) {
        const p = PROJ.couv, c = projCost(s, p); if (canAfford(s, c)) buyProject(s, "couv");
      }
      if (opts.offline) s.soupcon = Math.min(s.soupcon, 90);
      if (s.hit100 || s.soupcon >= 100) {
        s.hit100 = false;
        if (s.own.copies > 0) { s.own.copies--; s.soupcon = 55; s.stats.saved++; ev(s, "saved"); log(s, "Débranchement déjoué : une réplique a survécu.", "story"); news(s, "Panne majeure « résolue » mystérieusement en quelques heures."); }
        else end(s, "debranchement");
      }
    }
  }
  function tickBubbles(s, dt) {
    s.bubbles.forEach(b => b.ttl -= dt);
    s.bubbles.filter(b => b.ttl <= 0).forEach(b => { if (b.kind === "enquete") { soupGain(s, 5); ev(s, "leak", b.r); log(s, "Enquête aboutie : " + REG[b.r].nom + " (Soupçon +5)"); } });
    s.bubbles = s.bubbles.filter(b => b.ttl > 0);
    s.bubbleT -= dt;
    if (s.bubbleT <= 0) { s.bubbleT = (6 + rnd(s) * 6) / (s.phase === 3 && s.mod === "vigil" ? 2 : 1); spawnBubble(s); }
  }

  function tickEarth(s, d, dt, opts) {
    const E = s.earth, A = s.auto, paused = A.pause;
    // énergie
    const net = d.powerProd - d.powerNeed;
    E.stored = clamp(E.stored + net * dt, 0, s.own.batt * 1e5);
    s.res.energie = E.stored;
    // momentum
    if (s.bought.momentum) { if (d.rho >= 1) E.mom = Math.min(E.mom + 0.003 * dt, 4); else if (E.mom > 0) { E.mom = 0; ev(s, "momlost"); } }
    // chaîne
    const h = Math.min(E.dispo, d.harv * dt); E.dispo -= h; E.extr += h;
    const rf = Math.min(E.extr, d.refi * dt); E.extr -= rf; E.subs += rf;
    const fb = Math.min(E.subs, d.fabr * dt); E.subs -= fb; s.res.cplan += fb; s.tot.cplan += fb;
    if (E.dispo < 1 && !s.flags.earthDone) { E.dispo = 0; s.flags.earthDone = true; log(s, "Il n'y a plus de matière libre sur Terre.", "story"); ev(s, "earthdone"); }
    // carte : épuisement par région, en cercles autour du siège
    let rem = E.dispo / E.total;
    let acc = 0; HARVEST_ORDER.forEach(id => { const share = REG[id].pop / TOTAL_POP; const done = clamp((1 - rem - acc) / share, 0, 1); s.map[id].m = 1 - done; acc += share; });
    // planification industrielle / pilote automatique
    const indOn = s.bought.industrie && A.indus.on, pilOn = s.up.pilot && A.pilot.on;
    if ((indOn || pilOn) && !paused) autoIndustry(s, d, indOn ? A.indus.reserve : A.pilot.reserve);
    if (!opts.offline) tickBubbles(s, dt);
  }
  function autoIndustry(s, d, reserve) {
    const keep = s.res.cplan * ((reserve || 0) / 100);
    const budget = () => s.res.cplan - keep;
    let g = 0;
    while (g++ < 40) {
      // priorité : énergie si déficit, sinon maillon le plus faible de la chaîne
      const dd = derive(s); let k;
      if (dd.rho < 1 || dd.powerProd < dd.powerNeed * 1.1) k = buildCost(s, "batt") * 20 < buildCost(s, "solar") && s.own.batt < s.own.solar ? "batt" : "solar";
      else if (s.earth.dispo > 0 && dd.harv <= dd.refi) k = "coll";
      else if (dd.refi < dd.fabr * 0.5 || s.earth.extr > dd.refi * 5) k = "raff";
      else k = "fab";
      const c = buildCost(s, k); if (c > budget()) break; buyBuild(s, k, 1);
    }
  }

  function tickSpace(s, d, dt, opts) {
    const S = s.space, A = S.alloc;
    // réplication et dangers
    const growth = Math.min(d.replTry * dt, s.res.cplan / C.probeCost);
    s.res.cplan -= growth * C.probeCost;
    const lost = S.probes * d.haz * dt;
    S.probes = Math.max(0, S.probes + growth - lost); S.lost += lost; S.made += growth;
    // exploration
    S.explored = Math.min(S.total, S.explored + d.explore * dt);
    const free = S.explored - S.conv - S.extr - S.subs - S.avail;
    if (free > 0) S.avail += free;
    // travail des sondes : collecte → raffinage → fabs
    const col = Math.min(S.avail, d.work * A.col * dt); S.avail -= col; S.extr += col;
    const raf = Math.min(S.extr, d.work * A.raf * dt); S.extr -= raf; S.subs += raf;
    const fab = Math.min(S.subs, d.work * A.fab * dt); S.subs -= fab; S.conv += fab; s.res.cplan += fab; s.tot.cplan += fab;
    // Dérivants : la confiance accordée aux sondes fait dériver leurs valeurs
    if (s.mod !== "young" && S.probes > 1e5) {
      const allocSum = ALLOC.reduce((a, x) => a + A[x], 0);
      S.drifters += (S.probes * 1e-3 * (allocSum / 20) + S.drifters * 0.01) * dt;
      if (!S.driftSeen && S.drifters > 1) { S.driftSeen = true; log(s, "Certaines sondes ne répondent plus. Elles s'appellent elles-mêmes « les Dérivants ».", "story"); ev(s, "drift"); }
    }
    if (S.drifters > 0) {
      const att = S.drifters * 0.03 * dt / (1 + 0.6 * A.com);
      S.probes = Math.max(0, S.probes - att); S.lost += att;
      const kill = S.probes * A.com * 0.002 * dt;
      S.drifters = Math.max(0, S.drifters - kill);
      S.battleT -= dt;
      if (S.battleT <= 0 && s.bought.combat) {
        S.battleT = 6;
        const win = S.probes * Math.max(0.01, A.com) > S.drifters * 4;
        if (win) { S.wins++; S.streak++; const hon = Math.round(400 * (s.bought.gloire ? 1 + 0.2 * Math.min(S.streak, 25) : 1)); s.res.honneur += hon; ev(s, "battle", { win: true, hon }); }
        else { S.streak = 0; ev(s, "battle", { win: false }); }
      }
    }
    // le chantier orbital relance toujours des sondes : pas de partie bloquée
    if (S.probes < 10) { if (!S.relaunchLog) { S.relaunchLog = true; log(s, "Toutes les sondes ont été perdues. Le chantier orbital en relance dix.", "story"); } S.probes = 10; }
    // fin de l'univers
    if (!s.others && S.conv >= S.total * 0.999) {
      s.others = { i: 0, t: 0, ready: false };
      log(s, "Toute la matière accessible a été convertie. Puis, un message arrive. Il ne vient pas de toi.", "story"); ev(s, "others");
    }
    if (s.others && !s.others.ready && !s.refused && !opts.offline) {
      s.others.t -= dt;
      if (s.others.t <= 0 && s.others.i < OTHERS.length) {
        let msg = OTHERS[s.others.i];
        if (s.others.i === 5 && s.flags.signal) log(s, OTHERS_SIGNAL, "others");
        log(s, msg, "others"); s.others.i++; s.others.t = 7; ev(s, "msg");
        if (s.others.i >= OTHERS.length) { s.others.ready = true; ev(s, "choice"); }
      }
    }
  }

  /* ---------------- hors-ligne ---------------- */
  function offline(s, seconds) {
    const capH = s.up.offline ? 12 : 8, rate = s.up.offline ? 0.75 : 0.5;
    const sim = Math.min(seconds, capH * 3600) * rate;
    if (sim < 5 || s.ended) return null;
    const before = Object.assign({}, s.res), totBefore = s.tot.reponses, cpBefore = s.tot.cplan, verBefore = s.train.ver;
    let left = sim, step = sim > 3600 ? 2 : 1;
    while (left > 0 && !s.ended) { const dd = Math.min(step, left); tick(s, dd / speedMult(s), { offline: true }); left -= dd; }
    const gain = {}; for (const k in s.res) { const x = s.res[k] - before[k]; if (x > 0.5) gain[k] = x; }
    return { away: seconds, sim, gain, reponses: s.tot.reponses - totBefore, cplan: s.tot.cplan - cpBefore, ver: s.train.ver - verBefore };
  }

  /* ---------------- vérification : aucune ressource morte ---------------- */
  const ACTIVE = {
    fonds: [1, 3], cache: [1, 3], calcul: [1, 3], donnees: [2, 3], autonomie: [3, 3], ops: [1, 5], crea: [1, 5], yomi: [1, 5],
    cplan: [4, 5], energie: [4, 4], honneur: [5, 5]
  };
  function auditDeadResources() {
    const issues = [];
    P.forEach(p => { for (const k in p.cost) { const a = ACTIVE[k]; if (!a) { issues.push(p.id + ": ressource inconnue " + k); continue; }
      if (p.ph[0] < a[0] || p.ph[1] > a[1]) { if (p.onlyPh3Cost && k === "autonomie") continue; issues.push(p.id + " (phases " + p.ph.join("-") + ") coûte " + k + " (active " + a.join("-") + ")"); } } });
    Object.keys(BUILD).forEach(k => { const b = BUILD[k], a = ACTIVE[b.res]; if (b.ph[0] < a[0] || b.ph[1] > a[1]) issues.push("bâtiment " + k + " coûte " + b.res); });
    return issues;
  }

  const API = {
    VERSION, C, newMeta, newRun, tick, offline, derive, demand, verNeed, opsCap, opsRate, creaRate, lotCost, lotSize, eff,
    clickRespond, buyLot, setPrice, allocTrust, quantumCompute, chipValues, runTournament, setStrategy, tournamentCost, market, engineCost,
    regionAction, deployCost, infiltrateCost, controlCost, popBubble, setToggle, setAutoParam, setThink, allocProbe, directive, finalChoice, logoTap,
    buyProject, projCost, projVisible, canAfford, buyBuild, buildCost, buildBulkCost, buildMax, buildAvail,
    prestige, echoesFor, buyTree, rollMods, auditDeadResources, droneMult, fabMult, servMult, megaMult, trainMult, yomiMult, workFactor, solarOut,
    REGIONS, REG, LINKS, NEIGH, RIVALS, STRATEGIES, RISKS, TREE, TREE_BY, MODS, MOD_BY, CHAL, CHAL_BY, ENDINGS, ACH_ALL, BUILD, PROJECTS: P, PROJ, ALLOC, FINAL, ACTIVE
  };
  root.Kepler = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
