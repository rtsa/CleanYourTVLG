"""Rebuild the overlay from the pinned, MIT-licensed CleanYourTV 1.6.10 page."""
import base64,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'app'
source=ROOT/'vendor/cleanyourtv/index.html'
html=source.read_text(encoding='utf-8')
html=html.replace("var API = 'http://127.0.0.1:8765'", "var API = 'http://127.0.0.1:18767'")
# No cold start or prewarm is ever painted until the controller explicitly permits a Home request.
html=html.replace('<head>','''<head><script>document.documentElement.classList.add('sat-off');</script>''',1)
# Keep the existing layout, customization and remote navigation.
html=html.replace('</head>', '''<style>
html { background:transparent!important; }
body { background:linear-gradient(180deg,rgba(5,8,14,.42),rgba(5,8,14,.26) 46%,rgba(5,8,14,.60))!important; }
.glow { display:none!important; }
#scroll::before { background:rgba(8,12,20,.42)!important; }
#time,#date,#name,.pill { text-shadow:0 2px 8px rgba(0,0,0,.85); }
html.sat-off,html.sat-off body { background:transparent!important; }
html.sat-off body { visibility:hidden!important;pointer-events:none!important; }
</style></head>''')
html=html.replace('WALL.sync();', '').replace('WALL.shown();', '')
# The overlay always uses the native tuner underneath. Its unused IPTV player is unnecessary at every startup.
start=html.index('var LIVE = (function () {')
end=html.index('/* first paint straight',start)
html=html[:start]+'''var LIVE = {on:false,enter:function(){satelliteHide()},exit:function(){},resume:function(){},key:function(){},toggleGuide:function(){}};
'''+html[end:]
# A fresh API response normally matches the cached layout. Avoid drawing every app twice.
old='''    colors = cached.colors || {};
    rebuild();'''
new='''    colors = cached.colors || {};
    lastSig = JSON.stringify([
      apps.filter(function(a){return a.id !== '__live'}).map(function(a){return a.input ? [a.id,a.title,a.off] : a.id}),
      cfg,
      Object.keys(usage).sort(function(a,b){return usage[b]-usage[a]})
    ]);
    rebuild();'''
assert old in html
html=html.replace(old,new)
html=html.replace('''function load() {
  readRunning();''','''function load() {
  if(cfg.runDots === true) readRunning();''')
old="""function launch(id, params) {
  if (id === '__live') return LIVE.enter();"""
new="""function launch(id, params) {
  if (id === 'com.webos.app.livetv' || id === '__live') return satelliteHide();
  satelliteHide();"""
assert old in html
html=html.replace(old,new)
old="""  satelliteHide();
  api('/api/launch', { id: id, params: params }).then(function (x) {
    if (x && x.returnValue === false) toast(t('Could not open %s. Is it still installed?').replace('%s', title(id)), true);
  });
}"""
new="""  return satelliteHide().then(function () {
    return api('/api/launch', { id: id, params: params }).then(function (x) {
      if (x && x.returnValue === false) toast(t('Could not open %s. Is it still installed?').replace('%s', title(id)), true);
    });
  });
}"""
assert old in html
html=html.replace(old,new)
old="""  return satelliteHide().then(function () {
    return api('/api/launch', { id: id, params: params }).then(function (x) {
      if (x && x.returnValue === false) toast(t('Could not open %s. Is it still installed?').replace('%s', title(id)), true);
    });
  });"""
new="""  return api('/api/launch', { id: id, params: params }).then(function (x) {
    if (x && x.returnValue === false) toast(t('Could not open %s. Is it still installed?').replace('%s', title(id)), true);
    else satelliteHide();
  });"""
assert old in html
html=html.replace(old,new)
old="""  if (k === 461 || k === 27 || k === 8) {
    runningMenu();"""
assert old in html
html=html.replace(old,"""  if (k === 461 || k === 27 || k === 8 || k === 10009) {
    satelliteHide();""")
addon=(ROOT/'ui/satellite-overlay-ui.js').read_text(encoding='utf-8')
html=html.replace('</script></body></html>', '\n'+addon+'\n</script></body></html>')
(APP/'index.html').write_bytes(html.encode('utf-8'))
print('Built app/index.html')
