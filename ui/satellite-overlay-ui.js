/* Root controller owns visibility. Tokens prevent late hide messages from undoing a new Home press. */
var satelliteShown=false,satelliteGeneration=0,satellitePulseTimer=0,satelliteEvents=null,satelliteHidePromise=null;
// webOS 5 uses arrays for key masks, but JSON strings for pointer regions.
function satelliteInputCall(name,value){
  try{webOSSystem[name](value);return true}catch(e){
    try{webOSSystem[name](JSON.stringify(value));return true}catch(ignore){return false}
  }
}
function satelliteInput(visible){
  // Visible overlays forward programme keys to Live TV; hidden windows take no keys.
  var keys=visible?['KeyMaskBack','KeyMaskExit','KeyMaskLeft','KeyMaskRight','KeyMaskUp','KeyMaskDown','KeyMaskOk','KeyMaskRed','KeyMaskGreen','KeyMaskYellow','KeyMaskBlue','KeyMaskProgramme']:[];
  satelliteInputCall('setKeyMask',keys);
  satelliteInputCall('setInputRegion',[{x:0,y:0,width:visible?window.innerWidth:0,height:visible?window.innerHeight:0}]);
}
// hide() is ignored by WAM unless KeepAlive is enabled. Keep the process, unmap its window.
try{webOSSystem.keepAlive(true)}catch(ignore){}
satelliteInput(false);
function satelliteRequest(action,generation){
  return fetch(API+'/satellite/'+action+(generation===undefined?'':'?generation='+generation),{method:'POST',body:'{}'})
    .then(function(r){return r.json()});
}
function satelliteParams(){try{return JSON.parse(webOSSystem.launchParams||'{}')}catch(e){return {}}}
function satelliteOff(s){
  if(s.show||s.generation<satelliteGeneration)return;
  satelliteGeneration=s.generation;satelliteShown=false;
  clearTimeout(satellitePulseTimer);
  if(satelliteEvents){satelliteEvents.close();satelliteEvents=null}
  clearTimeout(downT);downEnter=false;held=false;closeMenus();
  document.documentElement.classList.add('sat-off');
  satelliteInput(false);
  var target=API+'/satellite/hidden?generation='+satelliteGeneration;
  try{
    if(navigator.sendBeacon)navigator.sendBeacon(target,'{}');
    else satelliteRequest('hidden',satelliteGeneration).catch(function(){});
  }catch(e){satelliteRequest('hidden',satelliteGeneration).catch(function(){})}
  try{webOSSystem.hide()}catch(e){try{window.close()}catch(ignore){}}
}
function satelliteHide(){
  if(!satelliteShown)return Promise.resolve();
  var token=satelliteGeneration;
  satelliteHidePromise=satelliteRequest('dismiss',token).then(function(s){
    if(s.generation>=satelliteGeneration&&!s.show)satelliteOff(s);
  }).catch(function(){document.documentElement.classList.add('sat-off');try{window.close()}catch(e){}});
  return satelliteHidePromise;
}
function satellitePulse(){
  clearTimeout(satellitePulseTimer);if(!satelliteShown)return;
  satelliteRequest('pulse',satelliteGeneration).then(function(s){if(!s.show)satelliteOff(s)}).catch(satelliteHide);
  satellitePulseTimer=setTimeout(satellitePulse,250);
}
function satelliteReveal(s){
  if(!s.show){satelliteOff(s);return}
  if(s.generation<satelliteGeneration)return;
  satelliteGeneration=s.generation;satelliteShown=true;downEnter=false;held=false;
  satelliteInput(true);
  document.documentElement.classList.remove('sat-off');
  try{webOSSystem.activate()}catch(e){}
  if(satelliteEvents)satelliteEvents.close();
  satelliteEvents=new EventSource(API+'/satellite/events');
  satelliteEvents.onmessage=function(e){try{var x=JSON.parse(e.data);if(!x.show)satelliteOff(x)}catch(ignore){}};
  requestAnimationFrame(function(){requestAnimationFrame(function(){if(satelliteShown)satelliteRequest('paint',satelliteGeneration).catch(function(){})})});
  satellitePulse();
}
function satelliteLaunch(){
  var p=satelliteParams();
  if(p.prewarm){satelliteRequest('park').then(function(s){
    if(s.show)return satelliteRequest('ready',s.generation).then(satelliteReveal);
    satelliteOff(s);
  }).catch(function(){try{webOSSystem.hide()}catch(e){}});return}
  satelliteRequest('ready',p.generation).then(satelliteReveal).catch(function(){try{window.close()}catch(e){}});
}
document.addEventListener('webOSRelaunch',satelliteLaunch);
document.addEventListener('keydown',function(e){
  if(!satelliteShown)return;
  var k=e.keyCode,up=k===33||k===427,down=k===34||k===428;
  if(!up&&!down)return;
  e.preventDefault();e.stopImmediatePropagation();
  satelliteRequest(up?'channel-up':'channel-down',satelliteGeneration).catch(function(){});
},true);
satelliteLaunch();
