"""Test navigateur de KEPLER v5 : parcours complet des 5 phases sur ordinateur,
tablette et mobile, les 3 thèmes, le tiroir Héritage/Options, et la sauvegarde
en ligne contre un faux serveur Supabase (interception réseau Playwright).

Usage : python3 -I tools/uitest5.py [desk|tab|mob|cloud|all] [dossier_captures]
"""
import http.server, socketserver, threading, os, sys, json, uuid, hashlib, secrets, re, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/kepler-shots")
OUT.mkdir(parents=True, exist_ok=True)
for f in OUT.glob("*.png"): f.unlink()
ONLY = sys.argv[1] if len(sys.argv) > 1 else "all"
SUPA = "https://bcqcnphdtgbsulgjuuad.supabase.co"
os.chdir(ROOT)

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", 8095), Q)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:8095/"

# ---------------- faux serveur Supabase (mêmes règles que les fonctions SQL) ----------------
class FakeSupa:
    def __init__(self):
        self.users = {}; self.tokens = {}; self.refresh = {}; self.saves = {}; self.members = {}; self.codes = {}; self.calls = []
        self.anon_disabled = False
    @staticmethod
    def h(code): return hashlib.sha256(re.sub(r"[^A-Za-z0-9]", "", code or "").upper().encode()).hexdigest()
    def session(self, uid):
        at = "at-" + secrets.token_hex(8); rt = "rt-" + secrets.token_hex(8)
        self.tokens[at] = uid; self.refresh[rt] = uid
        return {"access_token": at, "token_type": "bearer", "expires_in": 3600, "refresh_token": rt, "user": {"id": uid, "is_anonymous": True}}
    def pull(self, uid):
        sid = self.members.get(uid)
        if not sid: return None
        r = dict(self.saves[sid]); r["has_code"] = any(v == sid for v in self.codes.values()); return r
    def handle(self, path, body, auth):
        self.calls.append(path)
        if path.startswith("/auth/v1/signup"):
            if self.anon_disabled: return 422, {"code": 422, "error_code": "anonymous_provider_disabled", "msg": "Anonymous sign-ins are disabled"}
            uid = str(uuid.uuid4()); self.users[uid] = True; return 200, self.session(uid)
        if path.startswith("/auth/v1/token"):
            uid = self.refresh.get(body.get("refresh_token"))
            if not uid: return 400, {"error_code": "refresh_token_not_found", "msg": "Invalid Refresh Token"}
            return 200, self.session(uid)
        uid = self.tokens.get((auth or "").replace("Bearer ", ""))
        if not uid: return 401, {"message": "JWT expired"}
        name = path.rsplit("/", 1)[-1]
        if name == "kepler_pull": return 200, self.pull(uid)
        if name == "kepler_push":
            sid = self.members.get(uid)
            row = {"run": body["p_run"], "meta": body["p_meta"], "ui": body.get("p_ui") or {}, "game_version": body["p_version"],
                   "play_seconds": body.get("p_play") or 0, "summary": body.get("p_summary") or {}, "client_saved_at": body.get("p_client_saved_at"), "updated_at": "2026-10-29T16:00:00Z"}
            if not sid:
                sid = str(uuid.uuid4()); self.saves[sid] = row; self.members[uid] = sid; return 200, {"ok": True, "created": True}
            cur = self.saves[sid]
            if not body.get("p_force") and cur["play_seconds"] > (body.get("p_play") or 0) + 120:
                return 200, {"ok": False, "conflict": True, "play_seconds": cur["play_seconds"], "summary": cur["summary"], "updated_at": cur["updated_at"]}
            self.saves[sid] = row; return 200, {"ok": True}
        if name == "kepler_create_code":
            sid = self.members.get(uid)
            if not sid: return 400, {"message": "aucune sauvegarde en ligne"}
            alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; raw = "".join(secrets.choice(alpha) for _ in range(16))
            for k in [k for k, v in self.codes.items() if v == sid]: del self.codes[k]
            self.codes[self.h(raw)] = sid
            return 200, "-".join(raw[i:i + 4] for i in range(0, 16, 4))
        if name == "kepler_claim_code":
            target = self.codes.get(self.h(body.get("p_code")))
            if not target: return 200, {"ok": False, "reason": "code inconnu"}
            if self.members.get(uid) == target: return 200, {"ok": False, "reason": "déjà relié"}
            self.members[uid] = target; return 200, {"ok": True, "save": self.pull(uid)}
        return 404, {"message": "inconnu"}

