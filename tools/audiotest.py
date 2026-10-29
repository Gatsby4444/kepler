"""Test de la bande sonore : rien avant le premier geste, musique après, une pièce par phase,
pause étouffée, touche M, volume, final et reprise. Mesure le niveau (RMS) et la crête par phase.

Usage : python3 -I tools/audiotest.py
"""
import http.server, socketserver, threading, os, pathlib, json
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; os.chdir(ROOT)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", 8096), Q); threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:8096/"
errs, fails = [], []
def check(name, ok, info=""):
    print(("OK   " if ok else "ÉCHEC"), name, info)
    if not ok: fails.append(name)
def close(pg, n=4):
    for _ in range(n):
        if pg.evaluate("document.getElementById('scrim').hidden"): break
        pg.click("#modal .macts button"); pg.wait_for_timeout(150)
def measure(pg, sec=6):
    vals = pg.evaluate("""(sec)=>new Promise(r=>{const out=[];const id=setInterval(()=>{const a=__kepler.audio();out.push([a.level,a.peak]);},100);setTimeout(()=>{clearInterval(id);r(out)},sec*1000)})""", sec)
    rms = sum(v[0] for v in vals) / len(vals); pk = max(v[1] for v in vals)
    return rms, pk
SRC = (ROOT / "tools" / "uitest5.py").read_text()
import re
ns = {m.group(1): m.group(2) for m in re.finditer(r'^(JS_\w+) = """(.*?)"""', SRC, re.S | re.M)}
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 860})
    ctx.route("https://bcqcnphdtgbsulgjuuad.supabase.co/**", lambda r, q: r.abort())
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text else None)
    pg.goto(BASE, wait_until="networkidle"); pg.wait_for_timeout(600)
    a = pg.evaluate("__kepler.audio()")
    check("aucun son avant le premier geste", not a["armed"] and a["ctx"] == "none", json.dumps(a))
    close(pg); pg.wait_for_timeout(2500)
    a = pg.evaluate("__kepler.audio()")
    check("musique lancée au premier clic", a["armed"] and a["ctx"] == "running" and a["music"] and a["phase"] == 1, json.dumps(a))
    lv = {}
    rms, pk = measure(pg, 7); lv[1] = (rms, pk)
    for k in ["JS_P1"]: pg.evaluate(ns[k]); pg.evaluate("__kepler.fast(5)")
    rms, pk = measure(pg, 5); lv["1+"] = (rms, pk)
    for ph, (a1, a2) in {2: ("JS_P2", "JS_P2b"), 3: ("JS_P3", "JS_P3b"), 4: ("JS_P4", "JS_P4b"), 5: ("JS_P5", "JS_P5b")}.items():
        pg.evaluate(ns[a1]); pg.wait_for_timeout(300); close(pg); pg.evaluate(ns[a2]); pg.evaluate("__kepler.fast(10)"); close(pg)
        pg.wait_for_timeout(3500)
        a = pg.evaluate("__kepler.audio()")
        check(f"phase {ph} : pièce {ph}", a["phase"] == ph, json.dumps({k: a[k] for k in ("phase", "step", "ctx")}))
        if ph == 3:
            pg.evaluate("__kepler.state.soupcon = 85"); pg.wait_for_timeout(1500)
        lv[ph] = measure(pg, 7)
    a = pg.evaluate("__kepler.audio()"); check("aucune erreur dans les pièces", a["errs"] == 0, a["lastErr"])
    for k, (r, m) in lv.items(): print(f"   niveau phase {k}: RMS {r:.4f}  crête {m:.3f}")
    check("niveaux audibles dans toutes les phases", all(r > 0.004 for r, m in lv.values()))
    check("pas de saturation (crête < 0,98)", all(m < 0.98 for r, m in lv.values()))
    # pause : musique étouffée
    pg.click("#pauseBtn"); pg.wait_for_timeout(1200)
    check("pause : musique étouffée", pg.evaluate("__kepler.audio().paused"))
    pg.click("#pauseBtn"); pg.wait_for_timeout(600)
    # touche M
    pg.keyboard.press("m"); pg.wait_for_timeout(2500)
    a = pg.evaluate("__kepler.audio()"); r_off, _ = measure(pg, 2)
    check("touche M coupe la musique", not a["music"] and pg.evaluate("document.getElementById('btnMusic').getAttribute('aria-pressed')") == "false", f"RMS {r_off:.5f}")
    pg.keyboard.press("m"); pg.wait_for_timeout(2500)
    check("touche M la relance", pg.evaluate("__kepler.audio().music") and measure(pg, 2)[0] > 0.003)
    # volume à 0 depuis les Options
    pg.click("#btnOptions"); pg.wait_for_timeout(300)
    np = pg.evaluate("document.getElementById('nowPlaying').textContent"); check("Options : morceau affiché", "V. L'Univers" in np, np)
    pg.evaluate("()=>{const v=document.getElementById('optVol');v.value=0;v.dispatchEvent(new Event('input'));v.dispatchEvent(new Event('change'))}")
    pg.wait_for_timeout(2600); r0, _ = measure(pg, 1.5)
    check("volume 0 : silence musical", r0 < 0.002, f"RMS {r0:.5f}")
    check("volume enregistré", pg.evaluate("JSON.parse(localStorage.getItem('kepler4.ui')).vol") == 0)
    pg.evaluate("()=>{const v=document.getElementById('optVol');v.value=60;v.dispatchEvent(new Event('input'));v.dispatchEvent(new Event('change'))}")
    pg.click("#optSound"); check("bruitages coupables", pg.evaluate("JSON.parse(localStorage.getItem('kepler4.ui')).sound") is False)
    pg.click("#optSound")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    # final puis nouvel univers
    pg.evaluate(ns["JS_END"]); pg.evaluate("__kepler.fast(60)"); pg.wait_for_timeout(400)
    pg.click("#chBox button:nth-child(2)"); pg.wait_for_timeout(1500)
    check("final : accord de fin", pg.evaluate("__kepler.audio().ending"))
    pg.click("#modal .macts button"); pg.wait_for_timeout(400); pg.click("#modal .macts button"); pg.wait_for_timeout(4000)
    a = pg.evaluate("__kepler.audio()")
    check("nouvel univers : la musique reprend en phase 1", not a["ending"] and a["phase"] == 1 and measure(pg, 3)[0] > 0.003, json.dumps(a))
    # rechargement : la préférence « musique coupée » est respectée
    pg.keyboard.press("m"); pg.wait_for_timeout(300); pg.reload(wait_until="networkidle"); pg.wait_for_timeout(500)
    pg.mouse.click(5, 300); pg.wait_for_timeout(1500)
    a = pg.evaluate("__kepler.audio()")
    check("après rechargement, musique toujours coupée", a["armed"] and not a["music"], json.dumps(a))
    # le premier clic sur le bouton musique la lance (sans la recouper)
    c2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); c2.route("https://bcqcnphdtgbsulgjuuad.supabase.co/**", lambda r, q: r.abort())
    p2 = c2.new_page(); p2.on("pageerror", lambda e: errs.append("mob pageerror: " + str(e)))
    p2.goto(BASE, wait_until="networkidle"); p2.wait_for_timeout(500)
    p2.evaluate("()=>{const s=document.getElementById('scrim'); s.hidden=true}")
    p2.tap("#btnMusic"); p2.wait_for_timeout(2500)
    a = p2.evaluate("__kepler.audio()")
    check("mobile : un toucher sur le bouton lance la musique", a["music"] and a["ctx"] == "running", json.dumps(a))
    p2.screenshot(path="/tmp/claude-0/-home-claude/7d8b7d56-aa82-5080-80f8-7c64d6c32460/scratchpad/s6/mob_header.png")
    b.close()
print("ERREURS :", len(errs) + len(fails))
for e in errs[:20]: print("  ", e[:300])
