"""Sestaví webovou verzi plánovače ze stejného zdroje jako verze v Claude.
Použití: python3 -I build_web.py <zdroj.src.html> <web.js> <výstupní složka>"""
import re, sys, os
src, webjs, out = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(src, encoding='utf-8').read()
css = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
body = s[s.index('</style>') + 8:s.index('<script>')].strip()
js = re.search(r'<script>(.*?)</script>', s, re.S).group(1)

def cut_block(text, start, end_marker):
    i = text.index(start)
    j = text.index(end_marker, i) + len(end_marker)
    return text[:i] + text[j:]

def R(a, b, cnt=1):
    global js
    assert js.count(a) == cnt, ('MISS', js.count(a), a[:90])
    js = js.replace(a, b)

# úložiště a nastavení nahradí webová vrstva
js = cut_block(js, 'const Store={db:null,', '\n};\n')
js = cut_block(js, 'function vSet(){', '\n return h\n}\n')
R("function syncLine(){const el=$('#sync');el.textContent=S.mode==='db'?'Sdílené s ostatními trenéry':S.mode==='err'?'Spojení se ztratilo, změny se neuloží':'Uloženo jen v tomto prohlížeči'}",
  "function syncLine(){const el=$('#sync');el.textContent=PARENT?'Pro rodiče':!W.role?'Přihlášení':S.mode==='err'?'Chybí oprávnění: '+Object.keys(W.denied).filter(k=>k!=='photos').map(k=>DEN_NAME[k]||k).join(', '):whoLabel()+(W.online?' · online':' · offline, uloží se po připojení')}")
R("function render(force){\n", "function render(force){\n if(PARENT){renderParentPage();return}\n if(!W.role){renderLogin();return}\n")
R("'Založ tým a přidej děti a trenéry v Nastavení, nebo tam nahraj soubor ze zápisníku.'", "(W.coachId?'Zatím ti nebyl přidělen žádný tým. Požádej správce, aby tě u týmu zaškrtl.':'Týmy zakládá správce ve Scorekeeperu. Jakmile tam budou, objeví se tady.')")
R("'Načítám sestavu…'}</p>${S.ready?'<button class=\"btn\" data-a=\"tab\" data-v=\"set\">Otevřít nastavení</button>':''}", "'Načítám sestavu…'}</p>")
R("Přidej děti v Nastavení.</p>", "Děti přidáš v záložce Tým.</p>", 2)
R("const MENU=[['Trénink',['plan','train','field','hist']],['Tým',['kids']],","const MENU=[['Trénink',['plan','train','field','hist']],['Tým',['team','who','kids']],")
R("['kids','Dovednosti'],","['team','Tým'],['who','Kdo je kdo'],['kids','Dovednosti'],")
R("const v={plan:vPlan,train:vTrain,field:vField,kids:vKids,","const v={plan:vPlan,train:vTrain,field:vField,team:vTeam,who:vWho,kids:vKids,")
boot = "applyTheme(true);syncLine();Store.start();"
R(boot, open(webjs, encoding='utf-8').read() + "\n" + boot)