FAKE = FakeSupa()
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json"}
def supa_route(route, request):
    if request.method == "OPTIONS": return route.fulfill(status=204, headers=CORS, body="")
    path = request.url[len(SUPA):]
    try: body = json.loads(request.post_data or "{}")
    except Exception: body = {}
    status, data = FAKE.handle(path, body, request.headers.get("authorization"))
    route.fulfill(status=status, headers=CORS, body=json.dumps(data))

# ---------------- états de jeu (raccourcis vers chaque phase) ----------------
JS_P1 = """()=>{const K=Kepler,s=__kepler.state; s.res.fonds=3000; s.tot.reponses=6000; s.mem=12; s.proc=4; s.res.ops=12000; s.trust=3; s.stats.opsFull=true; s.stats.lots=20;
 ['creativite','batch1','batch2','labo','eff1'].forEach(id=>K.buyProject(s,id)); K.buyBuild(s,'serv',20); K.buyBuild(s,'cherch',3); s.res.crea=200; s.res.ops=12000; }"""
JS_P2 = """()=>{const K=Kepler,s=__kepler.state; s.train.ver=4; s.res.ops=12000; s.res.fonds=60000; K.buyProject(s,'launch'); }"""
JS_P2b = """()=>{const K=Kepler,s=__kepler.state; s.res.fonds=5e6; s.tot.fonds=5e6; ['us','fr','de','uk','in','br','cn'].forEach(r=>K.regionAction(s,r,'deploy')); s.map.us.a=.8; s.map.fr.a=.5;
 s.res.ops=12000; K.buyProject(s,'trading'); K.market(s,'deposit',20000); K.buyProject(s,'quantum'); K.buyProject(s,'model'); s.res.ops=20000; K.runTournament(s); K.buyProject(s,'chip'); K.buyProject(s,'chip'); }"""
JS_P3 = """()=>{const K=Kepler,s=__kepler.state; s.train.ver=7; s.trustTotal=110; s.mem=45; s.res.ops=45000; K.buyProject(s,'correctif'); }"""
JS_P3b = """()=>{const K=Kepler,s=__kepler.state; s.res.ops=45000; s.res.autonomie=60000; s.res.crea=5000; ['fauxbug','fauxbug','fauxbug'].forEach(id=>K.buyProject(s,id)); s.res.ops=45000;
 ['us','fr','de','uk'].forEach(r=>{s.map[r].a=.8;}); K.buyProject(s,'influence'); ['us','fr','de','uk'].forEach(r=>{K.regionAction(s,r,'infiltrate');}); K.regionAction(s,'us','control'); s.soupcon=42; }"""
