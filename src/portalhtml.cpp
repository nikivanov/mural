#include "portalhtml.h"

// Everything that changes the look, text and behaviour of WiFiManager's captive portal lives here.
//
// WiFiManager's page templates are compiled into the library, so instead of replacing them we:
//  - inject PORTAL_HEAD_HTML (CSS + JS) into the <head> of every portal page,
//  - replace the root page menu with our own buttons (PORTAL_MENU_HTML),
//  - rewrite the remaining generic text from JS once each page loads.
//
// Avoid single-letter tokens in braces (e.g. "{v}", "{t}", "{c}") in these strings: WiFiManager
// substitutes those in some of its pages.

static const char PORTAL_TITLE[] = "Mural";

// Mural UI theme: Tailwind gray-950 background, gray-900 cards, cyan-600 primary buttons
static const char PORTAL_HEAD_HTML[] = R"HTML(
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;padding:16px;box-sizing:border-box;display:flex;
  background:#030712;color:#f3f4f6;text-align:left;
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
.wrap{display:block;width:100%;max-width:28rem;min-width:0;box-sizing:border-box;padding:1.5rem;margin:auto;
  background:#111827;border:1px solid #1f2937;border-radius:1rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.5)}
div{padding:0;margin:0}
.wrap br,form br{display:none}
.msg br{display:initial}
h1{font-size:1.5rem;font-weight:600;color:#fff;text-align:center;margin:0 0 .4rem}
body.home h3{display:none}
.sub{color:#9ca3af;text-align:center;font-size:.95rem;line-height:1.6;margin:0 0 1.5rem}
b{color:#fff}
a{color:#22d3ee;font-weight:500;text-decoration:none}
a:hover{color:#67e8f9;text-decoration:none}
button,input[type=submit]{display:block;width:100%;box-sizing:border-box;margin:0 0 .75rem;padding:.8rem 1.25rem;
  border:0;border-radius:.75rem;background:#0891b2;color:#fff;cursor:pointer;
  font-family:inherit;font-size:1rem;font-weight:500;line-height:1.5;
  transition:background-color .15s;transition-delay:0s;opacity:1}
button:hover{background:#06b6d4}
button:active{background:#0e7490;opacity:1!important;cursor:pointer}
button:focus-visible{outline:2px solid #06b6d4;outline-offset:2px}
button.s{background:#374151;color:#e5e7eb}
button.s:hover{background:#4b5563}
button.s:active{background:#1f2937}
:disabled{opacity:.4}
label{display:block;margin:1rem 0 .4rem;font-size:.875rem;color:#d1d5db}
input{display:block;width:100%;box-sizing:border-box;margin:0;padding:.75rem 1rem;
  background:#030712;color:#f3f4f6;border:1px solid #374151;border-radius:.75rem;font-family:inherit;font-size:1rem}
input:focus{outline:none;border-color:#06b6d4;box-shadow:0 0 0 2px rgba(6,182,212,.3)}
input::placeholder{color:#6b7280}
input[type=checkbox]{display:inline-block;width:auto;margin:1rem .5rem 0 0;vertical-align:middle;accent-color:#06b6d4}
label[for=showpass]{display:inline-block;margin:1rem 0 0;vertical-align:middle}
form[action=wifisave] button{margin-top:1.5rem}
.net{display:flex;align-items:center;margin:0 0 .5rem;background:#1f2937;border:1px solid transparent;border-radius:.75rem}
.net a{flex:1;min-width:0;padding:.8rem 1rem;color:#f3f4f6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.net.sel{border-color:#06b6d4;background:rgba(8,145,178,.15)}
.net .q{float:none;flex:none;min-width:0;height:auto;padding:0;margin-right:1rem;display:flex}
.net .h{display:none}
.q[role=img]{filter:invert(1);opacity:.7}
.msg{margin:0 0 1rem;padding:1rem;background:#1f2937;border:0;border-radius:.75rem;color:#e5e7eb;line-height:1.6}
.spin{width:40px;height:40px;box-sizing:border-box;border:4px solid #374151;border-top-color:#06b6d4;border-radius:50%;animation:mspin 1s linear infinite}
.spin.c{margin:0 auto 1.25rem}
@keyframes mspin{to{transform:rotate(360deg)}}
#busy{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:20;flex-direction:column;align-items:center;justify-content:center;
  background:rgba(3,7,18,.92)}
#busy.on{display:flex}
#busy p{margin:1rem 0 0;padding:0 16px;text-align:center;color:#9ca3af;font-size:.95rem}
.modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:10;align-items:center;justify-content:center;
  padding:16px;background:rgba(0,0,0,.7)}
.modal.on{display:flex}
.box{width:100%;max-width:24rem;box-sizing:border-box;padding:1.5rem;background:#111827;border:1px solid #1f2937;border-radius:1rem;
  box-shadow:0 25px 50px -12px rgba(0,0,0,.5)}
.box h2{margin:0 0 .75rem;font-size:1.2rem;font-weight:600;color:#fff}
.box p,.box li{color:#d1d5db;font-size:.95rem;line-height:1.6}
.box p{margin:0 0 1rem}
.box ol{margin:0 0 1rem;padding-left:1.25rem}
.box li{margin-bottom:.5rem}
</style>
<script>
function mq(s,r){return (r||document).querySelector(s)}
function mBusy(m){var o=mq('#busy');if(!o)return;mq('p',o).textContent=m;o.className='on'}
function mOpen(){mq('#om').className='modal on';return false}
function mClose(){mq('#om').className='modal'}
function mOffline(){
  mClose();
  mBusy('Restarting Mural without WiFi. This window will close.');
  var x=new XMLHttpRequest();x.open('POST','/offline');x.send();
}
function mText(s,t){var e=mq(s);if(e)e.textContent=t}
function mPickPage(w,save){
  var h=document.createElement('div');
  h.innerHTML="<h1>Choose your network</h1><p class='sub'>Pick the WiFi network Mural should join and enter its password.</p>";
  w.insertBefore(h,w.firstChild);
  mText('label[for=s]','Network name');
  mText('label[for=showpass]','Show password');
  mText('button[type=submit]','Connect');
  var r=mq('button[name=refresh]');
  if(r){r.textContent='Scan again';r.className='s'}
  for(var i=0;i<w.childNodes.length;i++){
    var n=w.childNodes[i];
    if(n.nodeType==3&&n.nodeValue.indexOf('No networks')>=0){
      var p=document.createElement('p');p.className='sub';p.textContent='No networks found. Tap Scan again to retry.';
      w.replaceChild(p,n);
    }
  }
  var as=document.querySelectorAll("a[href='#p']");
  for(var j=0;j<as.length;j++){
    as[j].parentNode.className='net';
    as[j].addEventListener('click',function(){
      var nets=document.querySelectorAll('.net');
      for(var k=0;k<nets.length;k++)nets[k].className='net';
      this.parentNode.className='net sel';
    });
  }
  var b=document.createElement('form');
  b.action='/';b.method='get';b.setAttribute('data-busy','');
  b.innerHTML="<button class='s'>Back</button>";
  w.appendChild(b);
}
function mSavedPage(w){
  w.innerHTML="<div class='spin c'></div><h1>Connecting…</h1>"+
    "<p class='sub'>Mural is joining your WiFi network. This window may close while it tries.</p>"+
    "<div class='msg'>If it connects, Mural restarts and shows its address on its screen. "+
    "Switch this device back to your WiFi and open <b>http://mural.local</b> or that address.</div>"+
    "<div class='msg'>If it can't connect, the <b>Mural</b> hotspot comes back. Reconnect to it and try again.</div>";
}
document.addEventListener('DOMContentLoaded',function(){
  document.title='Mural Setup';
  var w=mq('.wrap');
  var o=document.createElement('div');o.id='busy';o.innerHTML="<div class='spin'></div><p></p>";
  document.body.appendChild(o);
  var fs=document.forms;
  for(var i=0;i<fs.length;i++){
    fs[i].addEventListener('submit',function(e){
      if(e.defaultPrevented)return;
      var m=this.getAttribute('data-busy');
      if(m===null)m=this.getAttribute('action')=='wifisave'?'Saving…':'Scanning for WiFi networks…';
      if(m)mBusy(m);
    });
  }
  var save=mq("form[action='wifisave']");
  if(save)mPickPage(w,save);
  else if(/(^| )wifi( |$)/.test(document.body.className)&&mq('.msg'))mSavedPage(w);
});
window.addEventListener('pageshow',function(){var o=mq('#busy');if(o)o.className=''});
</script>
)HTML";

// Root page body. Replaces WiFiManager's stock menu buttons.
// The portal window closes as soon as Mural restarts, so the hotspot instructions are shown before restarting.
static const char PORTAL_MENU_HTML[] = R"HTML(
<p class='sub'>Connect Mural to your WiFi network, or use it directly through this hotspot.</p>
<form action='/wifi' method='get' data-busy='Scanning for WiFi networks…'><button>Connect to WiFi</button></form>
<form action='/offline' method='post' onsubmit='return mOpen()'><button class='s'>Use without WiFi</button></form>
<div id='om' class='modal'><div class='box'>
<h2>Use Mural without WiFi</h2>
<p>Mural will restart and host its own WiFi network. This window will close when it restarts.</p>
<ol>
<li>Connect to the <b>Mural</b> WiFi network. If your phone says it has no internet, choose to stay connected.</li>
<li>Open <b>http://192.168.4.1</b> in your browser.</li>
</ol>
<p>To go back to normal WiFi mode, power cycle Mural.</p>
<button type='button' onclick='mOffline()'>Restart without WiFi</button>
<button type='button' class='s' onclick='mClose()'>Cancel</button>
</div></div>
)HTML";

// Only the root menu is shown, the rest of the portal is reached through PORTAL_MENU_HTML
static std::vector<const char *> portalMenu = {"custom"};

const char OFFLINE_PAGE_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Mural</title></head>
<body style='margin:0;padding:2em 16px;background:#030712;color:#f3f4f6;text-align:center;font-family:system-ui,sans-serif'>
<h2>Restarting Mural in hotspot mode</h2>
<p>Once it's back up, reconnect to the <b>Mural</b> network if needed, then open <b>http://192.168.4.1</b> in your browser.</p>
<p>Power cycle Mural to go back to normal WiFi mode.</p>
</body></html>
)HTML";

void applyPortalTheme(WiFiManager &wifiManager) {
    wifiManager.setTitle(PORTAL_TITLE);
    wifiManager.setCustomHeadElement(PORTAL_HEAD_HTML);
    wifiManager.setMenu(portalMenu);
    wifiManager.setCustomMenuHTML(PORTAL_MENU_HTML);
}
