#include "portalhtml.h"

// The portal window closes as soon as Mural restarts, so the instructions are shown before restarting
const char OFFLINE_MENU_HTML[] = R"HTML(
<form action='/offline' method='post' onsubmit="document.getElementById('om').style.display='flex';return false">
<button>Use without WiFi</button></form><br/>
<div id='om' style='display:none;position:fixed;inset:0;margin:0;padding:16px;background:rgba(0,0,0,.6);align-items:center;justify-content:center;z-index:10'>
<div style='background:#fff;color:#000;border-radius:.3rem;padding:1em;max-width:22em;text-align:left'>
<h3 style='margin-top:0'>Use Mural without WiFi</h3>
<p>Mural will restart and host its own WiFi network. This window will close when it restarts.</p>
<ol style='padding-left:1.2em'>
<li>Connect to the <b>Mural</b> WiFi network. If your phone says it has no internet, choose to stay connected.</li>
<li>Open <b>http://192.168.4.1</b> in your browser.</li>
</ol>
<p>To go back to normal WiFi mode, power cycle Mural.</p>
<button onclick="this.disabled=true;this.textContent='Restarting...';fetch('/offline',{method:'POST'}).catch(function(){})">Restart without WiFi</button>
<button style='margin-top:.5em;background:#777' onclick="document.getElementById('om').style.display='none'">Cancel</button>
</div></div>
)HTML";

const char OFFLINE_PAGE_HTML[] = R"HTML(<!DOCTYPE html>
<html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>Mural</title></head>
<body style='font-family:sans-serif;text-align:center;padding:2em'>
<h2>Restarting Mural in hotspot mode</h2>
<p>Once it's back up, reconnect to the <b>Mural</b> network if needed, then open <b>http://192.168.4.1</b> in your browser.</p>
<p>Power cycle Mural to go back to normal WiFi mode.</p>
</body></html>
)HTML";