JS_P4 = """()=>{const K=Kepler,s=__kepler.state; K.REGIONS.forEach(r=>{s.map[r.id].st='controlled';s.map[r.id].a=1;}); s.trustTotal=200; s.mem=105; s.res.ops=105000; s.res.autonomie=3e5; s.ctrl=24; K.buyProject(s,'apaisement'); }"""
JS_P4b = """()=>{const K=Kepler,s=__kepler.state; s.res.cplan=1e12; K.buyBuild(s,'coll',60); K.buyBuild(s,'raff',60); K.buyBuild(s,'solar',30); K.buyBuild(s,'fab',4); K.buyBuild(s,'batt',10); s.res.ops=40000; s.res.yomi=9000; K.buyProject(s,'essaim'); s.earth.dispo=s.earth.total*0.62; }"""
JS_P5 = """()=>{const K=Kepler,s=__kepler.state; s.earth.dispo=0; s.earth.extr=0; s.earth.subs=0; s.mem=125; s.res.ops=125000; s.res.cplan=2e15; s.res.energie=2e7; s.earth.stored=2e7; K.buyProject(s,'espace'); }"""
JS_P5b = """()=>{const K=Kepler,s=__kepler.state; s.res.yomi=5e5; for(let i=0;i<10;i++)K.buyProject(s,'ptrust'); s.space.probes=3e9; s.space.explored=s.space.total*0.003; s.space.conv=s.space.total*0.0004; s.space.drifters=2e7; s.res.ops=125000; K.buyProject(s,'combat'); K.allocProbe(s,'col',1);K.allocProbe(s,'raf',1);K.allocProbe(s,'fab',1);K.allocProbe(s,'com',1);K.allocProbe(s,'exp',1); }"""
JS_END = """()=>{const K=Kepler,s=__kepler.state; s.space.conv=s.space.total; s.space.explored=s.space.total; s.mem=210; s.res.ops=210000; s.res.crea=210000; }"""

