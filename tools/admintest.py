"""Test du menu administrateur : code refusé puis accepté, ajouts de ressources, mémoire relevée pour les ops,
progression conservée au rechargement, annulation des ajouts, verrouillage, affichage mobile.

Le code n'est pas dans le dépôt : KEPLER_ADMIN_CODE=XXXX-XXXX-XXXX python3 -I tools/admintest.py [dossier_captures]
Sans cette variable, seule la partie « code refusé » est testée.
"""
import http.server, socketserver, threading, os, sys, pathlib, re, json
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; os.chdir(ROOT)
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/kepler-admin"); OUT.mkdir(parents=True, exist_ok=True)
CODE = os.environ.get("KEPLER_ADMIN_CODE", "")
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", 8098), Q); threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:8098/"
SRC = (ROOT / "tools" / "uitest5.py").read_text()
JS = {m.group(1): m.group(2) for m in re.finditer(r'^(JS_\w+) = """(.*?)"""', SRC, re.S | re.M)}
errs, fails = [], []
def check(name, ok, info=""):
    print(("OK   " if ok else "ÉCHEC"), name, info)
    if not ok: fails.append(name)
def close(pg, n=4):
    for _ in range(n):
        if pg.evaluate("document.getElementById('scrim').hidden"): break
        pg.click("#modal .macts button"); pg.wait_for_timeout(150)
