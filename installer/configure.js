'use strict';
// Node 8 compatible. Config writes go through the upstream service, never config.json.
var fs=require('fs'),http=require('http'),path=require('path'),crypto=require('crypto');
var D='/media/developer/cleanyourtv',B=D+'/backup/cleanyourtvlg';
var COMMAND='sh '+D+'/satellite-home-key.sh',BINDS='/home/root/.config/lginputhook/keybinds.json';
var marker='Home key only; suppress automatic powerOn and preload requests.\n';
function digest(s){return crypto.createHash('sha256').update(s).digest('hex')}
function patchHome(standin,hook){
  var a='  p=$(params "$1" "$2")\n',b='  (\n    sleep 3\n    fg=';
  if(standin.indexOf('# USER_HOME_ON_DEMAND:')<0){
    if(standin.split(a).length!==2)throw Error('Unsupported Home stand-in; no changes made');
    standin=standin.replace(a,a+
      '  # USER_HOME_ON_DEMAND: keep automatic preload/powerOn launches invisible.\n'+
      '  if [ -e "$L/NO-AUTO-HOME" ] && printf \'%s\\n\' "$2" "$p" | grep -Eq \'"activateType"[[:space:]]*:[[:space:]]*"powerOn"|"reason"[[:space:]]*:[[:space:]]*"preload"|"preload"[[:space:]]*:\'; then\n'+
      '    log "automatic Home request suppressed ($1)"\n    return 0\n  fi\n');
  }
  if(hook.indexOf('# USER_HOME_ON_DEMAND:')<0){
    if(hook.split(b).length!==2)throw Error('Unsupported Home boot hook; no changes made');
    hook=hook.replace(b,'  (\n    # USER_HOME_ON_DEMAND: a hidden launcher is intentional.\n'+
      '    [ -e "$L/NO-AUTO-HOME" ] && exit 0\n    sleep 3\n    fg=');
  }
  return {standin:standin,hook:hook};
}
function nativeTopbar(bar){
  var found=false,out=(bar||[]).map(function(item){
    if(item.action==='live'||item.app==='com.webos.app.livetv'){
      found=true;return {label:'Live TV',icon:'tv',app:'com.webos.app.livetv'};
    }return item;
  });
  if(!found)out.push({label:'Live TV',icon:'tv',app:'com.webos.app.livetv'});
  return out;
}
function restoreBinding(current,original){
  if(current['773']&&current['773'].command===COMMAND){
    if(original===null)delete current['773'];else current['773']=original;
  }return current;
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function api(url,body){return new Promise(function(resolve,reject){
  var data=body===undefined?null:JSON.stringify(body),settled=false;
  function fail(e){if(!settled){settled=true;reject(e)}}
  var q=http.request({host:'127.0.0.1',port:8765,path:url,method:data===null?'GET':'POST',
    headers:data===null?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},function(r){
    var text='';r.on('data',function(c){text+=c});r.on('aborted',function(){fail(Error('Response aborted'))});r.on('error',fail);
    r.on('end',function(){if(settled)return;try{
      var v=JSON.parse(text);if(r.statusCode!==200||v.returnValue===false||v.error)throw Error(url+' failed: '+r.statusCode);
      settled=true;resolve(v);
    }catch(e){fail(e)}});
  });q.setTimeout(8000,function(){q.destroy(Error('API timeout'))});q.on('error',fail);q.end(data||undefined);
})}
function atomic(file,data){fs.writeFileSync(file+'.cytvlg.tmp',data);fs.renameSync(file+'.cytvlg.tmp',file)}
async function main(action,stage){
  if(action==='prepare'){
    var original={standin:fs.readFileSync(D+'/home-standin.sh','utf8'),hook:fs.readFileSync(D+'/10-cleanyourtv-home','utf8')};
    var proposed=patchHome(original.standin,original.hook);
    fs.writeFileSync(path.join(stage,'home-standin.sh'),proposed.standin);
    fs.writeFileSync(path.join(stage,'10-cleanyourtv-home'),proposed.hook);
    var version=await api('/api/version');if(version.version!=='1.6.10')throw Error('CleanYourTV 1.6.10 is required; found '+version.version);
    var apps=await api('/api/apps'),binds=JSON.parse(fs.readFileSync(BINDS,'utf8'));
    var snap={homeBinding:binds['773']||null,topbar:apps.config.topbar||[],
      liveTv:!!(apps.config.options&&apps.config.options.liveTv),
      noAutoHome:fs.existsSync(D+'/NO-AUTO-HOME'),
      installedTopbar:nativeTopbar(apps.config.topbar),
      standinHash:digest(proposed.standin),hookHash:digest(proposed.hook)};
    fs.writeFileSync(path.join(stage,'state.json'),JSON.stringify(snap,null,2));
    console.log('Preflight passed: upstream version, Home script anchors and config are supported.');return;
  }
  var state=JSON.parse(fs.readFileSync(B+'/state.json','utf8'));
  if(action==='apply'){
    var current=await api('/api/apps');
    await api('/api/manager/options',{liveTv:false});
    current=await api('/api/apps');current.config.topbar=nativeTopbar(current.config.topbar);
    await api('/api/config',current.config);
    var keys=JSON.parse(fs.readFileSync(BINDS,'utf8'));keys['773']={action:'exec',command:COMMAND};atomic(BINDS,JSON.stringify(keys));
    if(!fs.existsSync(D+'/NO-AUTO-HOME'))fs.writeFileSync(D+'/NO-AUTO-HOME',marker);
    console.log('Native Live TV button and Home key configured.');return;
  }
  if(action==='restore'){
    var keys=JSON.parse(fs.readFileSync(BINDS,'utf8'));atomic(BINDS,JSON.stringify(restoreBinding(keys,state.homeBinding)));
    [['home-standin.sh','standinHash'],['10-cleanyourtv-home','hookHash']].forEach(function(pair){
      var file=D+'/'+pair[0];
      if(digest(fs.readFileSync(file))===state[pair[1]])fs.writeFileSync(file,fs.readFileSync(B+'/'+pair[0]));
      else console.log('Kept externally changed '+pair[0]+'; original is in '+B);
    });
    if(!state.noAutoHome&&fs.existsSync(D+'/NO-AUTO-HOME')&&fs.readFileSync(D+'/NO-AUTO-HOME','utf8')===marker)fs.unlinkSync(D+'/NO-AUTO-HOME');
    try{
      var current=await api('/api/apps');
      if(same(current.config.topbar,state.installedTopbar)){current.config.topbar=state.topbar;await api('/api/config',current.config)}
      else console.log('Kept a topbar changed after installation.');
      if(current.config.options&&current.config.options.liveTv===false)await api('/api/manager/options',{liveTv:state.liveTv});
    }catch(e){console.error('Config restore incomplete: '+e.message);process.exitCode=1}
    return;
  }
  throw Error('Unknown action: '+action);
}
module.exports={patchHome:patchHome,nativeTopbar:nativeTopbar,restoreBinding:restoreBinding,digest:digest};
if(require.main===module)main(process.argv[2],process.argv[3]).catch(function(e){console.error(e.message);process.exitCode=1});