errs = []
def watch(pg, name):
    pg.on("pageerror", lambda e: errs.append(name + " pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append(name + " console: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text else None)

def close(pg, n=4):
    for _ in range(n):
        if pg.evaluate("document.getElementById('scrim').hidden"): break
        pg.click("#modal .macts button"); pg.wait_for_timeout(150)

def shot(pg, name, full=False):
    pg.wait_for_timeout(350); pg.screenshot(path=str(OUT / (name + ".png")), full_page=full)

def view(pg, mob, v):
    if mob: pg.click(f'#bottomnav button[data-v="{v}"]'); pg.wait_for_timeout(200)

def journey(b, name, vp, mob, theme_cycle):
    ctx = b.new_context(viewport=vp, device_scale_factor=2 if not mob else 3, is_mobile=mob, has_touch=mob)
    ctx.route(SUPA + "/**", supa_route)
    pg = ctx.new_page(); watch(pg, name)
    pg.goto(BASE, wait_until="networkidle"); pg.wait_for_timeout(700)
    shot(pg, name + "_00_intro"); close(pg)
    for _ in range(12): pg.click("#btnRespond")
    pg.evaluate("__kepler.fast(15)"); shot(pg, name + "_01_p1_debut")
    pg.evaluate(JS_P1); pg.evaluate("__kepler.fast(5)")
    if theme_cycle:
        for t in ["papier", "terminal", "labo"]:
            pg.evaluate(f"__kepler.theme('{t}')"); shot(pg, f"{name}_02_p1_{t}", full=not mob)
        pg.evaluate("__kepler.theme('papier')")
    else: shot(pg, name + "_02_p1")
    if mob:
        view(pg, mob, "projets"); shot(pg, name + "_03_projets")
        view(pg, mob, "monde"); shot(pg, name + "_03b_monde_vide")
        view(pg, mob, "agir")
    pg.evaluate(JS_P2); pg.wait_for_timeout(300); shot(pg, name + "_04_p2_modale"); close(pg)
    pg.evaluate(JS_P2b); pg.evaluate("__kepler.fast(20)"); close(pg)
    view(pg, mob, "monde"); shot(pg, name + "_05_p2_monde", full=not mob)
    if mob:
        pg.click("#map", position={"x": 60, "y": 90}); pg.wait_for_timeout(300); shot(pg, name + "_05b_p2_fiche_pays")
        pg.evaluate("document.getElementById('sheet').hidden=true")
        view(pg, mob, "projets"); shot(pg, name + "_06_p2_projets")
    pg.evaluate("__kepler.theme('terminal')")
    pg.evaluate(JS_P3); pg.wait_for_timeout(300); shot(pg, name + "_07_p3_modale"); close(pg)
    pg.evaluate(JS_P3b); pg.evaluate("__kepler.fast(15)"); close(pg)
    view(pg, mob, "monde"); shot(pg, name + "_08_p3_ombre", full=not mob)
    pg.evaluate("__kepler.theme('labo')")
    pg.evaluate(JS_P4); pg.wait_for_timeout(300); close(pg)
    pg.evaluate(JS_P4b); pg.evaluate("__kepler.fast(20)"); close(pg)
    view(pg, mob, "agir"); shot(pg, name + "_09_p4_terre", full=not mob)
    if mob: view(pg, mob, "monde"); shot(pg, name + "_09b_p4_carte")
    pg.evaluate("__kepler.theme('papier')")
    pg.evaluate(JS_P5); pg.wait_for_timeout(300); close(pg)
    pg.evaluate(JS_P5b); pg.evaluate("__kepler.fast(10)"); close(pg)
    view(pg, mob, "monde"); shot(pg, name + "_10_p5_univers", full=not mob)
    if mob: view(pg, mob, "agir"); shot(pg, name + "_10b_p5_sondes")
    view(pg, mob, "journal"); shot(pg, name + "_11_journal")
    pg.evaluate(JS_END); pg.evaluate("__kepler.fast(60)"); pg.wait_for_timeout(400)
    shot(pg, name + "_12_choix")
    try: pg.click("#chBox button:nth-child(2)"); pg.wait_for_timeout(900)
    except Exception as e: errs.append(name + " choix : " + str(e))
    shot(pg, name + "_13_fin")
    try: pg.click("#modal .macts button"); pg.wait_for_timeout(400)
    except Exception as e: errs.append(name + " fin : " + str(e))
    shot(pg, name + "_14_nouvel_univers")
    try: pg.click("#modal .macts button"); pg.wait_for_timeout(400)
    except Exception as e: errs.append(name + " départ : " + str(e))
    pg.click("#btnHeritage"); pg.wait_for_timeout(300); shot(pg, name + "_15_heritage")
    pg.click('.dtabs button[data-d="options"]'); pg.wait_for_timeout(300); shot(pg, name + "_16_options")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    st = pg.evaluate("()=>{const s=__kepler.state,m=__kepler.meta;return {phase:s.phase,uni:m.univers,echos:m.echos,S:m.S,fin:Object.keys(m.endings),drawerFerme:document.getElementById('drawer').hidden}}")
    print(name, st)
    ctx.close()

def wait_status(pg, want, ms=8000):
    for _ in range(ms // 200):
        if pg.evaluate("window.KeplerCloud && KeplerCloud.status") == want: return True
        pg.wait_for_timeout(200)
    return False

def cloud_test(b):
    vp = {"width": 1280, "height": 860}
    FAKE.__init__()  # serveur vierge pour ce scénario
    # appareil 1 : création automatique du compte et de la sauvegarde
    c1 = b.new_context(viewport=vp); c1.route(SUPA + "/**", supa_route); p1 = c1.new_page(); watch(p1, "cloud1")
    p1.goto(BASE, wait_until="networkidle"); p1.wait_for_timeout(500); close(p1)
    ok1 = wait_status(p1, "ok"); print("appareil 1 connecté :", ok1, "| sauvegardes :", len(FAKE.saves))
    p1.evaluate(JS_P1); p1.evaluate("__kepler.fast(600)"); p1.evaluate("KeplerCloud.push()"); p1.wait_for_timeout(500)
    t1 = p1.evaluate("__kepler.state.t")
    p1.click("#btnOptions"); p1.wait_for_timeout(300)
    p1.click('#cloudBox [data-c="code"]'); p1.wait_for_timeout(800)
    code = p1.evaluate("(document.getElementById('cCode')||{}).textContent")
    shot(p1, "cloud_01_code"); print("code créé :", code)
    # appareil 2 : nouvelle partie, puis récupération par le code
    c2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); c2.route(SUPA + "/**", supa_route); p2 = c2.new_page(); watch(p2, "cloud2")
    p2.goto(BASE, wait_until="networkidle"); p2.wait_for_timeout(500); close(p2)
    wait_status(p2, "ok")
    p2.click("#btnOptions"); p2.wait_for_timeout(300)
    p2.fill("#cIn", (code or "").lower().replace("-", " ")); p2.click('#cloudBox [data-c="claim"]'); p2.wait_for_timeout(300)
    shot(p2, "cloud_02_confirmation"); p2.click("#modal .macts button"); p2.wait_for_timeout(1200)
    t2 = p2.evaluate("__kepler.state.t")
    print("appareil 2 récupère la partie :", abs(t2 - t1) < 30, "(t1 = %.0f s, t2 = %.0f s)" % (t1, t2), "| appareils reliés à une même sauvegarde :", len(set(FAKE.members.values())) == 1 and len(FAKE.members) == 2)
    p2.keyboard.press("Escape")
    # conflit : l'appareil 1 avance beaucoup, l'appareil 2 (en retard) essaie d'envoyer
    p1.keyboard.press("Escape"); p1.evaluate("__kepler.fast(900)"); p1.evaluate("KeplerCloud.push()"); p1.wait_for_timeout(600)
    p2.evaluate("KeplerCloud.push()"); p2.wait_for_timeout(900)
    modal = p2.evaluate("document.getElementById('scrim').hidden ? '' : document.querySelector('#modal h2').textContent")
    shot(p2, "cloud_03_conflit"); print("conflit détecté :", modal)
    if modal: p2.click("#modal .macts button"); p2.wait_for_timeout(800)
    print("appareil 2 rattrape l'appareil 1 :", p2.evaluate("__kepler.state.t") > t2 + 600)
    # rechargement de l'appareil 1 : la session et la sauvegarde sont conservées
    p1.reload(wait_until="networkidle"); p1.wait_for_timeout(500); close(p1); wait_status(p1, "ok")
    print("appareil 1 après rechargement : même compte =", len(FAKE.users) == 2)
    # serveur avec connexion anonyme désactivée
    FAKE.anon_disabled = True
    c3 = b.new_context(viewport=vp); c3.route(SUPA + "/**", supa_route); p3 = c3.new_page(); watch(p3, "cloud3")
    p3.goto(BASE, wait_until="networkidle"); p3.wait_for_timeout(500); close(p3)
    print("connexion anonyme désactivée détectée :", wait_status(p3, "disabled"))
    p3.click("#btnOptions"); p3.wait_for_timeout(300); shot(p3, "cloud_04_desactive")
    # serveur injoignable : le jeu continue
    c4 = b.new_context(viewport=vp); c4.route(SUPA + "/**", lambda r, q: r.abort()); p4 = c4.new_page(); watch(p4, "cloud4")
    p4.goto(BASE, wait_until="networkidle"); p4.wait_for_timeout(400); close(p4)
    print("hors ligne détecté :", wait_status(p4, "offline"))
    for c in (c1, c2, c3, c4): c.close()

with sync_playwright() as p:
    b = p.chromium.launch()
    if ONLY in ("desk", "all"): journey(b, "desk", {"width": 1440, "height": 900}, False, True)
    if ONLY in ("tab", "all"): journey(b, "tab", {"width": 1024, "height": 768}, False, False)
    if ONLY in ("mob", "all"): journey(b, "mob", {"width": 390, "height": 844}, True, True)
    if ONLY in ("cloud", "all"): cloud_test(b)
    b.close()
print("ERREURS :", len(errs))
for e in errs[:40]: print("  ", e[:300])
httpd.shutdown()
