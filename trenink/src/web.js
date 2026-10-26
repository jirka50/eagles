/* Verze aplikace: při každém vydání zvýšit APP_VERSION a datum (stejně jako ve Scorekeeperu). */
const APP_VERSION='2.0',APP_DATE='2026-10-26';
const verTxt=()=>'verze '+APP_VERSION;
const DEN_NAME={teamlist:'seznam týmů',teams:'soupisky',training:'tréninková data',photos:'fotky'};
const deniedKey=p=>p.split('/')[0];
try{const hv=document.getElementById('hver');if(hv)hv.textContent=verTxt()}catch(e){}
/* =================================================================================
   WEBOVÁ VERZE · Firebase Realtime Database sdílená se Scorekeeperem
   Role: správce (kód správce ze Scorekeeperu) · trenér (osobní kód pinmap/<kód>={role:'coach',coach:<id ze staff>},
         vidí jen své týmy; nebo společný kód bez pole coach, vidí všechny týmy)
   Historie přihlášení: logins/<pushId> = {t,uid,role,coach,code(4 znaky),dev,kind} · čte jen správce
   Čte:  teamlist/<tid> · teams/<tid>/roster  (spravuje Scorekeeper)
   Píše: training/staff (trenéři a jejich týmy) · training/kids/<tid> · training/{plans,custom,tpls}/<id>
   Obsah ukládáme jako JSON text {ts,json}, aby se zachovaly prázdné hodnoty a pole.
   ================================================================================= */
const FB_CONFIG={apiKey:"AIzaSyDqwd6A6eaeHlczoLhGvaxQlzdp9od-0Pg",authDomain:"eagles-scorekeeper.firebaseapp.com",databaseURL:"https://eagles-scorekeeper-default-rtdb.europe-west1.firebasedatabase.app",projectId:"eagles-scorekeeper",storageBucket:"eagles-scorekeeper.firebasestorage.app",messagingSenderId:"691498301504",appId:"1:691498301504:web:ec05dfb8a51095ec1e87a5"};
const WKEY='u7w-auth',CODE_ABC='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',COLS=['plans','custom','tpls','ages'];
const W={coachId:null,logins:null,lgFilter:'',lgMore:false,lgErr:'',pdel:null,sdel:null,phMsg:'',phDel:null,assign:null,rmove:null,rNoNum:false,rmsg:'',role:null,code:null,uid:null,online:false,msg:'',busy:false,pins:null,pinMsg:'',imp:null,impMsg:'',fb:null,subs:[],denied:{},pub:{},seen:{},loaded:{},raw:{teamlist:{},roster:{},coaches:{},kids:{},photos:{},staff:null}};
const J=v=>JSON.stringify(v);
const PJ=v=>{try{return v&&typeof v.json==='string'?JSON.parse(v.json):null}catch(e){return null}};
const normCode=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/^(.{4})(.+)$/,'$1-$2');
function genCode(){let c='';const r=crypto.getRandomValues(new Uint32Array(8));for(let i=0;i<8;i++)c+=CODE_ABC[r[i]%CODE_ABC.length];return c.slice(0,4)+'-'+c.slice(4)}
const baseUrl=()=>location.origin+location.pathname;
const isPerm=e=>/permission/i.test(String(e&&(e.code||e.message)));
const ROLE_NAME={admin:'Správce',coach:'Trenér'};
/* ---------- profil trenéra ---------- */
const ME_KEY='u7w-me',PREF_SYNC=['theme','wake','voice','vrate','wx'];
function meEntry(){if(!W.coachId)return null;if(Array.isArray(W.raw.staff))return W.raw.staff.find(c=>c.id===W.coachId)||null;return ls.get(ME_KEY,null)}
function whoLabel(){if(W.role==='admin')return 'Správce';if(W.coachId){const m=meEntry();return (m&&m.name?m.name:'Trenér')+' · trenér'}return 'Trenér · společný kód'}
/* trenér s osobním kódem vidí jen týmy, u kterých ho správce zaškrtl */
function myTeamFilter(out){if(!W.coachId||W.role==='admin')return out;const m=meEntry(),ok=new Set(m&&m.teams||[]),r={};Object.keys(out).forEach(t=>{if(ok.has(t))r[t]=out[t]});return r}
ME=()=>W.coachId||'';byName=id=>{const c=staffList().find(x=>x.id===id);return c?c.name:''};
prefHook=()=>{if(!W.coachId||!W.fb||W.role==='admin')return;const o={};PREF_SYNC.forEach(k=>{if(S.pref[k]!==undefined)o[k]=S.pref[k]});const ts=Date.now();ls.set('u7w-prefts',ts);Web.write('training/prefs/'+W.coachId,{ts,json:J(o)})};
/* ---------- historie přihlášení ---------- */
function devLabel(){const u=navigator.userAgent||'';
 const os=/iPhone/.test(u)?'iPhone':/iPad/.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1)?'iPad':/Android/.test(u)?'Android':/Windows/.test(u)?'Windows':/Mac OS X|Macintosh/.test(u)?'Mac':/Linux/.test(u)?'Linux':'jiné zařízení';
 const br=/Edg\//.test(u)?'Edge':/SamsungBrowser/.test(u)?'Samsung Internet':/Firefox|FxiOS/.test(u)?'Firefox':/CriOS|Chrome/.test(u)?'Chrome':/Safari/.test(u)?'Safari':'';
 let pwa='';try{if((window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone)pwa=' · z plochy'}catch(e){}
 return (os+(br?', '+br:'')+pwa).slice(0,78)}
function logLogin(kind){if(!W.fb||!W.uid||!W.role)return;const k='u7w-lastlog';if(kind==='open'&&Date.now()-(+ls.get(k,0)||0)<6*3600e3)return;ls.set(k,Date.now());
 W.fb.db.ref('logins').push({t:firebase.database.ServerValue.TIMESTAMP,uid:W.uid,role:W.role,coach:W.coachId||'',code:(W.code||'').slice(0,4),dev:devLabel(),kind}).catch(()=>{})}
const lgKey=x=>x.role==='admin'?'admin':x.coach||'shared';
const lgWho=x=>x.role==='admin'?'Správce':x.coach?(byName(x.coach)||'odebraný trenér'):'Společný kód';
const lgTime=t=>t?new Date(t).toLocaleString('cs-CZ',{day:'numeric',month:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}):'–';
function lastSeen(id){const x=(W.logins||[]).find(l=>l.coach===id);return x?lgTime(x.t):''}
async function loadLogins(){if(!W.fb||W.role!=='admin')return;W.lgErr='';
 try{const v=(await W.fb.db.ref('logins').orderByKey().limitToLast(300).once('value')).val()||{};W.logins=Object.entries(v).map(([id,x])=>Object.assign({id},x)).sort((a,b)=>(b.t||0)-(a.t||0))}
 catch(e){W.logins=[];W.lgErr=isPerm(e)?'Historii zatím nejde načíst: ve Firebase je potřeba vložit nová pravidla (database.rules.json).':'Historii se nepodařilo načíst.'}
 /* úklid: záznamy starší než rok */
 W.fb.db.ref('logins').orderByChild('t').endAt(Date.now()-365*864e5).limitToFirst(200).once('value').then(s=>{const u={};s.forEach(c=>{u[c.key]=null});if(Object.keys(u).length)return W.fb.db.ref('logins').update(u)}).catch(()=>{});
 if(S.tab==='set')render(true)}
