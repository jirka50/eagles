/* Eagles U7 · společná aplikace pro Trénink a Zápas.
   Jedno přihlášení, přepínač Trénink | Zápas a společný výběr týmu.
   Oba moduly běží beze změny dat ve složkách trenink/ a zapas/ a načítají se až při prvním otevření.
   Data ve Firebase zůstávají na stejných místech jako ve starém Scorekeeperu a plánovači.

   Kdo co vidí (podle pinmap/<kód>):
   - správce (role admin)                → Trénink i Zápas
   - zapisovatel (role scorer, team)     → jen Zápas, svůj tým
   - trenér s osobním kódem (coach+id)   → Trénink; Zápas jen když mu správce nastavil skroles/<id>
   - společný kód trenérů (coach bez id) → jen Trénink
   Moduly si přihlášení čtou z vlastních klíčů v localStorage (sk-auth, u7w-auth), sem se zapisují při přihlášení. */
const APP_VERSION='2.0',APP_DATE='2026-10-26';
const FB_CONFIG={apiKey:"AIzaSyDqwd6A6eaeHlczoLhGvaxQlzdp9od-0Pg",authDomain:"eagles-scorekeeper.firebaseapp.com",databaseURL:"https://eagles-scorekeeper-default-rtdb.europe-west1.firebasedatabase.app",projectId:"eagles-scorekeeper",storageBucket:"eagles-scorekeeper.firebasestorage.app",messagingSenderId:"691498301504",appId:"1:691498301504:web:ec05dfb8a51095ec1e87a5"};
const MODS=[['trenink','Trénink'],['zapas','Zápas']];
const K={auth:'eg-auth',tab:'eg-tab',team:'eg-team'};
const ls={get(k,d){try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const $=id=>document.getElementById(id);
const normCode=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^(.{4})(.+)$/,'$1-$2');
const A={auth:ls.get(K.auth,null),tab:ls.get(K.tab,'trenink'),team:ls.get(K.team,null),frames:{},ready:{},outs:{},fb:null,uid:null,busy:false};

/* ---------- Firebase: vlastní pojmenovaná aplikace, nepřepisuje přihlášení modulů ---------- */
function fb(){if(A.fb)return A.fb;if(typeof firebase==='undefined')return null;
  try{const app=firebase.apps.find(a=>a.name==='eagles')||firebase.initializeApp(FB_CONFIG,'eagles');A.fb={db:app.database(),auth:app.auth()}}catch(e){A.fb=null}return A.fb}
async function signIn(){const f=fb();if(!f||!navigator.onLine)throw{code:'offline'};if(f.auth.currentUser)return f.auth.currentUser.uid;
  const u=await new Promise(res=>{const off=f.auth.onAuthStateChanged(x=>{off();res(x)})});if(u)return u.uid;return (await f.auth.signInAnonymously()).user.uid}
const isPerm=e=>String(e&&(e.code||e.message)).toLowerCase().includes('permission');
/* ověří kód a zjistí, které části aplikace může uživatel otevřít */
async function check(code){const uid=await signIn();A.uid=uid;const db=A.fb.db;
  await db.ref('claims/'+uid).set(code);
  const p=(await db.ref('pinmap/'+code).once('value')).val();if(!p||!p.role)throw{code:'bad'};
  const a={code,role:p.role,team:p.team||null,coach:p.coach||null,teams:[],cw:false,mods:{trenink:false,zapas:false}};
  if(p.role==='admin'){a.mods.trenink=a.mods.zapas=true}
  else if(p.role==='scorer'){if(!p.team)throw{code:'bad'};a.mods.zapas=true}
  else if(p.role==='coach'){a.mods.trenink=true;
    if(p.coach){let r=null;try{r=(await db.ref('skroles/'+p.coach).once('value')).val()}catch(e){}
      a.teams=r&&r.teams?Object.keys(r.teams).filter(t=>r.teams[t]===true):[];a.cw=!!(r&&r.w);a.mods.zapas=a.teams.length>0}}
  else throw{code:'bad'};
  return a}
/* přihlášení pro moduly: stejné klíče a tvar, jaký si ukládají samy */
function moduleAuth(a){
  if(a.mods.zapas)ls.set('sk-auth',{code:a.code,role:a.role,team:a.team,coach:a.coach,teams:a.teams,cw:a.cw});else ls.del('sk-auth');
  if(a.mods.trenink)ls.set('u7w-auth',{code:a.code,role:a.role,coach:a.coach||''});else ['u7w-auth','u7w-me','u7w-prefts'].forEach(ls.del)}
const sameAccess=(x,y)=>x&&y&&x.code===y.code&&x.role===y.role&&x.mods.trenink===y.mods.trenink&&x.mods.zapas===y.mods.zapas&&x.cw===y.cw&&JSON.stringify(x.teams)===JSON.stringify(y.teams);

/* ---------- přihlášení ---------- */
function showLogin(msg){$('bar').hidden=true;$('frames').hidden=true;$('note').hidden=true;$('login').hidden=false;
  const m=$('lmsg');m.textContent=msg||'';m.hidden=!msg;$('go').disabled=A.busy;$('go').textContent=A.busy?'Ověřuji…':'Přihlásit';
  if(!A.busy)setTimeout(()=>{try{$('code').focus()}catch(e){}},50)}
async function doLogin(){if(A.busy)return;const code=normCode($('code').value);
  if(code.replace('-','').length<8)return showLogin('Zadej celý kód.');
  A.busy=true;showLogin('');
  try{const a=await check(code);A.busy=false;$('code').value='';start(a)}
  catch(e){A.busy=false;
    showLogin(e&&e.code==='offline'?'Bez internetu se nejde přihlásit. Připoj se a zkus to znovu.':'Neplatný kód. Zkontroluj ho a zkus to znovu.');
    try{if(A.uid)A.fb.db.ref('claims/'+A.uid).remove()}catch(x){}}}
function start(a){const first=!A.auth||A.auth.code!==a.code;A.auth=a;ls.set(K.auth,a);moduleAuth(a);
  if(first){Object.keys(A.frames).forEach(dropFrame);A.outs={}}
  const av=avail();if(!av.includes(A.tab))A.tab=av[0];showApp()}
function logout(msg){
  Object.keys(A.frames).forEach(m=>{try{const w=A.frames[m].contentWindow;if(w&&w.egClear)w.egClear()}catch(e){}dropFrame(m)});
  try{if(A.fb&&A.uid)A.fb.db.ref('claims/'+A.uid).remove()}catch(e){}
  [K.auth,'sk-auth','u7w-auth','u7w-me','u7w-prefts'].forEach(ls.del);A.auth=null;A.outs={};closePop();showLogin(msg||'')}

/* ---------- aplikace ---------- */
const avail=()=>A.auth?MODS.map(m=>m[0]).filter(m=>A.auth.mods[m]):[];
function whoText(){const a=A.auth;if(!a)return'';if(a.role==='admin')return'Správce';if(a.role==='scorer')return'Zapisovatel';
  if(!a.coach)return'Trenér · společný kód';const me=ls.get('u7w-me',null);return (me&&me.name?me.name:'Trenér')}
function showApp(){$('login').hidden=true;$('bar').hidden=false;$('frames').hidden=false;
  const av=avail();
  $('seg').innerHTML=av.length>1?MODS.filter(m=>av.includes(m[0])).map(([k,l])=>`<button data-m="${k}" class="${k===A.tab?'on':''}" aria-pressed="${k===A.tab}">${l}</button>`).join('')
    :`<span class="one">${MODS.find(m=>m[0]===av[0])[1]}</span>`;
  $('who').textContent=whoText();$('pwho').textContent='Přihlášen: '+whoText()+' · kód '+A.auth.code.slice(0,4)+'-••••';
  $('pver').textContent='Eagles U7 · verze '+APP_VERSION+' ('+new Date(APP_DATE).toLocaleDateString('cs-CZ')+')';
  show(A.tab)}
function show(m){if(!avail().includes(m))return;A.tab=m;ls.set(K.tab,m);
  document.querySelectorAll('#seg button').forEach(b=>{const on=b.dataset.m===m;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});
  if(!A.frames[m])makeFrame(m);
  Object.keys(A.frames).forEach(k=>{A.frames[k].hidden=k!==m});
  pushTeam(m)}
function makeFrame(m){
  /* společný tým předvyplnit dřív, než modul nastartuje */
  if(A.team){if(m==='zapas')ls.set('tball-team-cur',A.team);else ls.set('u7-team',A.team)}
  const f=document.createElement('iframe');f.src=m+'/';f.title=m==='zapas'?'Zápas':'Trénink';f.dataset.m=m;
  f.setAttribute('allow','screen-wake-lock; fullscreen; clipboard-read; clipboard-write; web-share; geolocation; autoplay');
  $('frames').appendChild(f);A.frames[m]=f;A.ready[m]=false}
function dropFrame(m){const f=A.frames[m];if(f)f.remove();delete A.frames[m];delete A.ready[m]}
function pushTeam(m){if(!A.team||!A.ready[m])return;try{const w=A.frames[m].contentWindow;if(w.egSetTeam)w.egSetTeam(A.team)}catch(e){}}
function note(msg){const n=$('note');if(!msg){n.hidden=true;return}n.textContent=msg;n.hidden=false;clearTimeout(note.t);note.t=setTimeout(()=>{n.hidden=true},9000)}

/* ---------- rozhraní pro moduly (volají ho z embed.js) ---------- */
window.EGL={
  ready(m){A.ready[m]=true;pushTeam(m)},
  team(m,tid){if(!tid||tid===A.team)return;A.team=tid;ls.set(K.team,tid);
    Object.keys(A.frames).forEach(k=>{if(k!==m)pushTeam(k)})},
  /* modul se odhlásil: bez zprávy = tlačítko Odhlásit, se zprávou = kód nebo přístup se změnil */
  async out(m,msg){if(!A.auth)return;if(!msg)return logout('');
    let a;try{a=await check(A.auth.code)}
    catch(e){if(e&&e.code==='offline'){note(msg);return}return logout('Kód už neplatí. Přihlas se znovu.')}
    A.outs[m]=(A.outs[m]||0)+1;
    if(a.mods[m]&&A.outs[m]<2){A.auth=a;ls.set(K.auth,a);moduleAuth(a);dropFrame(m);if(A.tab===m)show(m);return}
    if(a.mods[m]){a.mods[m]=false}
    A.auth=a;ls.set(K.auth,a);moduleAuth(a);dropFrame(m);
    if(!avail().length)return logout(msg);
    note(msg);if(A.tab===m)A.tab=avail()[0];showApp()}
};

/* ---------- ovládání ---------- */
function closePop(){$('pop').hidden=true;$('acct').setAttribute('aria-expanded','false')}
$('go').addEventListener('click',doLogin);
$('code').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
$('seg').addEventListener('click',e=>{const b=e.target.closest('button[data-m]');if(b)show(b.dataset.m)});
$('acct').addEventListener('click',e=>{e.stopPropagation();const p=$('pop');p.hidden=!p.hidden;$('acct').setAttribute('aria-expanded',String(!p.hidden));if(!p.hidden)$('who').textContent=whoText()});
document.addEventListener('click',e=>{if(!$('pop').hidden&&!e.target.closest('#pop'))closePop()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePop()});
$('logout').addEventListener('click',()=>logout(''));
$('note').addEventListener('click',()=>note(''));

/* ---------- start: z paměti telefonu hned, ověření kódu na pozadí ---------- */
(function boot(){
  if(!A.auth||!A.auth.code||!A.auth.mods){A.auth=null;return showLogin('')}
  moduleAuth(A.auth);if(!avail().includes(A.tab))A.tab=avail()[0];showApp();
  check(A.auth.code).then(a=>{if(sameAccess(a,A.auth))return;
    const was=A.auth.mods;A.auth=a;ls.set(K.auth,a);moduleAuth(a);
    MODS.forEach(([m])=>{if(was[m]!==a.mods[m]||m==='zapas')dropFrame(m)});
    if(!avail().length)return logout('Správce ti odebral přístup.');
    if(!avail().includes(A.tab))A.tab=avail()[0];showApp()})
  .catch(e=>{if(e&&e.code==='offline')return;if(e&&e.code==='bad'||isPerm(e))logout('Kód už neplatí. Přihlas se znovu.')})})();
