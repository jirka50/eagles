# Eagles U7

Tréninky a zápasy baseballu U7 v jedné aplikaci. Spojuje **Tréninkový plánovač U7** a **Baseball Scorekeeper**: jedno přihlášení, přepínač **Trénink | Zápas** a společný výběr týmu.

Staré aplikace (repa `scorekeeper` a `Training-App`) zatím běží dál beze změny. Obě generace používají **stejnou databázi Firebase** (projekt eagles-scorekeeper) na stejných místech, takže co se zapíše v jedné, je hned vidět v druhé.

## Struktura
- `index.html`, `shell.js`, `shell.css` – společný rám: přihlášení, horní lišta, přepínač, účet a odhlášení
- `trenink/` – modul Trénink (plánovač). `app.js`, `app.css` a `index.html` se generují ze `trenink/src/`:
  `python3 trenink/src/build_web.py trenink/src/planovac-u7.src.html trenink/src/web.js trenink`
  Úpravy dělej v `trenink/src/` a pak spusť build, jinak je příští build přepíše.
- `zapas/` – modul Zápas (Scorekeeper), `app.js` je přímo zdroj. `dugout.html` je stránka pro tablet v dugoutu (záměrně staré JS kvůli Androidu 4.1, neměnit).
- `trenink/embed.js`, `zapas/embed.js` – napojení modulu na rám (odhlášení, změna týmu). Aktivní jen uvnitř rámu, samostatně otevřený modul se chová jako dřív.
- `manifest.json`, `sw.js`, ikony – jedna instalace na plochu a práce bez signálu pro celou aplikaci
- `database.rules.json` – společná pravidla Firebase (stejná jako ve starých repech; vkládají se do konzole Firebase)

## Role a co kdo vidí
| Kód (`pinmap/<kód>`) | Trénink | Zápas |
|---|---|---|
| správce `{role:'admin'}` | ano | ano |
| zapisovatel `{role:'scorer', team}` | ne | jen svůj tým |
| trenér s osobním kódem `{role:'coach', coach}` | své týmy | jen když mu správce nastavil přístup (`skroles/<id>`) |
| společný kód trenérů `{role:'coach'}` | ano | ne |

Rám kód ověří, zapíše přihlášení pro moduly do jejich klíčů (`sk-auth`, `u7w-auth`) a moduly se načtou až při prvním otevření. Když modulu přestane kód platit nebo správce odebere přístup, rám kód ověří znovu: buď schová jen tu část, nebo odhlásí celou aplikaci.

## Odkazy pro rodiče
- živé skóre: `…/eagles/zapas/?tym=<id týmu>` (nebo `…/eagles/?tym=<id>`, přesměruje se)
- tréninky: `…/eagles/trenink/?rodice=<id týmu>` (nebo `…/eagles/?rodice=<id>`)
- tablet v dugoutu: `…/eagles/zapas/dugout.html?tym=<id>`

Staré odkazy na `scorekeeper` a `Training-App` fungují dál, dokud se staré aplikace nevypnou.

## Zprovoznění
1. Nahraj soubory do repa `jirka50/eagles`.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Otevři `https://jirka50.github.io/eagles/` a přihlas se svým kódem. Pravidla Firebase se nemění.

## Verze
`APP_VERSION` je v `shell.js`, `zapas/app.js` a `trenink/src/web.js` (stejné číslo ve všech třech). Číslo verze se mění jen po odsouhlasení správcem – před změnou se zeptat. Při každém vydání se ale zvyšuje název mezipaměti v `sw.js` (`eg-vN`), aby telefony načetly novou verzi.

## Přechodné období
Staré aplikace jsou zmrazené: jen opravy chyb, nové funkce se dělají tady. Struktura dat se nemění; nové věci patří do nových cest ve Firebase, aby staré aplikace dál fungovaly. Pravidla databáze se smí jen rozšiřovat.