function vLogins(){if(W.logins===null){W.logins=undefined;loadLogins()}
 const L=W.logins||[],f=W.lgFilter,list=L.filter(x=>!f||lgKey(x)===f),show=list.slice(0,W.lgMore?300:15);
 const opts=[['','Všichni'],['admin','Správce'],['shared','Společný kód']].concat(staffList().map(c=>[c.id,c.name]));
 return `<section class="card"><div class="sumline"><h2>Historie přihlášení</h2><button class="btn ghost sm" data-a="lgload">Obnovit</button></div>
  <p class="small muted">Kdo se kdy přihlásil kódem nebo otevřel aplikaci (otevření se zapíše nejvýš jednou za 6 hodin na zařízení). Vidí jen správce, záznamy starší než rok se mažou.</p>
  ${W.lgErr?`<p class="warnnote">${esc(W.lgErr)}</p>`:''}
  ${W.logins===undefined?'<p class="small muted">Načítám…</p>':`<div class="field"><span class="label">Kdo</span><select id="lg_f" data-c="lgf">${opts.map(([v,l])=>`<option value="${esc(v)}" ${f===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
  ${list.length?`<div class="lglist">${show.map(x=>`<div class="lgrow"><span class="lgt">${lgTime(x.t)}</span><span><b>${esc(lgWho(x))}</b> · ${x.kind==='login'?'přihlášení kódem':'otevření aplikace'}<br><span class="small muted">${esc(x.dev||'')}${x.code?' · kód '+esc(x.code)+'-••••':''}</span></span></div>`).join('')}</div>
  ${list.length>show.length?`<div class="row"><button class="btn ghost sm" data-a="lgmore">Zobrazit další (${list.length-show.length})</button></div>`:''}`:'<p class="small">Zatím žádný záznam.</p>'}`}</section>`}
document.addEventListener('change',e=>{if(e.target.dataset&&e.target.dataset.c==='lgf'){W.lgFilter=e.target.value;W.lgMore=false;render(true)}});

/* ---------- připojení ---------- */
function fbInit(){if(W.fb)return W.fb;if(typeof firebase==='undefined'){W.msg='Nepodařilo se načíst připojení. Zkontroluj internet a obnov stránku.';return null}
 try{/* vlastní pojmenovaná aplikace = vlastní anonymní přihlášení, nepřepíše přihlášení Scorekeeperu na stejné adrese */
  const app=firebase.apps.find(a=>a.name==='planovac')||firebase.initializeApp(FB_CONFIG,'planovac');
  W.fb={db:app.database(),auth:app.auth()};
  W.fb.db.ref('.info/connected').on('value',s=>{W.online=!!s.val();syncLine()})}
 catch(e){W.msg='Připojení se nepodařilo spustit.';W.fb=null}return W.fb}
async function signIn(){const f=fbInit();if(!f)throw{code:'offline'};if(f.auth.currentUser)return f.auth.currentUser.uid;
 const u=await new Promise(res=>{const off=f.auth.onAuthStateChanged(x=>{off();res(x)})});if(u)return u.uid;const c=await f.auth.signInAnonymously();return c.user.uid}
async function claim(code){const uid=await signIn();W.uid=uid;await W.fb.db.ref('claims/'+uid).set(code);
 const p=(await W.fb.db.ref('pinmap/'+code).once('value')).val();if(!p||!p.role)throw{code:'bad'};if(p.role==='scorer')throw{code:'scorer'};if(!ROLE_NAME[p.role])throw{code:'bad'};return p}

/* ---------- úložiště (stejné rozhraní jako verze v Claude) ---------- */
const Store={db:null,
 async start(){Web.boot()},
 async put(col,id,data){
  if(col==='teams')return Web.putTeam(id,data);
  if(col==='plans'){data=Object.assign({},data);data.by=S.plans[id]?(S.plans[id].by||data.by||''):(W.coachId||'')}
  S[col]=Object.assign({},S[col],{[id]:data});ls.set('u7w-'+col,S[col]);if(col==='custom')rebuildActs();render();
  Web.write('training/'+col+'/'+id,{ts:Date.now(),json:J(data)})},
 async del(col,id){
  if(col==='teams'){toast('Týmy spravuje Scorekeeper.');return}
  const m=Object.assign({},S[col]);delete m[id];S[col]=m;ls.set('u7w-'+col,m);if(col==='custom')rebuildActs();render();
  Web.write('training/'+col+'/'+id,null)}
};
const Web={
 boot(){
  if(PARENT){parentBoot();return}
  W.raw.photos=ls.get('u7w-photos',{})||{};S.season=ls.get('u7w-season',{})||{};
  ['teams','plans','custom','tpls','ages'].forEach(c=>S[c]=ls.get('u7w-'+c,{}));rebuildActs();fixTeam();
  const a=ls.get(WKEY,null);if(a&&a.role&&a.code){W.role=a.role;W.code=a.code;W.coachId=a.coach||null}
  S.teams=myTeamFilter(S.teams);fixTeam();
  render();syncLine();
  const f=fbInit();if(!f){render();return}
  (async()=>{
   if(!W.code){try{await signIn()}catch(e){}render();return}
   try{const p=await claim(W.code),cid=p.coach||null;if(p.role!==W.role||cid!==W.coachId){W.role=p.role;W.coachId=cid;ls.set(WKEY,{code:W.code,role:p.role,coach:cid||''});S.teams=myTeamFilter(S.teams);fixTeam()}Web.subscribe();logLogin('open');render()}
   catch(e){if(e&&e.code==='offline')return;if(isPerm(e)||e.code==='bad'||e.code==='scorer')Web.logout('Kód už neplatí. Přihlas se znovu.')}
  })()},
 write(path,val){if(!W.fb){toast('Bez připojení se nic neuloží.');return}
  const r=W.fb.db.ref(path),p=val===null?r.remove():r.set(val);
  p.catch(e=>{toast(isPerm(e)?'Na tuhle změnu nemáš oprávnění.':'Uložení se nepovedlo. Zkus to znovu.')})},
 putTeam(tid,t){const kids={};(t.players||[]).forEach(p=>{if(p.lvl||p.ag||(p.sk&&p.sk.length))kids[p.num]={lvl:p.lvl||'',sk:p.sk||[],name:p.name||'',ag:p.ag||''}});
  W.raw.kids[tid]=kids;Web.compose();render();Web.write('training/kids/'+tid,{ts:Date.now(),json:J(kids)})},
 compose(){const tl=W.raw.teamlist||{},out={};
  Object.keys(tl).forEach(tid=>{const R=W.raw.roster[tid]||{},kids=W.raw.kids[tid]||{},kv=Object.values(kids);
   out[tid]={name:R.name||(tl[tid]&&tl[tid].name)||'Tým',coaches:Array.isArray(W.raw.staff)?W.raw.staff.filter(c=>(c.teams||[]).includes(tid)).map(c=>({id:c.id,name:c.name})):(W.raw.coaches[tid]||[]),
    players:(Array.isArray(R.players)?R.players:[]).filter(p=>p&&p.num!=null).map(p=>{const num=String(p.num),k=kids[num]||kv.find(x=>x.name&&x.name===p.name)||{};return{num,name:p.name||'',nick:p.nick||'',lvl:k.lvl||'',ag:k.ag||'',sk:Array.isArray(k.sk)?k.sk:[]}})}});
  S.teams=myTeamFilter(out);ls.set('u7w-teams',S.teams);fixTeam()},
 on(path,cb){const r=W.fb.db.ref(path);const h=r.on('value',cb,e=>{if(!isPerm(e))return;const k=deniedKey(path);W.denied[k]=1;console.warn('Firebase: chybí oprávnění ke čtení',path);if(k!=='photos')S.mode='err';syncLine();render()});W.subs.push(()=>r.off('value',h))},
 subscribe(){if(W.subs.length)return;S.mode='web';syncLine();
  Web.on('teamlist',s=>{W.raw.teamlist=s.val()||{};W.loaded.tl=1;Object.keys(W.raw.teamlist).forEach(tid=>{if(W.seen[tid])return;W.seen[tid]=1;
   Web.on('teams/'+tid+'/roster',x=>{W.raw.roster[tid]=PJ(x.val())||{};W.loaded['r_'+tid]=1;migratePhotos(tid);kidsCarry();Web.compose();render()});
   Web.on('training/coaches/'+tid,x=>{W.raw.coaches[tid]=PJ(x.val())||[];W.loaded['c_'+tid]=1;staffMigrate();Web.compose();render()});
   Web.on('public/'+tid+'/training',x=>{W.pub[tid]=x.val()||{};if(S.tab==='train')render()});
   Web.on('training/kids/'+tid,x=>{W.raw.kids[tid]=PJ(x.val())||{};W.loaded['k_'+tid]=1;kidsCarry();Web.compose();render()});
   Web.on('photos/'+tid,x=>{W.raw.photos[tid]=x.val()||{};W.loaded['p_'+tid]=1;phCache();migratePhotos(tid);if(S.tab==='who'||!$('#sheet').hidden)render()})});
   Web.compose();Web.ready();render()});
  Web.on('training/season',x=>{S.season=PJ(x.val())||{};ls.set('u7w-season',S.season);render()});
  Web.on('training/staff',x=>{const v=PJ(x.val());W.raw.staff=Array.isArray(v)?v:null;W.loaded.staff=1;
   if(W.coachId&&W.raw.staff){const m=W.raw.staff.find(c=>c.id===W.coachId);ls.set(ME_KEY,m||{id:W.coachId,name:'',teams:[]})}
   staffMigrate();Web.compose();syncLine();render()});
  if(W.coachId&&W.role!=='admin')Web.on('training/prefs/'+W.coachId,x=>{const v=x.val();if(!v||!(v.ts>(+ls.get('u7w-prefts',0)||0)))return;const o=PJ(v)||{};
   PREF_SYNC.forEach(k=>{if(k in o)S.pref[k]=o[k]});ls.set('u7-pref',S.pref);ls.set('u7w-prefts',v.ts);applyTheme();render()});
  COLS.forEach(col=>Web.on('training/'+col,s=>{const v=s.val()||{},m={};Object.keys(v).forEach(id=>{const d=PJ(v[id]);if(d)m[id]=d});S[col]=m;ls.set('u7w-'+col,m);W.loaded[col]=1;if(col==='custom')rebuildActs();Web.ready();render()}))},
 ready(){if(W.loaded.tl&&COLS.every(c=>W.loaded[c]))S.ready=true},
 logout(msg){try{if(W.fb&&W.uid)W.fb.db.ref('claims/'+W.uid).remove()}catch(e){}
  W.subs.forEach(off=>{try{off()}catch(e){}});W.subs=[];W.denied={};W.seen={};W.loaded={};W.pins=null;
  try{[WKEY,ME_KEY,'u7w-prefts'].forEach(k=>localStorage.removeItem(k))}catch(e){}W.role=null;W.code=null;W.coachId=null;W.logins=null;W.lgFilter='';W.msg=msg||'';S.ready=false;S.mode='local';render()}
};

/* ---------- přihlášení ---------- */
/* ---------- Stránka pro rodiče: public/<tým>/training/<id> = {ts,json}; čte kdokoli, zapisuje správce a trenér ---------- */
const PARENT=(()=>{try{return new URLSearchParams(location.search).get('rodice')||''}catch(e){return''}})();
const parentUrl=tid=>location.origin+location.pathname+'?rodice='+encodeURIComponent(tid);
const WHY={warm:'Zahřáté tělo se méně zraní a děti se hravou formou naladí na trénink.',
 hazeni:'Správná technika hodu chrání rameno a loket a je základem hry v poli – kdo umí hodit přesně, pomůže týmu zastavit běžce.',
 chytani:'Chytání dává dětem jistotu a odvahu – kdo se nebojí míče, užije si hru v poli a zabrání soupeři v bězích.',
 odpal:'Odpal je pro děti nejvíc zábavný; správný postoj a švih vedou k úspěchu a bezpečné zacházení s pálkou chrání ostatní.',
 mety:'Běh po metách je srdce baseballu – děti se učí pravidla hry, rychlé starty a orientaci na hřišti.',
 hra:'Hry učí poslouchat trenéra, spolupracovat a chápat, co se na hřišti právě děje.'};
const pDev=a=>{const d=String(a.dev||'').trim();return d?d.charAt(0).toUpperCase()+d.slice(1):''};
function pubData(p,noDom){const items=[...new Set(p.blocks.flatMap(b=>b.items))].map(id=>ACT[id]).filter(a=>a&&a.k!=='routine');const f=(p.focus||[])[0]||(items[0]||{}).c||'hazeni';
 const seq=items.filter(a=>a.k==='seq'&&a.c!=='warm'&&a.steps),w=p.week&&SEASON[p.week-1],nt=noDom?null:$('#parNote'),hw=noDom?null:$('#parHw');
 return{date:p.date,title:planTitle(p),teams:planTeams(p).map(tName),focus:(p.focus||[]).map(x=>CATS[x]),week:w?{n:p.week,name:w.n}:null,season:p.season||SEA().name||'',
  items:items.map(a=>({n:a.n,dev:pDev(a)})),whys:[...new Set(items.map(a=>WHY[a.c]?a.c:'hra'))].map(c=>({c:CATS[c]||'',t:WHY[c]})),learn:seq.map(a=>({n:a.n,steps:a.steps.map(x=>x.n)})),hw:hw?hw.value.trim():(HOME[f]||HOME.hazeni),note:nt?nt.value.trim():''}}
const PUBT={};
const pubOn=p=>Object.keys(S.teams).filter(t=>W.pub[t]&&W.pub[t][p.id]);
const pubSel=p=>PUBT[p.id]||[...new Set(planTeams(p).filter(t=>S.teams[t]).concat(pubOn(p)))];
async function pubPlan(){const p=S.plan;if(!p)return;const sel=pubSel(p);if(!sel.length){toast('Vyber aspoň jeden tým.');return}if(!S.plans[p.id]){toast('Nejdřív trénink ulož do historie.');return}
 const d=pubData(p),ts=Date.now();try{for(const tid of pubOn(p).filter(t=>!sel.includes(t)))await W.fb.db.ref('public/'+tid+'/training/'+p.id).remove();
  for(const tid of sel){await W.fb.db.ref('public/'+tid+'/training/'+p.id).set({ts,json:J(d)});
   const all=Object.entries(W.pub[tid]||{}).map(([id,v])=>[id,(PJ(v)||{}).date||'']).concat([[p.id,d.date]]);const keep=new Set(all.sort((a,b)=>b[1].localeCompare(a[1])).slice(0,12).map(x=>x[0]));
   all.forEach(([id])=>{if(!keep.has(id))W.fb.db.ref('public/'+tid+'/training/'+id).remove().catch(()=>{})})}
  toast(sel.length>1?'Zveřejněno pro '+sel.length+' týmy.':'Zveřejněno na stránce pro rodiče.')}catch(e){toast(isPerm(e)?'Zápis odmítnut: ve Firebase je potřeba nahrát nová pravidla (database.rules.json).':'Zveřejnění se nepovedlo. Zkus to znovu.')}}
async function unpubPlan(){const p=S.plan;if(!p)return;try{for(const tid of pubOn(p))await W.fb.db.ref('public/'+tid+'/training/'+p.id).remove();delete PUBT[p.id];toast('Staženo ze stránky pro rodiče.')}catch(e){toast('Nepovedlo se.')}}
parentsPub=()=>{const p=S.plan;if(!p)return'';const f=(p.focus||[])[0]||'hazeni',sel=pubSel(p),on=pubOn(p),pv=on.length?W.pub[on[0]][p.id]:null,pd=pv?PJ(pv):null,all=Object.keys(S.teams).sort((a,b)=>tName(a).localeCompare(tName(b),'cs'));
 return `<div class="field" style="margin-top:12px"><span class="label">Stránka pro rodiče</span>
  <p class="small muted">Veřejná stránka týmu se seznamem posledních tréninků (bez jmen a fotek dětí). Odkaz pošli rodičům jednou, nové tréninky se tam objeví samy.</p>
  <div class="field"><span class="label">Na doma</span><input type="text" id="parHw" value="${esc(pd&&pd.hw||HOME[f]||HOME.hazeni)}"></div>
  <div class="field"><span class="label">Vzkaz rodičům (nepovinný)</span><input type="text" id="parNote" value="${esc(pd&&pd.note||'')}" placeholder="např. Příště s sebou lahev s pitím"></div>
  ${all.length>1?`<div class="field"><span class="label">Zveřejnit pro týmy</span><div class="row" style="gap:6px">${all.map(t=>{const s=sel.includes(t);return `<button class="chip ${s?'on':''}" data-a="pubt" data-v="${esc(t)}" aria-pressed="${s}">${esc(tName(t))}${on.includes(t)?' ✓':''}</button>`}).join('')}</div><span class="small muted">Stejný trénink se objeví na stránce každého vybraného týmu. ✓ = už zveřejněno.</span></div>`:''}
  <div class="row"><button class="btn sm" data-a="pubgo">${pv?'Aktualizovat na stránce':'Zveřejnit pro rodiče'}</button>${pv?'<button class="btn ghost sm" data-a="pubdel">Stáhnout</button>':''}</div>
  ${pv?`<p class="small">✓ Zveřejněno ${new Date(pv.ts).toLocaleString('cs-CZ',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'})}${on.length>1?' pro '+on.map(t=>esc(tName(t))).join(', '):''}</p>`:''}
  ${sel.map(t=>`<div class="row"><span class="small">Odkaz ${esc(tName(t))}:</span><button class="btn ghost sm" data-a="wcopy" data-v="${esc(parentUrl(t))}">Kopírovat odkaz</button></div>`).join('')}</div>`};
sumParents=p=>{const on=pubOn(p),pv=on.length?W.pub[on[0]][p.id]:null,pd=pv?PJ(pv):null,f=(p.focus||[])[0]||'hazeni';
 const d=pd&&pd.title?pd:Object.assign(pubData(p,true),{hw:HOME[f]||HOME.hazeni,note:''});
 return `<div><span class="label">Shrnutí pro rodiče</span>${on.length?`<p class="small">✓ Zveřejněno pro ${on.map(t=>esc(tName(t))).join(', ')}${pv&&pv.ts?' · '+new Date(pv.ts).toLocaleString('cs-CZ',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}):''}</p>`:'<p class="small muted">Zatím nezveřejněno na stránce pro rodiče.</p>'}
  <div class="partxt">${esc(parTxt(d))}</div><div class="row"><button class="btn sm" data-a="sumwa">Poslat do WhatsApp</button><button class="btn ghost sm" data-a="sumcopy">Kopírovat text</button></div></div>`};
/* WhatsApp: nativní sdílení (vybereš WhatsApp a skupinu), jinak odkaz wa.me s předvyplněným textem */
async function shareWA(t){if(!t)return;if(navigator.share){try{await navigator.share({text:t});return}catch(e){if(e&&e.name==='AbortError')return}}
 const u='https://wa.me/?text='+encodeURIComponent(t);try{window.open(u,'_blank','noopener')}catch(e){location.href=u}}
const P={tid:PARENT,list:null,err:false};
function parentBoot(){applyTheme();syncLine();const f=fbInit();if(!f){renderParentPage();return}
 f.db.ref('public/'+PARENT+'/training').on('value',s=>{const v=s.val()||{};P.list=Object.entries(v).map(([id,x])=>Object.assign({id,ts:x&&x.ts},PJ(x)||{})).filter(x=>x.date).sort((a,b)=>b.date.localeCompare(a.date)||b.ts-a.ts);renderParentPage()},()=>{P.err=true;renderParentPage()});
 f.db.ref('teamlist/'+PARENT).once('value').then(s=>{const v=s.val();if(v&&v.name){P.name=v.name;renderParentPage()}}).catch(()=>{});renderParentPage()}
function renderParentPage(){$('#tabs').innerHTML='';const ts=$('#teamSel');if(ts){ts.innerHTML='';ts.hidden=true}const sy=$('#sync');if(sy)sy.textContent='Pro rodiče'+(P.name?' · '+P.name:'');
 const L=P.list,team=P.name||(L&&L[0]&&L[0].teams&&L[0].teams[0])||'';
 $('#view').innerHTML=`<section class="card par-h">${dipLogo?`<img src="${dipLogo}" alt="Eagles">`:''}<div><h2>Co děláme na trénincích</h2><p class="small muted">${esc(team)}${L&&L[0]&&L[0].season?' · '+esc(L[0].season):''}</p></div></section>`+
  (P.err?'<p class="warnnote">Stránku se nepodařilo načíst. Zkontroluj odkaz od trenéra.</p>':L==null?'<p class="muted">Načítám…</p>':!L.length?'<section class="card"><p class="muted">Trenéři sem zatím žádný trénink nezveřejnili.</p></section>':
  L.map((x,i)=>`<section class="card par"><div class="sumline"><h2>${esc(x.title||'Trénink')}</h2><span class="small muted">${fmtDate(x.date)}</span></div>
   ${x.week?`<p class="small">Sezónní plán, týden ${x.week.n}: <b>${esc(x.week.name)}</b></p>`:''}${(x.focus||[]).length?`<p>Trénovali jsme: <b>${x.focus.map(esc).join(', ').toLowerCase()}</b></p>`:''}
   ${i===0||PEXP[x.id]?`${(x.items||[]).length?`<div class="dl">${x.items.map(a=>`<div><span class="label">${esc(a.n)}</span>${a.dev?`<p class="small">Rozvíjí: ${esc(a.dev)}</p>`:`<p class="small">${esc(a.d||'')}</p>`}</div>`).join('')}</div>`:''}
   ${(x.whys||[]).length?`<div class="note"><b>Proč to děláme</b><ul class="why">${x.whys.map(y=>`<li><b>${esc(y.c)}:</b> ${esc(y.t)}</li>`).join('')}</ul></div>`:''}
   ${(x.learn||[]).length?`<p><b>Nově se učíme:</b> ${x.learn.map(a=>esc(a.n)+' ('+a.steps.map(esc).join(' → ').toLowerCase()+')').join('; ')}</p>`:''}`:`<button class="btn ghost sm" data-a="pexp" data-v="${esc(x.id)}">Co jsme hráli</button>`}
   ${x.hw?`<div class="note"><b>🏠 Na doma (5 minut):</b> ${esc(x.hw)}</div>`:''}${x.note?`<p class="note">💬 ${esc(x.note)}</p>`:''}</section>`).join(''))+
  `<p class="small muted ver">Tréninkový plánovač U7 · ${verTxt()}</p>`}
const PEXP={};
function renderLogin(){
 $('#tabs').innerHTML='';const ts=$('#teamSel');ts.innerHTML='';ts.disabled=true;ts.hidden=true;
 $('#view').innerHTML=`<section class="card login"><h2>Přihlášení</h2>
  <p class="small muted">Zadej svůj osobní kód, který ti dal správce (nebo společný kód trenérů). Správce se přihlašuje svým kódem ze Scorekeeperu.</p>
  <form id="wLogin" class="dl"><div class="field"><span class="label">Kód</span><input type="text" id="w_code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="např. K4PX-7QMR"></div>
  <div class="row"><button class="btn" type="submit" ${W.busy?'disabled':''}>${W.busy?'Přihlašuji…':'Přihlásit'}</button></div></form>
  ${W.msg?`<p class="warnnote">${esc(W.msg)}</p>`:''}</section>`}
async function doLogin(){const code=normCode($('#w_code').value);if(code.replace('-','').length<8){W.msg='Zadej celý kód.';return render(true)}
 W.busy=true;W.msg='';render(true);
 try{const p=await claim(code);W.busy=false;W.role=p.role;W.code=code;W.coachId=p.coach||null;ls.set(WKEY,{code,role:p.role,coach:p.coach||''});
  S.teams=myTeamFilter(S.teams);fixTeam();Web.subscribe();logLogin('login');
  S.tab=p.role==='admin'&&!Object.keys(S.teams).length?'set':S.tab;render(true);toast(p.role==='admin'?'Přihlášeno: Správce.':p.coach?'Přihlášeno osobním kódem.':'Přihlášeno společným kódem trenérů.')}
 catch(e){W.busy=false;try{if(W.uid)W.fb.db.ref('claims/'+W.uid).remove()}catch(x){}
  W.msg=e&&e.code==='offline'?'Bez internetu se nejde přihlásit. Připoj se a zkus to znovu.':e&&e.code==='scorer'?'Tohle je kód zapisovatele pro Scorekeeper. Kód pro trenéry ti dá správce.':'Neplatný kód. Zkontroluj ho a zkus to znovu.';render(true)}}
document.addEventListener('submit',e=>{if(e.target.id==='wLogin'){e.preventDefault();doLogin()}});

/* ---------- správce: kód pro trenéry ---------- */
async function loadPins(){if(!W.fb||W.role!=='admin')return;try{W.pins=(await W.fb.db.ref('pinmap').once('value')).val()||{}}catch(e){W.pins={}}if(S.tab==='set')render()}
/* společný kód = role coach bez pole coach; osobní kód = role coach s id trenéra */
const coachCodes=()=>Object.keys(W.pins||{}).filter(c=>W.pins[c]&&W.pins[c].role==='coach'&&!W.pins[c].coach);
const personalCodes=id=>Object.keys(W.pins||{}).filter(c=>W.pins[c]&&W.pins[c].role==='coach'&&W.pins[c].coach===id);
async function newPersonalPin(id){if(!W.fb||W.role!=='admin')return;const c=staffList().find(x=>x.id===id);if(!c)return;const u={};personalCodes(id).forEach(k=>u[k]=null);const code=genCode();u[code]={role:'coach',coach:id};
 try{await W.fb.db.ref('pinmap').update(u);toast(Object.keys(u).length>1?'Nový kód pro '+c.name+'. Starý přestal platit.':'Kód pro '+c.name+' je vytvořený.')}catch(e){toast(isPerm(e)?'Kód se nepodařilo uložit (oprávnění).':'Kód se nepodařilo vytvořit.')}W.pdel=null;loadPins()}
async function dropPersonalPin(id,quiet){if(!W.fb||W.role!=='admin')return;const u={};personalCodes(id).forEach(k=>u[k]=null);if(!Object.keys(u).length)return;
 try{await W.fb.db.ref('pinmap').update(u);if(!quiet)toast('Přístup zrušen.')}catch(e){if(!quiet)toast('Kód se nepodařilo zrušit.')}W.pdel=null;loadPins()}
function sendPin(id){const c=staffList().find(x=>x.id===id),code=personalCodes(id)[0];if(!c||!code)return;
 shareWA(`Ahoj ${c.name}, tady je tvůj osobní kód do Tréninkového plánovače U7: ${code}\nOtevři ${baseUrl()} a zadej ho při přihlášení. Kód nikomu neposílej.`)}
async function newCoachPin(){if(!W.fb||W.role!=='admin')return;const u={};coachCodes().forEach(c=>u[c]=null);const code=genCode();u[code]={role:'coach'};
 try{await W.fb.db.ref('pinmap').update(u);W.pinMsg='Nový společný kód: '+code+'. Starý společný kód přestal platit.'}catch(e){W.pinMsg=isPerm(e)?'Pravidla databáze zatím roli trenér neznají. Vlož do Firebase nová pravidla (README).':'Kód se nepodařilo vytvořit.'}loadPins()}
async function dropCoachPins(){if(!W.fb||W.role!=='admin')return;const u={};coachCodes().forEach(c=>u[c]=null);try{await W.fb.db.ref('pinmap').update(u);W.pinMsg='Společný kód je zrušený. Trenéři s osobním kódem se přihlašují dál.'}catch(e){W.pinMsg='Kód se nepodařilo zrušit.'}loadPins()}



/* ---------- záložka Tým: stejné funkce jako karta Tým ve Scorekeeperu ---------- */
const jersey=raw=>{const v=String(raw||'').trim().replace(/^0+(?=\d)/,'');return /^\d{1,3}$/.test(v)?v:null};
const numTxt=n=>noNum(n)?'bez č.':'#'+n;
function rosterOf(tid){const R=clone(W.raw.roster[tid]||{name:tName(tid),players:[]});if(!Array.isArray(R.players))R.players=[];return R}
function rosterSave(tid,R){W.raw.roster[tid]=R;Web.compose();Web.write('teams/'+tid+'/roster',{ts:Date.now(),dev:'planovac',json:J(R)})}
/* Dovednosti a úroveň jsou v training/kids/<tým>/<číslo>. Když hráče přesune nebo zkopíruje
   Scorekeeper (nebo se změní číslo), převezmou se z jiného týmu podle jména (a čísla). */
function kidsCarry(){const tids=Object.keys(W.raw.teamlist||{});if(!tids.length||!tids.every(t=>W.loaded['k_'+t]&&W.loaded['r_'+t]))return;
 tids.forEach(tid=>{const R=W.raw.roster[tid],kids=W.raw.kids[tid]||{};if(!R||!Array.isArray(R.players))return;let add=null;
  R.players.forEach(p=>{if(!p||p.num==null||!p.name)return;const num=String(p.num);if(kids[num]&&kids[num].name===p.name)return;
   const nm=nameKey(p.name);if(Object.values(kids).some(k=>k&&k.name&&nameKey(k.name)===nm))return; /* už je tu pod jiným číslem */
   if(kids[num]&&kids[num].name&&nameKey(kids[num].name)!==nm)return; /* číslo patří jinému dítěti – nepřepisovat */
   const src=[];tids.filter(t=>t!==tid).forEach(t=>Object.entries(W.raw.kids[t]||{}).forEach(([n,k])=>{if(k&&k.name&&nameKey(k.name)===nm)src.push({t,n,k})}));
   const hit=src.find(x=>x.n===num)||(src.length===1?src[0]:null);if(!hit||(!hit.k.lvl&&!hit.k.ag&&!(hit.k.sk||[]).length))return;
   add=add||Object.assign({},kids);add[num]={lvl:hit.k.lvl||'',sk:(hit.k.sk||[]).slice(),name:p.name,ag:hit.k.ag||''}});
  if(add)kidsSave(tid,add)})}
function kidsSave(tid,k){W.raw.kids[tid]=k;Web.compose();Web.write('training/kids/'+tid,{ts:Date.now(),json:J(k)})}
function vTeam(){
 const t=team(),tid=S.teamId;if(!t)return noTeam();const ps=players(),adm=W.role==='admin',others=Object.keys(S.teams).filter(x=>x!==tid);
 return `<section class="card"><div class="field"><span class="label">Název našeho týmu</span><input type="text" id="wt_name" data-c="wtname" value="${esc(t.name)}"></div>
  <span class="label">Soupiska · ${ps.length} hráčů</span>
  ${ps.length?`<div class="dl">${ps.map(p=>`<div class="rrow">
   <b class="rnum">${noNum(p.num)?'–':'#'+esc(p.num)}</b>
   <span class="rname"><button class="aname" data-a="kid" data-v="${esc(p.num)}">${esc(dn(p)||'Hráč')}</button>${p.nick&&String(p.nick).trim()?' <span class="lvl">'+esc(p.name)+'</span>':''}${noNum(p.num)?' <span class="lvl">bez čísla</span>':''}</span>
   <button class="chip" data-a="lvl" data-v="${esc(p.num)}" title="Úroveň">${LVL[p.lvl]||'úroveň'}</button>
   <span class="row" style="gap:4px;flex-wrap:nowrap">${noNum(p.num)?`<button class="btn ghost sm" data-a="wrass" data-v="${esc(p.num)}">Přidělit číslo</button>`:''}${adm&&others.length?`<button class="ib" data-a="wrmv" data-v="${esc(p.num)}" aria-label="Přesunout do jiného týmu" title="Přesunout do jiného týmu">⇄</button>`:''}<button class="ib" data-a="wrdel" data-v="${esc(p.num)}" aria-label="Odebrat ze soupisky">✕</button></span>
   ${W.assign===p.num?`<form id="wAss" class="row" style="grid-column:1/-1"><input type="text" inputmode="numeric" maxlength="3" id="w_assnum" placeholder="Číslo pro ${esc(dn(p))}" aria-label="Číslo dresu" style="flex:1 1 140px;width:auto"><button class="btn sm" type="submit">Uložit</button><button class="btn ghost sm" type="button" data-a="wrassno">Zrušit</button></form>`:''}
   ${W.rmove===p.num?`<div class="row" style="grid-column:1/-1"><select id="w_mvt" aria-label="Cílový tým" style="flex:1 1 160px;width:auto">${others.map(x=>`<option value="${esc(x)}">${esc(tName(x))}</option>`).join('')}</select><button class="btn sm" data-a="wrmvgo" data-v="0">Přesunout</button><button class="btn ghost sm" data-a="wrmvgo" data-v="1" title="Hráč zůstane i tady">Přidat i tam</button><button class="btn ghost sm" data-a="wrmvno">Zrušit</button></div>`:''}
  </div>`).join('')}</div>`:'<p class="muted">Soupiska je zatím prázdná. Přidej první hráče.</p>'}
  <form id="wAddP" class="row"><input type="text" inputmode="numeric" maxlength="3" id="wn_num" placeholder="Č." aria-label="Číslo dresu" style="flex:0 0 76px;width:76px" ${W.rNoNum?'disabled':''}><input type="text" id="wn_name" placeholder="Jméno" aria-label="Jméno hráče" style="flex:1 1 140px;width:auto"><button class="btn sm" type="submit">Přidat</button></form>
  <label class="row small"><input type="checkbox" id="wn_nonum" data-c="wnonum" ${W.rNoNum?'checked':''}> zatím bez čísla (číslo přidělíš později)</label>
  ${W.rmsg?`<p class="small"><b>${esc(W.rmsg)}</b></p>`:''}
  <p class="small muted">Zadáním stejného čísla změníš jméno. Soupiska je společná se Scorekeeperem. Klepnutím na jméno otevřeš dovednosti dítěte, tlačítkem vedle přepneš úroveň.</p></section>`}
function addRosterW(){const tid=S.teamId,name=($('#wn_name').value||'').trim(),R=rosterOf(tid);
 if(W.rNoNum){if(!name){W.rmsg='Hráče bez čísla zadej aspoň jménem.';return render(true)}if(R.players.some(p=>noNum(p.num)&&(p.name||'').toLowerCase()===name.toLowerCase())){W.rmsg=name+' už na soupisce je.';return render(true)}
  const num='~'+uid().slice(-6);R.players.push({num,name});rosterSave(tid,R);if(S.draft.present[tid]){S.draft.present[tid].push(num);saveDraft()}W.rmsg='';render(true);const f=$('#wn_name');if(f&&f.focus)f.focus();return}
 const num=jersey($('#wn_num').value);if(!num){W.rmsg='Zadej číslo dresu, nebo zaškrtni „zatím bez čísla“.';return render(true)}
 const ex=R.players.find(p=>String(p.num)===num);if(ex)ex.name=name;else{R.players.push({num,name});if(S.draft.present[tid]){S.draft.present[tid].push(num);saveDraft()}}
 rosterSave(tid,R);W.rmsg=ex?'Jméno u #'+num+' změněno.':'';render(true);const f=$('#wn_num');if(f&&f.focus)f.focus()}
function assignNumberW(old,raw){const tid=S.teamId,num=jersey(raw),R=rosterOf(tid),p=R.players.find(x=>String(x.num)===old);if(!p)return;
 if(!num){W.rmsg='Zadej číslo dresu.';return render(true)}if(R.players.some(x=>String(x.num)===num)){W.rmsg='Číslo #'+num+' už má někdo jiný.';return render(true)}
 p.num=num;p.was=old;rosterSave(tid,R); /* Scorekeeper podle „was“ přepíše číslo i v zápasech */
 const k=Object.assign({},W.raw.kids[tid]||{});if(k[old]){k[num]=k[old];delete k[old];kidsSave(tid,k)}
 const ok=K(tid,old),nk=K(tid,num),sw=a=>Array.isArray(a)?a.map(x=>normKey(x,{team:tid})===ok?nk:x):a;
 if(S.draft.present[tid]){S.draft.present[tid]=S.draft.present[tid].map(x=>x===old?num:x);saveDraft()}
 if(S.plan){S.plan.present=sw(S.plan.present);S.plan.groups=(S.plan.groups||[]).map(sw);savePlan()}
 Object.entries(S.plans).forEach(([id,pl])=>{if(!planTeams(pl).includes(tid))return;const before=J([pl.present,pl.groups]),q=clone(pl);q.present=sw(q.present);q.groups=(q.groups||[]).map(sw);if(J([q.present,q.groups])!==before)Store.put('plans',id,q)});
 W.assign=null;W.rmsg=dn(p)+' má teď číslo #'+num+'. Změna se propsala i do zápasů.';render(true)}
function movePlayerW(copy){const tid=S.teamId,num=W.rmove,R=rosterOf(tid),p=R.players.find(x=>String(x.num)===num),sel=$('#w_mvt'),to=sel&&sel.value;if(!p||!to||to===tid||!S.teams[to])return;
 const T=rosterOf(to),clash=noNum(num)?T.players.find(x=>noNum(x.num)&&(x.name||'').toLowerCase()===(p.name||'').toLowerCase()):T.players.find(x=>String(x.num)===num);
 if(clash){W.rmsg=noNum(num)?dn(p)+' už v týmu '+tName(to)+' je.':'V týmu '+tName(to)+' už má #'+num+' '+(clash.name||'jiný hráč')+'. Nejdřív jednomu z nich změň číslo.';return render(true)}
 T.players.push(Object.assign({},p));rosterSave(to,T);
 const kf=(W.raw.kids[tid]||{})[num];if(kf){const kt=Object.assign({},W.raw.kids[to]||{});kt[num]=Object.assign({},kf,{name:p.name||kf.name||''});kidsSave(to,kt);if(!copy){const ks=Object.assign({},W.raw.kids[tid]||{});delete ks[num];kidsSave(tid,ks)}}
 if(!copy){R.players=R.players.filter(x=>String(x.num)!==num);rosterSave(tid,R)}
 W.rmove=null;W.rmsg=(p.name||numTxt(num))+(copy?' je teď i v týmu ':' přesunut do týmu ')+tName(to)+'.'+(copy?'':' Odehrané zápasy a statistiky zůstávají tady.');render(true)}
document.addEventListener('submit',e=>{const id=e.target.id;if(id==='wAddP'){e.preventDefault();addRosterW()}else if(id==='wAss'){e.preventDefault();assignNumberW(W.assign,$('#w_assnum').value)}});
document.addEventListener('change',e=>{const el=e.target,c=el.dataset&&el.dataset.c;
 if(c==='wnonum'){W.rNoNum=el.checked;render(true);const f=$(el.checked?'#wn_name':'#wn_num');if(f&&f.focus)f.focus()}
 else if(c==='wtname'){const v=el.value.trim(),tid=S.teamId,R=rosterOf(tid);R.name=v;rosterSave(tid,R);if(v&&W.role==='admin'){W.raw.teamlist[tid]=Object.assign({},W.raw.teamlist[tid],{name:v});Web.compose();Web.write('teamlist/'+tid+'/name',v)}render(true)}});


/* ---------- Kdo je kdo: fotka je u hráče v soupisce (player.photo), stejně jako ve Scorekeeperu.
   Starší fotky z plánovače (photos/<tid>/<číslo>) se jednou přesunou do soupisky. ---------- */
let phT=null;const phCache=()=>{clearTimeout(phT);phT=setTimeout(()=>ls.set('u7w-photos',W.raw.photos),800)};
const phKey=n=>String(n).replace(/[.#$[\]/]/g,'_');
const rosterPl=(tid,num)=>{const R=W.raw.roster[tid];return R&&Array.isArray(R.players)?R.players.find(x=>x&&String(x.num)===String(num)):null};
function photoOf(tid,p){const rp=rosterPl(tid,p.num);if(rp&&rp.photo)return rp.photo;const m=W.raw.photos[tid]||{},d=m[phKey(p.num)];if(d&&d.img)return d.img;const f=Object.values(m).find(x=>x&&x.name&&x.name===p.name&&x.img);return f?f.img:''}
const WHO=Object.assign({teams:[],size:'m'},ls.get('u7w-who',{}));const whoSave=()=>ls.set('u7w-who',WHO);
const initials=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
function whoTeams(){let t=(WHO.teams||[]).filter(x=>S.teams[x]);if(!t.length&&S.teams[S.teamId])t=[S.teamId];return t}
function vWho(){
 if(!team())return noTeam();const den='';const sel=whoTeams(),all=Object.entries(S.teams).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||'','cs'));
 const n=sel.reduce((s,t)=>s+(S.teams[t].players||[]).length,0),nf=sel.reduce((s,t)=>s+(S.teams[t].players||[]).filter(p=>photoOf(t,p)).length,0);
 return den+`<section class="card who-f"><div class="sumline"><h2>Kdo je kdo</h2><span class="small muted">${n} dětí · ${nf} s fotkou</span></div>
  <div class="row hs" style="gap:6px">${all.length>1?all.map(([id,x])=>{const on=sel.includes(id);return `<button class="chip sm ${on?'on':''}" data-a="whot" data-v="${esc(id)}" aria-pressed="${on}">${esc(x.name)}</button>`}).join(''):''}
   <div class="seg sm" role="group" aria-label="Velikost fotek" style="margin-left:auto">${[['s','S','Malé'],['m','M','Střední'],['l','L','Velké']].map(([k,l,t])=>`<button data-a="whosz" data-v="${k}" class="${WHO.size===k?'on':''}" title="${t}" aria-label="${t}">${l}</button>`).join('')}</div></div></section>
 ${sel.map(tid=>{const ps=S.teams[tid].players||[];return `${sel.length>1?`<h3 class="who-h">${esc(tName(tid))} · ${ps.length}</h3>`:''}
  ${ps.length?`<div class="who-grid ${WHO.size}">${ps.map(p=>{const img=photoOf(tid,p);return `<button class="who" data-a="whoopen" data-v="${esc(K(tid,p.num))}" aria-label="${esc(dn(p))}${noNum(p.num)?'':', číslo '+esc(p.num)}">
   <span class="ph">${img?`<img src="${img}" alt="" loading="lazy">`:`<span class="ini">${esc(initials(dn(p)))}</span>`}${noNum(p.num)?'':`<b class="wn">${esc(p.num)}</b>`}</span><span class="wname">${esc(dn(p))}</span></button>`}).join('')}</div>`:'<p class="muted">Soupiska je prázdná.</p>'}`}).join('')}`}
function openWho(key){const x=kid(key),tid=x.tid,p=(S.teams[tid]&&S.teams[tid].players||[]).find(q=>q.num===x.num);if(!p)return;const img=photoOf(tid,p),sh=$('#sheet');
 sh.innerHTML=`<div role="dialog" aria-modal="true" aria-label="${esc(dn(p))}"><div class="sumline"><span class="kb game">${esc(tName(tid))}</span><button class="ib" data-a="close" aria-label="Zavřít">✕</button></div>
  <div class="who-big">${img?`<img src="${img}" alt="Fotka: ${esc(dn(p))}">`:`<span class="ini">${esc(initials(dn(p)))}</span>`}${noNum(p.num)?'':`<b class="wn">${esc(p.num)}</b>`}</div>
  <h2>${esc(dn(p))}${noNum(p.num)?' <span class="lvl">bez čísla</span>':''}</h2>${LVL[p.lvl]?`<p class="small">Úroveň: <b>${LVL[p.lvl]}</b></p>`:''}<p class="small">Kategorie: <b>${kidAge(tid,p)}</b>${AGES.includes(p.ag)?'':' (podle týmu)'}</p>
  <div class="row"><label class="btn sm" for="who_file">${img?'Vyměnit fotku':'Vyfotit nebo nahrát fotku'}</label><input type="file" id="who_file" accept="image/*" data-k="${esc(key)}" hidden>
   ${img?(W.phDel===key?`<button class="btn danger sm" data-a="whodelgo" data-v="${esc(key)}">Opravdu odebrat</button><button class="btn ghost sm" data-a="whodelno" data-v="${esc(key)}">Ne</button>`:`<button class="btn ghost sm" data-a="whodel" data-v="${esc(key)}">Odebrat fotku</button>`):''}
   <button class="btn ghost sm" data-a="whokid" data-v="${esc(key)}">Dovednosti</button></div>
  ${W.phMsg?`<p class="small"><b>${esc(W.phMsg)}</b></p>`:''}<p class="small muted">Fotka se zmenší na čtverec 256 × 256 px a je společná se Scorekeeperem – změna se projeví v obou aplikacích.</p></div>`;
 sh.hidden=false;sh.dataset.id=''}
function shrinkPhoto(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file),im=new Image();
 im.onload=()=>{try{const S2=256,c=document.createElement('canvas');c.width=S2;c.height=S2;const g=c.getContext('2d'),w=im.naturalWidth,h=im.naturalHeight,m=Math.min(w,h);
  g.drawImage(im,(w-m)/2,(h-m)/3,m,m,0,0,S2,S2);URL.revokeObjectURL(url);let q=.82,d=c.toDataURL('image/jpeg',q);while(d.length>45000&&q>.4){q-=.12;d=c.toDataURL('image/jpeg',q)}res(d)}catch(e){rej(e)}};
 im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('img'))};im.src=url})}
kidPh=x=>{const img=x&&x.tid?photoOf(x.tid,{num:x.num,name:x.name}):'';return img?`<img class="kph" src="${img}" alt="" loading="lazy">`:''};
dipLogo='logo.png';kidImg=x=>x&&x.tid?photoOf(x.tid,{num:x.num,name:x.name}):'';
/* ---------- Počasí na den tréninku (Open-Meteo, bez klíče) ---------- */
const WX_DEF={lat:50.034,lon:14.435,name:'Eagles Park, Krč',h:17};
const wxPref=()=>{const P=Object.assign({},WX_DEF,S.pref.wx||{}),t=schedAt(S.draft&&S.draft.date||today()).time;if(t&&/^\d{1,2}:/.test(t))P.h=Math.min(21,+t.split(':')[0]);return P};
const WX={data:null,key:'',at:0,busy:false,err:false};
function wxLoad(){const P=wxPref(),key=P.lat.toFixed(2)+','+P.lon.toFixed(2);
 if(!WX.data&&!WX.key){const c=ls.get('u7w-wx',null);if(c&&c.key){WX.data=c.data;WX.key=c.key;WX.at=c.at}}
 if(WX.busy||(WX.key===key&&Date.now()-WX.at<3600e3)||(WX.errKey===key&&Date.now()-WX.errAt<300e3)||typeof fetch!=='function')return;WX.busy=true;
 fetch('https://api.open-meteo.com/v1/forecast?latitude='+P.lat+'&longitude='+P.lon+'&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m&timezone=Europe%2FPrague&forecast_days=16')
  .then(r=>r.ok?r.json():Promise.reject(r.status)).then(j=>{WX.data=j.hourly;WX.key=key;WX.at=Date.now();WX.err=false;ls.set('u7w-wx',{data:WX.data,key,at:WX.at})})
  .catch(()=>{WX.err=true;WX.errKey=key;WX.errAt=Date.now()}).finally(()=>{WX.busy=false;if(S.tab==='plan')render(true)})}
const WMO=c=>c>=95?['⛈','bouřka']:c>=85?['🌨','sněhové přeháňky']:c>=80?['🌧','přeháňky']:c>=71?['🌨','sněžení']:c>=61?['🌧','déšť']:c>=51?['🌦','mrholení']:c>=45?['🌫','mlha']:c>=3?['☁️','zataženo']:c>=1?['🌤','polojasno']:['☀️','jasno'];
function wxFor(date){const d=WX.data,P=wxPref();if(!d||!d.time)return null;const hs=[P.h,P.h+1].map(h=>date+'T'+String(h).padStart(2,'0')+':00').map(t=>d.time.indexOf(t)).filter(i=>i>=0);if(!hs.length)return null;
 const g=k=>hs.map(i=>d[k][i]).filter(v=>v!=null);const T=g('temperature_2m'),pp=g('precipitation_probability'),pr=g('precipitation'),cd=g('weather_code'),wd=g('wind_speed_10m');
 return{tmin:Math.round(Math.min(...T)),tmax:Math.round(Math.max(...T)),prob:pp.length?Math.max(...pp):0,mm:pr.reduce((a,b)=>a+b,0),code:cd.length?Math.max(...cd):0,wind:wd.length?Math.round(Math.max(...wd)):0}}
weatherBox=()=>{const d=S.draft,date=d.date||today(),P=wxPref(),days=Math.round((new Date(date)-new Date(today()))/864e5);if(days<0)return'';
 if(days>15)return `<div class="wx small muted">🌦 Předpověď počasí pro ${P.name} bude k dispozici asi 15 dní před tréninkem.</div>`;
 wxLoad();const w=wxFor(date);if(!w)return `<div class="wx small muted">${WX.err?'Počasí se teď nepodařilo načíst.':'Načítám počasí…'}</div>`;
 const [ic,tx]=WMO(w.code),wet=w.prob>=60||w.mm>=1||w.code>=95,cold=w.tmax<4,rec=wet||cold?'hala':'venku';
 const why=w.code>=95?'hrozí bouřka':wet?'pravděpodobně bude pršet':cold?'bude zima':w.prob>=30?'může sprchnout, vezměte bundy':'hrát se dá venku';
 return `<div class="wx"><div class="sumline"><span><b class="big">${ic} ${w.tmin===w.tmax?w.tmax:w.tmin+'–'+w.tmax} °C</b> ${tx}</span><span class="small muted">${esc(P.name)} · ${P.h}–${P.h+2} h</span></div>
  <span class="small">Srážky ${w.prob} %${w.mm>=.1?' · '+w.mm.toFixed(1).replace('.',',')+' mm':''} · vítr ${w.wind} km/h${w.wind>=40?' – silný vítr':''}</span>
  <span class="small">Doporučení: <b>${rec==='hala'?'hala':'venku'}</b> – ${why}.</span>${rec!==d.venue?`<div class="row"><button class="btn ghost sm" data-a="venue" data-v="${rec}">Přepnout na ${rec==='hala'?'halu':'venku'}</button></div>`:''}</div>`};
function wxSet(){const P=wxPref();return `<div class="field"><span class="label">Počasí: místo tréninku</span><div class="row"><span><b>${esc(P.name)}</b></span><button class="btn ghost sm" data-a="wxgeo">📍 Použít polohu telefonu</button>${S.pref.wx&&S.pref.wx.lat!=null?'<button class="btn ghost sm" data-a="wxreset">Eagles Park</button>':''}</div></div>
  ${SEA().time?`<p class="small muted">Předpověď je pro ${P.h}–${P.h+2} h podle času tréninku v kartě Sezóna.</p>`:`<div class="field"><span class="label">Obvyklý začátek tréninku</span><select id="pf_wxh" data-c="wxh">${[14,15,16,17,18,19].map(h=>`<option value="${h}" ${P.h===h?'selected':''}>${h}:00</option>`).join('')}</select></div>`}`}
/* ---------- Export týmu do Excelu (SheetJS z cdnjs, načte se až při exportu) ---------- */
let XLSXp=null;
function loadXLSX(){if(window.XLSX)return Promise.resolve(window.XLSX);return XLSXp||(XLSXp=new Promise((ok,bad)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>window.XLSX?ok(window.XLSX):bad();s.onerror=()=>{XLSXp=null;bad()};document.head.appendChild(s)}))}
const xlsRows=tid=>sortPl(plOf(tid)).map(p=>({'Jméno':p.name||'','Kategorie':kidAge(tid,p),'Úroveň':LVL[p.lvl]||''}));
const safeSheet=n=>String(n||'Tým').replace(/[\\/?*[\]:]/g,' ').slice(0,31)||'Tým';
async function exportXls(tids){if(!tids.length)return;toast('Připravuji soubor…');let X;try{X=await loadXLSX()}catch(e){toast('Export potřebuje připojení k internetu.');return}
 const wb=X.utils.book_new(),multi=tids.length>1,rows=multi?tids.flatMap(tid=>xlsRows(tid).map(r=>Object.assign({'Tým':tName(tid)},r))):xlsRows(tids[0]);
 const ws=X.utils.json_to_sheet(rows,{header:(multi?['Tým']:[]).concat(['Jméno','Kategorie','Úroveň'])});ws['!cols']=(multi?[{wch:24}]:[]).concat([{wch:28},{wch:11},{wch:11}]);
 X.utils.book_append_sheet(wb,ws,multi?'Všechny týmy':safeSheet(tName(tids[0])));
 X.writeFile(wb,(tids.length>1?'Týmy':tName(tids[0])).replace(/[\\/:*?"<>|]/g,' ')+' – '+today()+'.xlsx')}
seaHint=()=>W.role==='admin'&&!SEA().name?`<div class="hint"><span class="small">📅 <b>Nastav sezónu</b> – aplikace pak sama předvyplní datum dalšího tréninku, týden plánu a čas pro počasí.</span><button class="btn ghost sm" data-a="tab" data-v="set">Nastavit</button></div>`:'';
function legacyDel(tid,keys){const m=Object.assign({},W.raw.photos[tid]||{});keys.forEach(k=>{if(m[k]){delete m[k];Web.write('photos/'+tid+'/'+k,null)}});W.raw.photos[tid]=m;phCache()}
function photoSet(tid,num,img){const R=rosterOf(tid),p=R.players.find(x=>String(x.num)===String(num));if(!p)return;if(img)p.photo=img;else delete p.photo;rosterSave(tid,R);legacyDel(tid,[phKey(num)])}
function migratePhotos(tid){if(!W.loaded['r_'+tid]||!W.loaded['p_'+tid]||!W.raw.roster[tid])return;const m=W.raw.photos[tid]||{},keys=Object.keys(m);if(!keys.length)return;
 const R=rosterOf(tid),done=[];let ch=false;
 keys.forEach(k=>{const d=m[k];if(!d||!d.img)return done.push(k);const p=R.players.find(x=>phKey(x.num)===k)||R.players.find(x=>d.name&&x.name===d.name);if(!p)return;if(!p.photo){p.photo=d.img;ch=true}done.push(k)});
 if(ch)rosterSave(tid,R);if(done.length)legacyDel(tid,done)}
document.addEventListener('change',async e=>{if(e.target.id!=='who_file')return;const f=e.target.files&&e.target.files[0],key=e.target.dataset.k;if(!f||!key)return;
 const x=kid(key);W.phMsg='Ukládám fotku…';openWho(key);
 try{const img=await shrinkPhoto(f);photoSet(x.tid,x.num,img);W.phMsg='';toast('Fotka uložena.')}catch(err){W.phMsg='Tuhle fotku se nepodařilo načíst. Zkus jinou.'}
 openWho(key);if(S.tab==='who')render(true)});


/* ---------- trenéři: jeden seznam, u každého týmy, kde trénuje (training/staff) ---------- */
function staffList(){if(Array.isArray(W.raw.staff))return W.raw.staff;const m=[];Object.entries(W.raw.coaches||{}).forEach(([tid,cs])=>(cs||[]).forEach((c,i)=>{const nm=String(c&&c.name||c||'').trim();if(!nm)return;let x=m.find(y=>nameKey(y.name)===nameKey(nm));if(!x){x={id:c.id||('c'+tid+i),name:nm,teams:[]};m.push(x)}if(!x.teams.includes(tid))x.teams.push(tid)}));return m}
function staffSave(list){W.raw.staff=list;Web.compose();render(true);Web.write('training/staff',{ts:Date.now(),json:J(list)})}
let staffDone=false;
function staffMigrate(){/* jednorázově: staré seznamy trenérů po týmech -> společný seznam */
 if(staffDone||!W.loaded.staff||!W.loaded.tl||Array.isArray(W.raw.staff))return;if(!Object.keys(W.raw.teamlist).every(t=>W.loaded['c_'+t]))return;
 staffDone=true;const m=staffList();if(m.length)Web.write('training/staff',{ts:Date.now(),json:J(m)})}
function vStaff(){const list=staffList(),teams=Object.entries(S.teams).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||'','cs')),adm=W.role==='admin';
 if(W.coachId&&!adm){const mine=list.filter(c=>(c.teams||[]).some(t=>S.teams[t]));
  return `<section class="card"><div class="sumline"><h2>Trenéři tvých týmů · ${mine.length}</h2></div>
   ${mine.length?`<div class="dl">${mine.map(c=>`<div><b>${esc(c.name)}</b>${c.id===W.coachId?' (ty)':''}<br><span class="small muted">${(c.teams||[]).filter(t=>S.teams[t]).map(t=>esc(tName(t))).join(', ')}</span></div>`).join('')}</div>`:'<p class="muted">Zatím nikdo.</p>'}
   <p class="small muted">Seznam trenérů, jejich týmy a přístupové kódy spravuje správce.</p></section>`}
 return `<section class="card"><div class="sumline"><h2>Trenéři · ${list.length}</h2></div>
  <p class="small muted">U každého trenéra zaškrtni týmy, kde trénuje. Na začátku tréninku se nabídnou trenéři vybraných týmů.${adm?' Trenér s osobním kódem uvidí jen zaškrtnuté týmy.':''}</p>
  ${list.length?`<div class="stafflist">${list.map(c=>`<div class="staff">
   <div class="pl" style="grid-template-columns:1fr auto"><input type="text" id="st_${esc(c.id)}" data-c="stname" data-v="${esc(c.id)}" value="${esc(c.name)}" aria-label="Jméno trenéra">
   ${W.sdel===c.id?`<span class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn danger sm" data-a="stdelgo" data-v="${esc(c.id)}">Odebrat</button><button class="btn ghost sm" data-a="stdelno">Ne</button></span>`:`<button class="ib" data-a="stdel" data-v="${esc(c.id)}" aria-label="Odebrat ${esc(c.name)}">✕</button>`}</div>
   <div class="row" style="gap:6px">${teams.map(([id,x])=>{const on=(c.teams||[]).includes(id);return `<button class="chip sm ${on?'on':''}" data-a="stteam" data-v="${esc(c.id)}" data-t="${esc(id)}" aria-pressed="${on}">${esc(x.name)}</button>`}).join('')}${(c.teams||[]).filter(id=>S.teams[id]).length?'':'<span class="small warnnote">Bez týmu, v tréninku se nenabídne.</span>'}</div>
   ${adm?vPinRow(c):''}
  </div>`).join('')}</div>`:'<p class="muted">Zatím žádný trenér.</p>'}
  <form id="wAddC" class="pl" style="grid-template-columns:1fr auto"><input type="text" id="wc_name" placeholder="Jméno nového trenéra" aria-label="Jméno trenéra"><button class="btn sm" type="submit">Přidat</button></form>
  <p class="small muted">Nový trenér se přidá k týmu ${esc(team()?team().name:'')}, další týmy zaškrtneš.</p></section>`}
function vPinRow(c){const pc=personalCodes(c.id),seen=lastSeen(c.id);
 if(W.pins===undefined||W.pins===null)return '<p class="small muted">Načítám kód…</p>';
 return `<div class="row pinrow" style="gap:6px">${pc.length?`<span class="small">Osobní kód <code class="code">${esc(pc[0])}</code></span>
  <button class="btn sm" data-a="pinsend" data-v="${esc(c.id)}">Poslat</button>
  ${W.pdel===c.id?`<button class="btn danger sm" data-a="pindropgo" data-v="${esc(c.id)}">Zrušit přístup</button><button class="btn ghost sm" data-a="pindropno">Ne</button>`:`<button class="btn ghost sm" data-a="pinnew" data-v="${esc(c.id)}">Nový kód</button><button class="btn ghost sm" data-a="pindrop" data-v="${esc(c.id)}">Zrušit</button>`}`
  :`<span class="small muted">Bez osobního kódu</span><button class="btn sm" data-a="pinnew" data-v="${esc(c.id)}">Vytvořit kód</button>`}</div>
  ${seen?`<span class="small muted">Naposledy v aplikaci: ${seen}</span>`:''}`}
document.addEventListener('submit',e=>{if(e.target.id!=='wAddC')return;e.preventDefault();const nm=($('#wc_name').value||'').trim();if(!nm)return toast('Napiš jméno trenéra.');
 const list=clone(staffList());if(list.some(c=>nameKey(c.name)===nameKey(nm)))return toast(nm+' už v seznamu je.');
 const id='c'+uid();list.push({id,name:nm,teams:S.teamId?[S.teamId]:[]});staffSave(list);
 Object.keys(S.draft.coachSel).forEach(k=>{if(k.split('+').includes(S.teamId))S.draft.coachSel[k].push(K(S.teamId,id))});saveDraft();
 setTimeout(()=>{const f=$('#wc_name');if(f&&f.focus)f.focus()},30)});
document.addEventListener('change',e=>{const el=e.target;if(!el.dataset||el.dataset.c!=='stname')return;const v=el.value.trim();if(!v){render(true);return}
 const list=clone(staffList()),c=list.find(x=>x.id===el.dataset.v);if(!c||c.name===v)return;c.name=v;staffSave(list)});

/* ---------- Sezóna (training/season, společná pro všechny trenéry) ---------- */
function seaSave(patch){if(W.role!=='admin'){toast('Sezónu nastavuje správce.');return}S.season=Object.assign({},SEA(),patch);ls.set('u7w-season',S.season);Web.write('training/season',{ts:Date.now(),json:J(S.season)});render(true)}
function vSeaSet(){const s=SEA(),y=new Date().getFullYear(),days=s.days||[],wi=s.winter||{};
 if(W.role!=='admin')return `<section class="card"><div class="sumline"><h2>Sezóna</h2></div>${s.name?`<p><b>${esc(s.name)}</b>${s.from||s.to?' · '+(s.from?fmtDate(s.from):'…')+' – '+(s.to?fmtDate(s.to):'…'):''}</p>
  <p class="small">${days.length?'Tréninky: '+[1,2,3,4,5,6,0].filter(d=>days.includes(d)).map(d=>DOWL[d]).join(', '):'Tréninkové dny nejsou nastavené'}${s.time?' v '+esc(s.time):''}${s.plan?' · týden 1 plánu od '+fmtDate(s.plan):''}</p>`:'<p class="small">Sezóna zatím není nastavená.</p>'}
  <p class="small muted">Sezónu nastavuje správce.</p></section>`;
 return `<section class="card"><div class="sumline"><h2>Sezóna</h2>${s.name?`<span class="small muted">${esc(s.name)}</span>`:''}</div>
  <p class="small muted">Platí pro všechny trenéry. Podle sezóny se předvyplní datum dalšího tréninku, týden sezónního plánu, čas pro počasí, filtr v Historii a údaje na diplomech.</p>
  <div class="grid2">
   <div class="field"><span class="label">Název sezóny</span><input type="text" id="sea_name" data-c="seaname" value="${esc(s.name||'')}" placeholder="Sezóna ${y}"></div>
   <div class="field"><span class="label">Čas tréninku</span><input type="time" id="sea_time" data-c="seatime" value="${esc(s.time||'')}"></div>
   <div class="field"><span class="label">Začátek sezóny</span><input type="date" id="sea_from" data-c="seafrom" value="${esc(s.from||'')}"></div>
   <div class="field"><span class="label">Konec sezóny</span><input type="date" id="sea_to" data-c="seato" value="${esc(s.to||'')}"></div>
  </div>
  <div class="field"><span class="label">Tréninkové dny</span><div class="row" style="gap:6px">${[1,2,3,4,5,6,0].map(d=>{const on=days.includes(d);return `<button class="chip ${on?'on':''}" data-a="seaday" data-v="${d}" aria-pressed="${on}" title="${DOWL[d]}">${DOW[d]}</button>`}).join('')}</div></div>
  <div class="grid2">
   <div class="field"><span class="label">Týden 1 sezónního plánu</span><input type="date" id="sea_plan" data-c="seaplan" value="${esc(s.plan||'')}"><span class="small muted">${s.plan?'Týden '+(seasonWeek(today())||'–')+' z '+SEASON.length+' podle dnešního data.':'Od tohoto dne se počítá 10 týdnů plánu.'}</span></div>
   <div class="field"><span class="label">Datum na diplomech</span><input type="date" id="sea_dip" data-c="seadip" value="${esc(s.dip||'')}"><span class="small muted">${s.dip?'':'Když nevyplníš, dá se datum tisku.'}</span></div>
  </div>
  <div class="field winter"><span class="label">❄ Zimní příprava</span><p class="small muted">Část sezóny, kdy se trénuje jinak (např. v hale). Ve dnech zimní přípravy se použije tento rozvrh.</p>
   <div class="grid2"><div class="field"><span class="label">Začátek</span><input type="date" id="seaw_from" data-c="seawfrom" value="${esc(wi.from||'')}"></div>
   <div class="field"><span class="label">Konec</span><input type="date" id="seaw_to" data-c="seawto" value="${esc(wi.to||'')}"></div></div>
   <div class="field"><span class="label">Tréninkové dny v přípravě</span><div class="row" style="gap:6px">${[1,2,3,4,5,6,0].map(d=>{const on=(wi.days||[]).includes(d);return `<button class="chip ${on?'on':''}" data-a="seawday" data-v="${d}" aria-pressed="${on}" title="${DOWL[d]}">${DOW[d]}</button>`}).join('')}</div>${(wi.days||[]).length?'':'<span class="small muted">Když nevybereš, platí dny sezóny.</span>'}</div>
   <div class="grid2"><div class="field"><span class="label">Čas tréninku</span><input type="time" id="seaw_time" data-c="seawtime" value="${esc(wi.time||'')}"></div>
   <div class="field"><span class="label">Délka tréninku</span><select id="seaw_min" data-c="seawmin"><option value="">jako obvykle</option>${Object.keys(TPL).map(m=>`<option value="${m}" ${String(wi.minutes||'')===m?'selected':''}>${m} min</option>`).join('')}</select></div></div>
   <div class="field"><span class="label">Prostor</span><div class="seg">${[['hala','Hala'],['venku','Venku']].map(([k,l])=>`<button data-a="seawvenue" data-v="${k}" class="${(wi.venue||'hala')===k?'on':''}">${l}</button>`).join('')}</div></div>
   ${wi.from&&wi.to?`<p class="small">Zimní příprava ${fmtDate(wi.from)} – ${fmtDate(wi.to)}${inWinter(today())?' · <b>právě probíhá</b>':''}</p>`:''}</div>
  ${s.name?(W.seaConf?`<div class="note"><b>Začít ${esc(seaNext())}?</b><br><span class="small">Vymaže se začátek, konec, týden 1 plánu a datum na diplomech. Tréninkové dny a čas zůstanou. Staré tréninky zůstanou v Historii pod „${esc(s.name)}“.</span><div class="row" style="margin-top:8px"><button class="btn sm" data-a="seanext2">Začít novou sezónu</button><button class="btn ghost sm" data-a="seanextno">Zrušit</button></div></div>`:`<div class="row"><button class="btn ghost sm" data-a="seanextask">Začít novou sezónu…</button></div>`):`<div class="row"><button class="btn sm" data-a="seanew" data-v="${y}">Založit sezónu ${y}</button></div>`}</section>`}
function seaNext(){const n=SEA().name||'',m=n.match(/(\d{4})(?!.*\d{4})/),y=new Date().getFullYear();if(m){const ny=Math.max(+m[1]+1,y);return n.replace(/(\d{4})(?!.*\d{4})/,String(ny))}return 'Sezóna '+(y+1)}
document.addEventListener('change',e=>{const el=e.target,c=el.dataset&&el.dataset.c;if(!c||!/^seaw/.test(c))return;
 const k={seawfrom:'from',seawto:'to',seawtime:'time',seawmin:'minutes'}[c];if(!k)return;const v=(el.value||'').trim(),wi=Object.assign({},SEA().winter);
 if((k==='from'&&wi.to&&v&&v>wi.to)||(k==='to'&&wi.from&&v&&v<wi.from)){toast('Konec zimní přípravy musí být po začátku.');render(true);return}
 wi[k]=k==='minutes'?(+v||''):v;seaSave({winter:wi})});
document.addEventListener('change',e=>{const el=e.target,c=el.dataset&&el.dataset.c;if(!c||!/^sea/.test(c)||/^seaw/.test(c))return;
 const k={seaname:'name',seatime:'time',seafrom:'from',seato:'to',seaplan:'plan',seadip:'dip'}[c];if(!k)return;const v=(el.value||'').trim();
 if(k==='name'&&!v){toast('Sezóna musí mít název.');render(true);return}
 if((k==='from'&&SEA().to&&v&&v>SEA().to)||(k==='to'&&SEA().from&&v&&v<SEA().from)){toast('Konec sezóny musí být po začátku.');render(true);return}
 seaSave({[k]:v})});

/* ---------- Nastavení (web) ---------- */
function vSet(){
 const t=team(),adm=W.role==='admin';
 let h=`<section class="card"><div class="sumline"><h2>Účet</h2><button class="btn ghost sm" data-a="wlogout">Odhlásit</button></div>
  <p class="small">Přihlášen jako <b>${esc(whoLabel())}</b>${W.code?` · ${W.role==='admin'?'kód správce':W.coachId?'osobní kód':'společný kód'} ${esc(W.code.slice(0,4))}-••••`:''} · ${W.online?'online':'offline, změny se uloží po připojení'}</p>
  ${W.coachId&&W.role!=='admin'?'<p class="small muted">Vidíš jen týmy, u kterých tě správce zaškrtl. Vzhled a hlasová hlášení se ukládají k tvému profilu, takže je máš stejné v každém zařízení.</p>':''}</section>`;
 if(adm){const cc=coachCodes();if(W.pins===null){W.pins=undefined;loadPins()}
  h+=`<h2 class="sect">Správa <span class="small muted">jen správce</span></h2><section class="card"><h2>Společný kód pro trenéry</h2>
  <p class="small muted">Platí pro trenéry, kteří ještě nemají osobní kód, a vidí s ním všechny týmy. Osobní kódy vytváříš níže v seznamu Trenéři. Až budou mít všichni svůj, společný kód zruš.</p>
  ${W.pins===undefined?'<p class="small muted">Načítám…</p>':cc.length?`<div class="row">${cc.map(c=>`<code class="code">${esc(c)}</code>`).join(' ')}</div>`:'<p class="small">Zatím žádný kód.</p>'}
  <div class="row"><button class="btn sm" data-a="wpinnew">${cc.length?'Vyměnit kód':'Vytvořit kód'}</button>${cc.length?'<button class="btn ghost sm" data-a="wpindrop">Zrušit kód</button>':''}<button class="btn ghost sm" data-a="wcopy" data-v="${esc(baseUrl())}">Kopírovat odkaz na plánovač</button></div>
  ${W.pinMsg?`<p class="small"><b>${esc(W.pinMsg)}</b></p>`:''}<p class="small muted">„Vyměnit kód“ zruší starý společný kód a kdo s ním byl přihlášený, bude se muset přihlásit novým. Osobních kódů se to netýká.</p></section>`}
 if(adm)h+=`<section class="card"><div class="sumline"><h2>Týmy</h2></div>
  ${Object.keys(S.teams).length?`<div class="row">${Object.entries(S.teams).sort((a,b)=>(a[1].name||'').localeCompare(b[1].name||'')).map(([id,x])=>`<button class="chip ${id===S.teamId?'on':''}" data-a="team" data-v="${esc(id)}">${esc(x.name)} · ${(x.players||[]).length}</button>`).join('')}</div>`:`<p class="muted">${S.ready?'Ve Scorekeeperu zatím není žádný tým.':'Načítám týmy…'}</p>`}
  <p class="small muted">Týmy jsou společné se Scorekeeperem. Soupisku upravíš v záložce Tým, nový tým založíš ve Scorekeeperu.</p>
  ${Object.keys(S.teams).length?`<div class="field"><span class="label">Export do Excelu</span><div class="row"><button class="btn ghost sm" data-a="xlsone">⬇ ${esc(team()?team().name:'')}</button>${Object.keys(S.teams).length>1?'<button class="btn ghost sm" data-a="xlsall">⬇ Všechny týmy</button>':''}</div><span class="small muted">Jméno, kategorie a úroveň dětí. Všechny týmy = jeden list se sloupcem Tým.</span></div>`:''}</section>`;
 if(adm)h+=vSeaSet()+vLogins()+'<h2 class="sect">Trenéři a aplikace</h2>';
 if(t)h+=vStaff();
 h+=`${tplList().length?`<section class="card"><h2>Šablony tréninku</h2><div class="dl">${tplList().map(([id,tp])=>`<div class="sumline"><span><b>${esc(tp.name)}</b> · ${tplMin(tp)} min<br><span class="small muted">${tp.blocks.map(b=>BT[b.type]||b.type).join(' → ')}</span></span>${S.confirm==='t_'+id?`<span class="row"><button class="btn danger sm" data-a="tpldel" data-v="${esc(id)}">Smazat</button><button class="btn ghost sm" data-a="noconf">Ne</button></span>`:`<button class="ib" data-a="tplask" data-v="${esc(id)}" aria-label="Smazat šablonu ${esc(tp.name)}">✕</button>`}</div>`).join('')}</div></section>`:''}
 <section class="card"><h2>Aplikace v tomto telefonu</h2>
  <div class="field"><span class="label">Vzhled</span><select id="pf_theme" data-c="theme">${[['','podle telefonu'],['light','světlý'],['dark','tmavý'],['sun','na slunce (vysoký kontrast)']].map(([v,l])=>`<option value="${v}" ${(S.pref.theme||'')===v?'selected':''}>${l}</option>`).join('')}</select></div>
  <label class="row"><input type="checkbox" id="pf_wake" data-c="wake" ${S.pref.wake!==false?'checked':''}> Během tréninku na hřišti nenechat obrazovku zhasnout</label>
  ${voiceSet()}
  ${wxSet()}
  <p class="small muted">Aplikaci si můžeš přidat na plochu telefonu (v prohlížeči Sdílet → Přidat na plochu). Tlačítko ☀ nahoře zapne režim na slunce.</p></section>`;
 h+=`<p class="small muted ver">Tréninkový plánovač U7 · ${verTxt()} · ${new Date(APP_DATE).toLocaleDateString('cs-CZ')}</p>`;
 return h}
Object.assign(actions,{
 sumwa:()=>{const el=document.querySelector('#sheet .partxt');if(el)shareWA(el.textContent)},
 parwa:()=>{const t=$('#parentsTxt');if(t)shareWA(t.value)},
 sumcopy:async()=>{const el=document.querySelector('#sheet .partxt');if(!el)return;try{await navigator.clipboard.writeText(el.textContent);toast('Zkopírováno. Vlož do skupiny rodičů.')}catch(e){toast('Text se nepodařilo zkopírovat.')}},
 pubt:v=>{const p=S.plan;if(!p)return;const s=pubSel(p).slice(),i=s.indexOf(v);if(i>=0)s.splice(i,1);else s.push(v);PUBT[p.id]=s;render(true)},
 xlsone:()=>exportXls([S.teamId]),xlsall:()=>exportXls(Object.keys(S.teams).sort((a,b)=>tName(a).localeCompare(tName(b),'cs'))),
 pubgo:()=>pubPlan(),pubdel:()=>unpubPlan(),pexp:v=>{PEXP[v]=1;renderParentPage()},
 seawday:v=>{const wi=Object.assign({},SEA().winter),ds=(wi.days||[]).slice(),d=+v,i=ds.indexOf(d);if(i>=0)ds.splice(i,1);else ds.push(d);wi.days=ds.sort();seaSave({winter:wi})},
 seawvenue:v=>seaSave({winter:Object.assign({},SEA().winter,{venue:v})}),
 seaday:v=>{const d=+v,ds=(SEA().days||[]).slice();const i=ds.indexOf(d);if(i>=0)ds.splice(i,1);else ds.push(d);seaSave({days:ds.sort()})},
 seanextask:()=>{W.seaConf=true;render(true)},seanextno:()=>{W.seaConf=false;render(true)},
 seanext2:()=>{const nm=seaNext();W.seaConf=false;S.hist.sea=true;seaSave({name:nm,from:'',to:'',plan:'',dip:'',winter:Object.assign({},SEA().winter,{from:'',to:''})});toast(nm+' začala.')},
 seanew:v=>seaSave({name:'Sezóna '+v,days:SEA().days||[],time:SEA().time||''}),
 wxgeo:()=>{if(!navigator.geolocation){toast('Telefon polohu nepodporuje.');return}navigator.geolocation.getCurrentPosition(pos=>{S.pref.wx=Object.assign({},S.pref.wx,{lat:+pos.coords.latitude.toFixed(3),lon:+pos.coords.longitude.toFixed(3),name:'u tebe (poloha telefonu)'});savePref();WX.at=0;toast('Poloha uložena.');render(true)},()=>toast('Polohu se nepodařilo zjistit.'),{timeout:10000})},
 wxreset:()=>{const h=wxPref().h;S.pref.wx={h};savePref();WX.at=0;render(true)},
 wlogout:()=>Web.logout(''),
 wpinnew:()=>newCoachPin(),wpindrop:()=>dropCoachPins(),
 wcopy:async v=>{try{await navigator.clipboard.writeText(v);toast('Odkaz zkopírován.')}catch(e){toast(v)}},
 wrdel:v=>{const tid=S.teamId,R=rosterOf(tid);R.players=R.players.filter(p=>String(p.num)!==v);rosterSave(tid,R);W.rmsg='';render(true)},
 wrass:v=>{W.assign=v;W.rmove=null;W.rmsg='';render(true);const f=$('#w_assnum');if(f&&f.focus)f.focus()},wrassno:()=>{W.assign=null;render(true)},
 wrmv:v=>{W.rmove=v;W.assign=null;W.rmsg='';render(true)},wrmvno:()=>{W.rmove=null;render(true)},wrmvgo:v=>movePlayerW(v==='1'),
 whot:v=>{let t=whoTeams().slice();const i=t.indexOf(v);if(i>=0){if(t.length>1)t.splice(i,1)}else t.push(v);WHO.teams=t;whoSave();render(true)},
 whosz:v=>{WHO.size=v;whoSave();render(true)},
 whoopen:v=>{W.phMsg='';W.phDel=null;openWho(v)},whodel:v=>{W.phDel=v;openWho(v)},whodelno:v=>{W.phDel=null;openWho(v)},
 whodelgo:v=>{const x=kid(v);W.phDel=null;photoSet(x.tid,x.num,null);openWho(v);if(S.tab==='who')render(true);toast('Fotka odebrána.')},
 whokid:v=>{const x=kid(v);if(S.teamId!==x.tid){S.teamId=x.tid;ls.set('u7-team',x.tid)}openKid(x.num)},
 stteam:(v,el)=>{const list=clone(staffList()),c=list.find(x=>x.id===v),t=el.dataset.t;if(!c)return;c.teams=c.teams||[];const i=c.teams.indexOf(t);if(i>=0)c.teams.splice(i,1);else c.teams.push(t);staffSave(list)},
 stdel:v=>{W.sdel=v;render(true)},stdelno:()=>{W.sdel=null;render(true)},stdelgo:v=>{W.sdel=null;if(W.role==='admin')dropPersonalPin(v,true);staffSave(clone(staffList()).filter(c=>c.id!==v));toast('Trenér odebrán.')},
 pinnew:v=>newPersonalPin(v),pinsend:v=>sendPin(v),pindrop:v=>{W.pdel=v;render(true)},pindropno:()=>{W.pdel=null;render(true)},pindropgo:v=>dropPersonalPin(v),
 lgload:()=>{W.logins=undefined;render(true);loadLogins()},lgmore:()=>{W.lgMore=true;render(true)}
});
