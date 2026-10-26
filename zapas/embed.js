/* Eagles U7 · napojení Zápasu na společnou aplikaci.
   Aktivní jen tehdy, když stránka běží uvnitř Eagles U7 (index.html o složku výš).
   Otevřená samostatně (např. odkaz pro rodiče ?tym=…) se chová jako dřív.
   Přihlášení a odhlášení řeší společná aplikace, tady se jen předává:
   - odhlášení tlačítkem → odhlásit celou aplikaci
   - odhlášení se zprávou (kód neplatí, odebraný přístup) → společná aplikace kód ověří
   - změna týmu → společná aplikace ji přepošle Tréninku */
(function(){
  var E=null;try{if(window.top!==window&&window.top.EGL)E=window.top.EGL}catch(e){}
  if(!E)return;
  document.documentElement.classList.add('egl');
  window.egClear=function(){try{if(FBX&&WEB.uid)FBX.db.ref('claims/'+WEB.uid).remove()}catch(e){}};
  logout=function(msg){if(!msg)window.egClear();E.out('zapas',msg||'')};
  renderLogin=function(){E.out('zapas',WEB.msg||'Přihlášení do zápisu vypršelo.')};
  var lt=loadTeam;
  loadTeam=function(tid){lt(tid);try{E.team('zapas',tid)}catch(e){}};
  window.egSetTeam=function(tid){
    if(!tid||tid===TEAMS.cur||!TEAMS.list.some(function(t){return t.id===tid})||!myTeam(tid))return;
    switchTeam(tid)};
  E.ready('zapas');
})();
