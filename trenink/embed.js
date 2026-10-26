/* Eagles U7 · napojení Tréninku na společnou aplikaci.
   Aktivní jen tehdy, když stránka běží uvnitř Eagles U7 (index.html o složku výš).
   Otevřená samostatně (např. odkaz pro rodiče ?rodice=…) se chová jako dřív.
   Soubor se do sestavení nekopíruje, build_web.py na něj jen odkazuje. */
(function(){
  var E=null;try{if(window.top!==window&&window.top.EGL)E=window.top.EGL}catch(e){}
  if(!E)return;
  document.documentElement.classList.add('egl');
  window.egClear=function(){try{if(W.fb&&W.uid)W.fb.db.ref('claims/'+W.uid).remove()}catch(e){}};
  Web.logout=function(msg){if(!msg)window.egClear();E.out('trenink',msg||'')};
  renderLogin=function(){E.out('trenink',W.msg||'Přihlášení do tréninku vypršelo.')};
  var at=actions.team;
  actions.team=function(v){at(v);try{E.team('trenink',v)}catch(e){}};
  window.egSetTeam=function(tid){
    if(!tid||tid===S.teamId)return;
    if(!S.teams[tid]){ls.set('u7-team',tid);return}
    at(tid)};
  E.ready('trenink');
})();
