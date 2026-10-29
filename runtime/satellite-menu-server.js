'use strict';
// Keep the menu web process resident; the native tuner owns the video and audio throughout.
const http=require('http'),fs=require('fs');
const D='/media/developer/cleanyourtv',luna=require(D+'/luna'),exec=require(D+'/exec');
const ID='com.cleanyourtv.satellitehome',BINDS='/home/root/.config/lginputhook/keybinds.json';
const COMMAND='sh '+D+'/satellite-home-key.sh';
let show=false,generation=Date.now(),hiddenGeneration=0,resident=false,lastPulse=0,lastToggle=0;
let busy=false,warming=false,monitoring=false,lastVideo=null,lastOpen=null,lastWarmAttempt=0;
const timings=[],streams=new Set();
let loading=null,loadingDelay=0;
const SPINNER='luna://com.webos.surfacemanager/showSpinner';
const BOOTSTRAP_OWNER=ID+'.bootstrap',BOOTSTRAP_MARKER='/tmp/cleanyourtv-menu-bootstrap-spinner';
function log(s){console.log(new Date().toISOString()+' '+s)}
function enabled(){return fs.existsSync(D+'/satellite-menu-enabled')&&!fs.existsSync(D+'/DISABLE')}
function state(){return {returnValue:true,mode:'resident',show,generation,hiddenGeneration,resident,lastPulse,lastVideo,lastOpen,timings,loading:loading?loading.owner:null}}
function stopLoading(includeBootstrap){
  clearTimeout(loadingDelay);loadingDelay=0;
  const item=loading;loading=null;
  if(item){item.canceled=true;item.promise.then(()=>luna(SPINNER,{show:false,owner:item.owner}));log('loading indicator stopped '+item.owner)}
  if(includeBootstrap!==false&&fs.existsSync(BOOTSTRAP_MARKER)){
    try{fs.unlinkSync(BOOTSTRAP_MARKER)}catch(e){}
    luna(SPINNER,{show:false,owner:BOOTSTRAP_OWNER});
  }
}
function prepareLoading(token,cold){
  stopLoading(false);
  loadingDelay=setTimeout(()=>{
    if(!show||generation!==token||!lastOpen||lastOpen.frameMs!==null)return;
    const item={owner:ID+'.loading.'+token,generation:token,canceled:false,promise:null};
    loading=item;
    // Separate process clears only this indicator even if the controller exits.
    exec.detached('sleep 8; luna-send -n 1 -w 2000 '+SPINNER+" '"+JSON.stringify({show:false,owner:item.owner})+"' </dev/null >/dev/null 2>&1");
    item.promise=luna(SPINNER,{show:true,owner:item.owner}).then(r=>{
      if(r.returnValue!==false){if(lastOpen&&generation===token)lastOpen.loadingIndicator=true;log('LG loading indicator '+item.owner)}
      if(item.canceled||generation!==token||!show||(lastOpen&&lastOpen.frameMs!==null))luna(SPINNER,{show:false,owner:item.owner});
      return r;
    });
  },cold?0:250);
}
function publish(){const data='data: '+JSON.stringify({show,generation})+'\n\n';for(const r of streams){try{r.write(data)}catch(e){streams.delete(r)}}}
function bind(){
  if(!enabled())return;
  try{
    const b=JSON.parse(fs.readFileSync(BINDS,'utf8'));
    if(b['773']&&b['773'].command===COMMAND)return;
    b['773']={action:'exec',command:COMMAND};
    fs.writeFileSync(BINDS+'.satellite.tmp',JSON.stringify(b));fs.renameSync(BINDS+'.satellite.tmp',BINDS);
  }catch(e){log('Home bind failed: '+e.message)}
}
async function video(){
  const s=await luna('luna://com.webos.service.videooutput/getStatus',{});
  return (s.video||[]).filter(v=>v.connected&&v.appId==='com.webos.app.livetv')[0]||null;
}
async function terminate(reason){
  stopLoading();
  show=false;generation++;publish();resident=false;
  const r=await luna('luna://com.webos.applicationManager/closeByAppId',{id:ID});
  log('terminated '+reason+' '+JSON.stringify(r));return state();
}
function hide(reason){
  stopLoading();
  if(!show)return state();
  show=false;generation++;const requested=generation;publish();
  log('hide '+reason+' generation='+requested);
  // A frozen page must not retain the remote. Normal hides acknowledge without terminating.
  setTimeout(()=>{
    if(!show&&generation===requested&&hiddenGeneration!==requested)terminate('hide acknowledgement missing');
  },1200);
  return state();
}
async function toggle(force){
  if(busy||Date.now()-lastToggle<350)return state();
  lastToggle=Date.now();
  if(show&&force!==true)return hide('Home');
  busy=true;
  lastOpen={requested:Date.now(),checksMs:null,launchMs:null,readyMs:null,frameMs:null,residentHint:resident};
  try{
    const checks=await Promise.all([luna('luna://com.webos.applicationManager/getForegroundAppInfo',{}),video(),luna('luna://com.palm.webappmanager/listRunningApps',{})]);
    const fg=checks[0],v=checks[1];lastOpen.checksMs=Date.now()-lastOpen.requested;
    if(Array.isArray(checks[2].running))resident=checks[2].running.some(a=>a.id===ID);
    lastOpen.residentHint=resident;
    if(!v||fg.appId!=='com.webos.app.livetv'){
      hide('another input');
      return await luna('luna://com.webos.applicationManager/launch',{id:'com.webos.app.home',params:{launchType:'homeKey'}});
    }
    lastVideo={context:v.context,connected:v.connected,muted:v.muted};
    show=true;generation++;lastPulse=Date.now();
    const token=generation;
    prepareLoading(token,!resident);
    const r=await luna('luna://com.webos.applicationManager/launch',{id:ID,params:{satelliteMenu:true,generation:token}});
    lastOpen.launchMs=Date.now()-lastOpen.requested;
    if(r.returnValue===false&&generation===token){show=false;stopLoading()}
    log('show generation='+token+' '+JSON.stringify(lastVideo)+' '+JSON.stringify(r));
    return Object.assign({},state(),r);
  }finally{busy=false}
}
async function prewarm(force){
  if(!enabled()||show||busy||warming||(!force&&Date.now()-lastWarmAttempt<15000))return state();
  warming=true;lastWarmAttempt=Date.now();
  try{
    const power=await luna('luna://com.webos.service.tvpower/power/getPowerState',{});
    if(power.state!=='Active')return state();
    const fg=await luna('luna://com.webos.applicationManager/getForegroundAppInfo',{});
    if(fg.appId!=='com.webos.app.livetv')return state();
    const running=await luna('luna://com.palm.webappmanager/listRunningApps',{});
    resident=(running.running||[]).some(a=>a.id===ID);
    if(!resident){
      const r=await luna('luna://com.webos.applicationManager/launch',{id:ID,params:{prewarm:true,generation}});
      log('prewarm hidden '+JSON.stringify(r));
    }
    return state();
  }finally{warming=false}
}
const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&origin!=='null'&&origin!=='file://'&&origin!=='file://'+ID+'-webos'){
    res.writeHead(403);return res.end('Origin refused');
  }
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin==='null'?'null':'*');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  const path=req.url.split('?')[0],match=/[?&]generation=(\d+)/.exec(req.url),token=match?Number(match[1]):null;
  function reply(data,code){res.writeHead(code||200,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
  try{
    if(path.indexOf('/satellite/')===0){
      if(path==='/satellite/status')return reply(state());
      if(path==='/satellite/events'&&req.method==='GET'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
        res.write('data: '+JSON.stringify({show,generation})+'\n\n');streams.add(res);
        res.on('close',()=>streams.delete(res));return;
      }
      if(req.method!=='POST')return reply({error:'POST required'},405);
      req.resume();
      if(path==='/satellite/toggle')return reply(await toggle());
      if(path==='/satellite/show')return reply(await toggle(true));
      if(path==='/satellite/hide')return reply(hide('request'));
      if(path==='/satellite/terminate')return reply(await terminate('request'));
      if(path==='/satellite/prewarm')return reply(await prewarm(true));
      if(path==='/satellite/channel-up'||path==='/satellite/channel-down'){
        if(!show||token!==generation)return reply({returnValue:false,errorText:'Menu is not visible'},409);
        const fg=await luna('luna://com.webos.applicationManager/getForegroundAppInfo',{});
        if(fg.appId!=='com.webos.app.livetv')return reply({returnValue:false,errorText:'Live TV is not foreground'},409);
        // Same press/release messages used by LG's own floating TV toolbar.
        const key=path==='/satellite/channel-up'?18874401:18874402;
        const pressed=await luna('luna://com.webos.applicationManager/launch',{id:'com.webos.app.livetv',params:{id:'sendKeyPress',key}});
        const released=await luna('luna://com.webos.applicationManager/launch',{id:'com.webos.app.livetv',params:{id:'sendKeyRelease',key}});
        log('programme key '+key+' '+JSON.stringify({pressed,released}));
        return reply({returnValue:pressed.returnValue!==false&&released.returnValue!==false});
      }
      if(path==='/satellite/dismiss'){
        if(token===generation&&show)hide('Back or Live TV');
        return reply(state());
      }
      if(path==='/satellite/hidden'){
        if(token===generation&&!show){hiddenGeneration=token;resident=true;lastPulse=0;log('hidden acknowledged generation='+token)}
        return reply(state());
      }
      if(path==='/satellite/park'){
        resident=true;return reply(state());
      }
      if(path==='/satellite/ready'){
        resident=true;
        if(show&&token===generation&&lastOpen&&Date.now()-lastOpen.requested<5000){
          lastPulse=Date.now();
          if(lastOpen.readyMs===null){lastOpen.readyMs=Date.now()-lastOpen.requested;timings.push(lastOpen);if(timings.length>12)timings.shift()}
        }
        return reply(state());
      }
      if(path==='/satellite/paint'){
        if(show&&token===generation&&lastOpen&&lastOpen.frameMs===null){
          lastOpen.frameMs=Date.now()-lastOpen.requested;log('timing '+JSON.stringify(lastOpen));
          stopLoading();
        }
        return reply(state());
      }
      if(path==='/satellite/pulse'){
        if(show&&token===generation){
          if(Date.now()-lastPulse>10000)hide('resume after long pause');else lastPulse=Date.now();
        }
        return reply(state());
      }
      return reply({error:'Unknown action'},404);
    }
    if(path.indexOf('/api/')!==0&&path.indexOf('/icon/')!==0)return reply({error:'Not found'},404);
    const headers={};['content-type','content-length'].forEach(k=>{if(req.headers[k])headers[k]=req.headers[k]});
    const upstream=http.request({host:'127.0.0.1',port:8765,path:req.url,method:req.method,headers},r=>{
      Object.keys(r.headers).forEach(k=>{if(k.indexOf('access-control-')!==0)res.setHeader(k,r.headers[k])});
      res.writeHead(r.statusCode);r.pipe(res);
    });
    upstream.on('error',e=>{if(!res.headersSent)reply({error:e.message},502);else res.end()});
    upstream.setTimeout(15000,()=>upstream.destroy());req.pipe(upstream);
  }catch(e){log(e.stack||String(e));if(!res.headersSent)reply({error:e.message},500);else res.end()}
});
server.listen(18767,'127.0.0.1',()=>{bind();log('resident mode; menu opens only by Home');setTimeout(prewarm,10000)});
setInterval(bind,30000);setInterval(prewarm,30000);
setInterval(async()=>{
  if(monitoring||!show)return;monitoring=true;
  try{
    if(!enabled()){await terminate('disabled');return}
    const power=await luna('luna://com.webos.service.tvpower/power/getPowerState',{});
    if(power.state&&power.state!=='Active'&&power.state!=='Screen Saver'){await terminate('standby');return}
    if(Date.now()-lastPulse>10000){await terminate('page unresponsive');return}
    const fg=await luna('luna://com.webos.applicationManager/getForegroundAppInfo',{});
    if(fg.returnValue!==false&&fg.appId!=='com.webos.app.livetv')hide('foreground changed');
  }finally{monitoring=false}
},2500);
process.on('unhandledRejection',e=>log(String(e)));
