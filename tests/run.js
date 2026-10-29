'use strict';
var assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
var root=path.join(__dirname,'..'),cfg=require('../installer/configure');
function configuration(){
  var a='#!/bin/sh\nshow() {\n  p=$(params "$1" "$2")\n  echo yes\n}\n';
  var b='#!/bin/sh\nif true; then\n  (\n    sleep 3\n    fg=yes\n  ) &\nfi\n';
  var p=cfg.patchHome(a,b);
  assert(p.standin.indexOf('powerOn')>=0);assert(p.hook.indexOf('NO-AUTO-HOME')>=0);
  assert.deepStrictEqual(cfg.patchHome(p.standin,p.hook),p,'patch must be idempotent');
  assert.throws(function(){cfg.patchHome('unknown',b)},/Unsupported/);
  assert.throws(function(){cfg.patchHome(a,'unknown')},/Unsupported/);
  var unrelated={label:'Apps',app:'example.app'},bar=[unrelated,{label:'Old IPTV',action:'live'}];
  var n=cfg.nativeTopbar(bar);assert.strictEqual(n[0],unrelated);assert.strictEqual(n[1].app,'com.webos.app.livetv');
  assert.strictEqual(bar[1].action,'live','do not mutate the old snapshot');
  assert.deepStrictEqual(cfg.nativeTopbar(n),n);
  var old={action:'exec',command:'old-home'},keys={'241':{action:'exec',command:'keep-input'},'773':{command:'sh /media/developer/cleanyourtv/satellite-home-key.sh'}};
  assert.deepStrictEqual(cfg.restoreBinding(keys,old)['773'],old);assert.strictEqual(keys['241'].command,'keep-input');
  keys['773']={command:'another-owner'};cfg.restoreBinding(keys,old);assert.strictEqual(keys['773'].command,'another-owner');
}
async function uiLifecycle(){
  var calls=[],listeners={},state={show:false,generation:100},requests=[];
  var context={console:console,Promise:Promise,downT:0,downEnter:false,held:false,closeMenus:function(){},API:'http://127.0.0.1:18767',
    window:{innerWidth:1920,innerHeight:1080},document:{documentElement:{classList:{add:function(){calls.push('off')},remove:function(){calls.push('on')}}},
      addEventListener:function(name,fn,capture){listeners[name+(capture?'Capture':'')]=fn}},
    webOSSystem:{launchParams:'{}',keepAlive:function(v){calls.push(['keepAlive',v])},hide:function(){calls.push('hide')},activate:function(){calls.push('activate')},
      setKeyMask:function(v){assert(Array.isArray(v));calls.push(['keys',v])},setInputRegion:function(v){if(Array.isArray(v))throw Error('JSON required');calls.push(['region',JSON.parse(v)])}},
    navigator:{sendBeacon:function(url){calls.push('ack');requests.push(url)}},
    fetch:function(url){requests.push(url);return Promise.resolve({json:function(){return Promise.resolve(state)}})},
    clearTimeout:function(){},setTimeout:function(){return 1},requestAnimationFrame:function(fn){fn()},EventSource:function(){this.close=function(){}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'ui/satellite-overlay-ui.js'),'utf8'),context);
  await new Promise(function(resolve){setImmediate(resolve)});
  assert.deepStrictEqual(calls[0],['keepAlive',true]);
  assert(calls.indexOf('ack')<calls.indexOf('hide'),'send hide acknowledgement before suspending the page');
  state={show:true,generation:101};context.satelliteReveal(state);
  assert.strictEqual(context.satelliteShown,true);assert(calls.indexOf('activate')>=0);
  var lastMask=calls.filter(function(c){return Array.isArray(c)&&c[0]==='keys'}).pop()[1];assert(lastMask.indexOf('KeyMaskProgramme')>=0);
  var e={keyCode:33,preventDefault:function(){this.prevented=true},stopImmediatePropagation:function(){this.stopped=true}};
  listeners.keydownCapture(e);assert(e.prevented&&e.stopped);assert(requests.some(function(r){return /channel-up\?generation=101$/.test(r)}));
  context.satelliteOff({show:false,generation:100});assert.strictEqual(context.satelliteShown,true,'ignore stale hide');
  context.satelliteOff({show:false,generation:102});assert.strictEqual(context.satelliteShown,false);
  var count=requests.length;listeners.keydownCapture(e);assert.strictEqual(requests.length,count,'hidden page must not forward keys');
  lastMask=calls.filter(function(c){return Array.isArray(c)&&c[0]==='keys'}).pop()[1];assert.strictEqual(lastMask.length,0);
  var region=calls.filter(function(c){return Array.isArray(c)&&c[0]==='region'}).pop()[1][0];assert.strictEqual(region.width,0);assert.strictEqual(region.height,0);
}
async function controller(){
  var handler,records=[],foreground='com.webos.app.livetv',now=1000000;
  function luna(uri,p){records.push({uri:uri,p:p});
    if(/getForegroundAppInfo$/.test(uri))return Promise.resolve({appId:foreground,returnValue:true});
    if(/getStatus$/.test(uri))return Promise.resolve({video:[{appId:'com.webos.app.livetv',connected:true,muted:false,context:'test-context'}]});
    if(/listRunningApps$/.test(uri))return Promise.resolve({running:[{id:'com.cleanyourtv.satellitehome'}]});
    return Promise.resolve({returnValue:true});
  }
  var fakeFs={existsSync:function(p){return /satellite-menu-enabled$/.test(p)},readFileSync:function(){return '{"241":{"command":"preserved"}}'},writeFileSync:function(){},renameSync:function(){}};
  function Clock(){return new Date(now)}Clock.now=function(){return now};
  var context={console:{log:function(){}},Set:Set,Promise:Promise,Date:Clock,setTimeout:function(){return 1},clearTimeout:function(){},setInterval:function(){},
    process:{on:function(){}},require:function(name){
      if(name==='http')return {createServer:function(fn){handler=fn;return {listen:function(port,host){assert.strictEqual(port,18767);assert.strictEqual(host,'127.0.0.1')}}}};
      if(name==='fs')return fakeFs;if(/\/luna$/.test(name))return luna;if(/\/exec$/.test(name))return {detached:function(){}};throw Error(name);
    }};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'runtime/satellite-menu-server.js'),'utf8')+'\nthis.test={toggle:toggle,hide:hide,state:state};',context);
  async function request(url,method,origin){var code=0,body;await handler({url:url,method:method||'POST',headers:origin?{origin:origin}:{},resume:function(){}},
    {setHeader:function(){},writeHead:function(c){code=c},end:function(s){try{body=JSON.parse(s)}catch(e){body=s}}});return {code:code,body:body}}
  var shown=await context.test.toggle();assert(shown.show);var token=shown.generation;
  await request('/satellite/dismiss?generation='+(token-1));assert(context.test.state().show,'stale dismiss must not hide new menu');
  var channel=await request('/satellite/channel-up?generation='+token);assert.strictEqual(channel.code,200);assert(channel.body.returnValue);
  var keys=records.filter(function(r){return r.p.params&&/sendKey/.test(r.p.params.id)});
  assert.strictEqual(keys.length,2);assert.strictEqual(keys[0].p.params.id,'sendKeyPress');assert.strictEqual(keys[1].p.params.id,'sendKeyRelease');assert.strictEqual(keys[0].p.params.key,18874401);
  foreground='other.app';assert.strictEqual((await request('/satellite/channel-down?generation='+token)).code,409);foreground='com.webos.app.livetv';
  var hidden=context.test.hide('test');await request('/satellite/hidden?generation='+token);assert.notStrictEqual(context.test.state().hiddenGeneration,hidden.generation);
  await request('/satellite/hidden?generation='+hidden.generation);assert.strictEqual(context.test.state().hiddenGeneration,hidden.generation);
  assert.strictEqual((await request('/satellite/channel-up?generation='+token)).code,409);
  assert.strictEqual((await request('/satellite/hide','GET')).code,405);
  assert.strictEqual((await request('/satellite/status','GET','https://example.invalid')).code,403);
}
async function main(){
  configuration();await uiLifecycle();await controller();
  var html=fs.readFileSync(path.join(root,'app/index.html'),'utf8'),scripts=html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi)||[];
  scripts.forEach(function(s){new vm.Script(s.replace(/^<script\b[^>]*>/i,'').replace(/<\/script>$/i,''))});
  assert(html.indexOf('127.0.0.1:18767')>=0);assert(html.indexOf('127.0.0.1:8767')<0);
  console.log('PASS configuration, idempotence, guarded restore, resident input lifecycle, channel forwarding, stale tokens, origin/method guards and generated scripts');
}
main().catch(function(e){console.error(e.stack);process.exitCode=1});