def watch(pg, n):
    pg.on("pageerror", lambda e: errs.append(n + " pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append(n + " console: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text else None)
def enter(pg, code):
    if pg.evaluate("document.getElementById('drawer').hidden"): pg.click("#btnOptions"); pg.wait_for_timeout(200)
    pg.click('.dtabs [data-d="options"]'); pg.wait_for_timeout(150); pg.click("#btnAdmin"); pg.wait_for_timeout(200)
    pg.fill("#admCode", code); pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
def st(pg, expr): return pg.evaluate("()=>{const s=__kepler.state,m=__kepler.meta;return " + expr + "}")
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.route("https://bcqcnphdtgbsulgjuuad.supabase.co/**", lambda r, q: r.abort())
    pg = ctx.new_page(); watch(pg, "desk")
    pg.goto(BASE, wait_until="networkidle"); pg.wait_for_timeout(500); close(pg)
    # une partie en cours (phase 3), avant tout usage du menu
    for k in ["JS_P1", "JS_P2", "JS_P2b", "JS_P3", "JS_P3b"]:
        pg.evaluate(JS[k]); pg.wait_for_timeout(150); close(pg)
    pg.evaluate("__kepler.fast(20)"); close(pg)
    t0, ph0 = st(pg, "s.t"), st(pg, "s.phase")
    check("onglet Admin caché au départ", pg.evaluate("document.querySelector('.dtabs [data-d=admin]').hidden"))
    enter(pg, "AAAA-BBBB-CCCC")
    check("mauvais code refusé", pg.evaluate("document.getElementById('admMsg').textContent") == "Code incorrect." and not pg.evaluate("KeplerAdmin.unlocked"))
    pg.screenshot(path=str(OUT / "a1_code_refuse.png"))
    check("lecture des montants", pg.evaluate("[KeplerAdmin.parse('2,5M'),KeplerAdmin.parse('1Md'),KeplerAdmin.parse('3e12'),KeplerAdmin.parse('1 000 000'),isNaN(KeplerAdmin.parse('abc'))]") == [2.5e6, 1e9, 3e12, 1e6, True], str(pg.evaluate("[KeplerAdmin.parse('2,5M'),KeplerAdmin.parse('1Md'),KeplerAdmin.parse('3e12'),KeplerAdmin.parse('1 000 000')]")))
    if CODE:
        pg.click("#modal .macts button.ghost"); pg.wait_for_timeout(200)
        enter(pg, CODE.lower().replace("-", " "))
        check("bon code accepté (minuscules, espaces)", pg.evaluate("KeplerAdmin.unlocked") and pg.evaluate("document.getElementById('drawer').getAttribute('data-tab')") == "admin")
        check("partie intacte après déverrouillage", abs(st(pg, "s.t") - t0) < 5 and st(pg, "s.phase") == ph0)
        pg.wait_for_timeout(600); pg.screenshot(path=str(OUT / "a2_menu_bureau.png"), full_page=False)
        f0 = st(pg, "s.res.fonds")
        pg.fill("#admAmt", "2,5Md"); pg.wait_for_timeout(100)
        pg.click('#admMain [data-add="res:fonds"]'); pg.wait_for_timeout(300)
        check("fonds +2,5 Md", abs(st(pg, "s.res.fonds") - f0 - 2.5e9) < 1e3)
        check("copie de sécurité gardée", pg.evaluate("!!localStorage.getItem('kepler4.adminBackup')"))
        pg.click('#pAdmin [data-amt="1000000"]'); pg.click('#admMain [data-add="res:ops"]'); pg.wait_for_timeout(300)
        pg.evaluate("__kepler.fast(10)")
        check("ops +1 M gardées (mémoire relevée)", st(pg, "s.res.ops") >= 1e6 and st(pg, "s.mem") >= 1000, str(st(pg, "[s.res.ops, s.mem]")))
        tr0 = st(pg, "[s.trust, s.trustTotal]")
        pg.click('#admMind [data-add="trust"][data-n="10"]'); pg.wait_for_timeout(200)
        check("confiance +10", st(pg, "[s.trust, s.trustTotal]") == [tr0[0] + 10, tr0[1] + 10])
        a0 = st(pg, "s.res.autonomie"); pg.click("#admAll"); pg.wait_for_timeout(200)
        check("Tout ajouter", st(pg, "s.res.autonomie") >= a0 + 1e6)
        e0 = st(pg, "m.echos"); pg.click('#admMeta [data-add="echos"]'); pg.wait_for_timeout(200)
        check("Échos +1 M", st(pg, "m.echos") == e0 + 1e6)
        pg.wait_for_timeout(700); pg.screenshot(path=str(OUT / "a3_apres_ajouts.png"))
        # rechargement : déverrouillage et ressources conservés
        fonds1 = st(pg, "s.res.fonds"); pg.evaluate("__kepler.save()")
        pg.reload(wait_until="networkidle"); pg.wait_for_timeout(1200); close(pg)
        check("après rechargement : ressources gardées", st(pg, "s.res.fonds") >= fonds1 * 0.99 and st(pg, "s.phase") == ph0)
        check("après rechargement : menu toujours déverrouillé", pg.evaluate("KeplerAdmin.unlocked") and not pg.evaluate("document.querySelector('.dtabs [data-d=admin]').hidden"))
        # annuler les ajouts
        pg.click("#btnOptions"); pg.wait_for_timeout(200); pg.click('.dtabs [data-d="admin"]'); pg.wait_for_timeout(300)
        pg.click("#admUndo"); pg.wait_for_timeout(200); pg.click("#modal .macts button.danger"); pg.wait_for_timeout(600)
        check("annuler : fonds revenus avant les ajouts", st(pg, "s.res.fonds") < f0 + 1e6 and st(pg, "m.echos") == e0, str(st(pg, "[s.res.fonds, m.echos]")))
        check("annuler : progression d'avant gardée", st(pg, "s.phase") == ph0 and st(pg, "s.t") >= t0 - 1)
        # verrouiller
        pg.click("#admLock"); pg.wait_for_timeout(300)
        check("verrouillage", not pg.evaluate("KeplerAdmin.unlocked") and pg.evaluate("document.querySelector('.dtabs [data-d=admin]').hidden") and pg.evaluate("localStorage.getItem('kepler.admin')") is None)
        # mobile, phase 5 et thème Terminal
        c2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=3)
        c2.route("https://bcqcnphdtgbsulgjuuad.supabase.co/**", lambda r, q: r.abort())
        m = c2.new_page(); watch(m, "mob"); m.goto(BASE, wait_until="networkidle"); m.wait_for_timeout(400); close(m)
        for k in ["JS_P1", "JS_P2", "JS_P2b", "JS_P3", "JS_P3b", "JS_P4", "JS_P4b", "JS_P5", "JS_P5b"]:
            m.evaluate(JS[k]); m.wait_for_timeout(120); close(m)
        m.evaluate("__kepler.theme('terminal')")
        enter(m, CODE); m.wait_for_timeout(700)
        m.screenshot(path=str(OUT / "a4_menu_mobile.png"))
        pr0 = m.evaluate("__kepler.state.space.probes"); m.click('#admMain [data-add="space:probes"]'); m.wait_for_timeout(200)
        check("mobile phase 5 : sondes +1 M", m.evaluate("__kepler.state.space.probes") >= pr0 + 1e6)
        sw = m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('.dbody').scrollWidth <= document.querySelector('.dbody').clientWidth + 1")
        check("mobile : pas de défilement horizontal", sw)
        m.evaluate("document.querySelector('.dbody').scrollTop = 99999"); m.wait_for_timeout(300); m.screenshot(path=str(OUT / "a5_menu_mobile_bas.png"))
    b.close()
print("ERREURS :", len(errs) + len(fails))
for e in errs[:20]: print("  ", e[:300])