head = """<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Trénink · Eagles U7</title>
<meta name="description" content="Plánování tréninků baseballu pro děti do 7 let: hry, cviky, skupiny a časovač na hřiště.">
<meta name="theme-color" content="#1F5A36">
<link rel="manifest" href="../manifest.json">
<link rel="icon" href="favicon.ico" sizes="48x48">
<link rel="icon" href="favicon-32x32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<link rel="stylesheet" href="app.css?v=__V__">
</head>
<body>
"""
tail = """
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
<script src="app.js?v=__V__"></script>
<script src="embed.js?v=__V__"></script>
<script>if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('../sw.js').catch(()=>{}));</script>
</body>
</html>
"""
css += "\n.field.winter{border-top:1px solid var(--line);padding-top:12px;margin-top:6px}\nh2.sect{margin:18px 4px 2px;font-size:18px}\nh2.sect .small{font-family:var(--f-body);font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px}\n.partxt{white-space:pre-wrap;background:var(--sunk);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:15px;line-height:1.45}\n.why{margin:6px 0 0;padding-left:18px}\n.why li{margin:3px 0}\n.par-h{display:flex;gap:14px;align-items:center}\n.par-h img{height:56px;width:auto}\n.par-h h2{margin:0}\n.brand small.hver{font-size:11px;margin-top:2px;opacity:.85}\n.ver{text-align:center;margin:4px 0 0}\nlabel.row{flex-wrap:nowrap;align-items:flex-start}\nlabel.row input{flex:0 0 auto;margin-top:3px}\n.stafflist{display:grid;gap:10px}\n.staff{display:grid;gap:6px;border-top:1px solid var(--line);padding-top:10px}\n.who-f{gap:8px;padding-block:12px}\n.who-f h2{font-size:20px}\n.chip.sm{padding:4px 10px;font-size:14px}\n.seg.sm button{padding:4px 11px;font-size:15px}\n.who-h{margin:6px 0 -6px;font-size:20px}\n.who-grid{--ws:104px;display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--ws),1fr));gap:10px 8px}\n.who-grid.s{--ws:78px;gap:8px 6px}\n.who-grid.l{--ws:150px}\n.who{border:0;background:none;padding:0;color:var(--ink);display:grid;gap:4px;min-width:0;text-align:center}\n.who .ph,.who-big{position:relative;display:block;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:var(--sunk);border:1px solid var(--line)}\n.who img,.who-big img{width:100%;height:100%;object-fit:cover;display:block}\n.who .ini,.who-big .ini{display:grid;place-items:center;height:100%;font:700 30px var(--f-disp);color:var(--muted)}\n.who-grid.s .ini{font-size:22px}\n.wn{position:absolute;top:5px;right:5px;background:var(--ink);color:var(--bg);font:700 16px/1 var(--f-disp);padding:4px 6px;border-radius:7px;min-width:24px;text-align:center;font-variant-numeric:tabular-nums;box-shadow:0 1px 3px rgba(0,0,0,.3)}\n.who-grid.s .wn{font-size:13px;padding:3px 5px;min-width:20px;top:3px;right:3px}\n.who-grid.l .wn{font-size:20px}\n.wname{font-weight:700;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.who-grid.s .wname{font-size:12px}\n.who-grid.l .wname{font-size:16px}\n.who-big{width:min(100%,300px);margin:0 auto}\n.who-big .wn{font-size:24px;padding:6px 9px}\n.rrow{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto;gap:8px;align-items:center;border-top:1px solid var(--line);padding-top:8px}\n.rname{min-width:0}\n.rname .aname{font-size:18px}\n@media (max-width:420px){.rrow{grid-template-columns:40px minmax(0,1fr) auto}.rrow>.row{grid-column:2/-1;justify-content:flex-end}}\n.rnum{font:700 20px var(--f-disp);text-align:center;font-variant-numeric:tabular-nums}\n.login{max-width:440px;margin:24px auto 0}\n#w_code{font:700 22px/1.2 var(--f-disp);letter-spacing:.12em;text-transform:uppercase}\n.code{font:700 18px var(--f-disp);letter-spacing:.1em;background:var(--sunk);border-radius:6px;padding:4px 8px}\n.lglist{display:grid;gap:8px}\n.lgrow{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;border-top:1px solid var(--line);padding-top:8px;align-items:start}\n.lgt{font-variant-numeric:tabular-nums;font-size:14px;color:var(--muted);white-space:nowrap}\n.pinrow .code{font-size:16px}\n"
os.makedirs(out, exist_ok=True)
assert body.count('<small id="sync">Načítám data…</small>')==1
body = body.replace('<small id="sync">Načítám data…</small>', '<small id="sync">Připojuji…</small><small class="hver" id="hver"></small>')
import time
V = time.strftime('%Y%m%d%H%M')
head = head.replace('__V__', V); tail = tail.replace('__V__', V)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(head + body.replace('Načítám data…', 'Připojuji…') + tail)
open(os.path.join(out, 'app.css'), 'w', encoding='utf-8').write(css.strip() + '\n')
open(os.path.join(out, 'app.js'), 'w', encoding='utf-8').write(js.strip() + '\n')
print('ok', len(js))
