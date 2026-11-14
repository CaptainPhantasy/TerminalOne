const icons={
 terminal:'M4 5l6 7-6 7M13 19h7',
 browser:'M3 7h18M7 4v3M3 4h18v16H3z',
 agent:'M8 4h8v4h4v12H4V8h4zM8 12h1m6 0h1M9 16h6',
 tools:'M4 7h16M4 17h16M8 4v6M16 14v6',
 plus:'M12 5v14M5 12h14'
};
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+icons[name]+'"/></svg>';
export async function init(T1) {
 const body=document.body, shell=document.querySelector('.app-shell');
 body.classList.add('workspace');
 const sidebar=document.createElement('nav');
 sidebar.className='workspace-nav';sidebar.setAttribute('aria-label','Workspaces');
 sidebar.innerHTML='<div class="workspace-brand">'+icon('terminal')+'<span>TerminalOne<small>Workspace</small></span></div><button id="workspace-terminal">'+icon('terminal')+'<span>Terminal</span></button><div class="workspace-label">Your browser</div><div id="browser-tabs"></div><button id="new-browser">'+icon('plus')+'<span>New browser tab</span></button><div class="workspace-label">Agent workspace</div><button id="agent-browser">'+icon('agent')+'<span>Agent browser</span></button><div class="nav-bottom"><button id="workspace-tools">'+icon('tools')+'<span>Tools & settings</span></button><p>One space.<br>Your shell and the web.</p></div>';
 body.append(sidebar);
 sidebar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-label',b.textContent.trim()));
 const browser=document.createElement('section');
 browser.className='browser-surface';browser.hidden=true;browser.setAttribute('aria-label','Browser workspace');
 browser.innerHTML='<header class="browser-heading"><div><span class="browser-eyebrow">Browser workspace</span><h2 id="browser-title">New tab</h2></div><button id="hide-browser" aria-label="Hide browser view">Hide view</button></header><form id="browser-address"><button type="button" id="browser-back" aria-label="Go back">‹</button><button type="button" id="browser-forward" aria-label="Go forward">›</button><button type="button" id="browser-reload" aria-label="Reload page">Reload</button><input id="browser-url" aria-label="Web or local address" placeholder="Search or enter a web or localhost address" autocomplete="off"><button>Go</button></form><div class="browser-permissions"><label for="browser-share">Agent access</label><select id="browser-share"><option value="private">Private</option><option value="view">View only</option><option value="control">Allow control</option></select><button id="copy-agent">Copy connection</button><button id="browser-read">Read page</button><button id="close-browser" aria-label="Close current browser tab">Close tab</button></div><div id="browser-message" role="status">Enter an address to browse. Localhost addresses open on the terminal host.</div><div class="browser-canvas"><img id="browser-frame" alt="Live browser page. Click to interact; use the text field below for typing." tabindex="0" hidden><div id="browser-empty">'+icon('browser')+'<h3>A place for the web</h3><p>Open documentation, preview a local app,<br>or work alongside your terminal agent.</p></div></div><form id="browser-type"><input aria-label="Text to send to browser" placeholder="Type into the focused page field"><button>Send text</button><button type="button" id="browser-tab">Tab</button><button type="button" id="browser-enter">Enter</button></form>';
 shell.append(browser);
 const drawer=document.createElement('dialog');drawer.className='workspace-drawer';drawer.id='workspace-drawer';drawer.setAttribute('aria-label','Tools and settings');
 drawer.innerHTML='<header><div><small>Workspace controls</small><h2>Tools & settings</h2></div><button id="drawer-close">Done</button></header><input id="tool-filter" placeholder="Find a tool" aria-label="Find a tool"><h3>Connection & appearance</h3><div id="workspace-settings"></div><h3>Terminal tools</h3>';
 body.append(drawer);
 drawer.querySelector('#workspace-settings').append(document.querySelector('.terminal-actions'));
 drawer.append(document.querySelector('#t1toolbar'));
 drawer.addEventListener('click',e=>{if(e.target.closest('#workspace-settings button,#t1toolbar button'))drawer.close();});
 const $=id=>document.getElementById(id);
 let key, tabs=[],current=null, busy=false;
 const notify=message=>{$('browser-message').textContent=message;};
 async function api(path='',method='GET',data) {
   const res=await fetch('/api/browser'+path,{method,headers:{'Content-Type':'application/json','X-Workspace-Key':key||''},...(data?{body:JSON.stringify(data)}:{})});
   const value=await res.json();if(!res.ok)throw new Error(value.error);return value;
 }
 function safe(fn){return async event=>{try{await fn(event);}catch(e){notify(e.message);T1.toast?.(e.message);}};}
 function renderTabs(){
   const container=$('browser-tabs');
   const humanTabs=tabs.filter(t=>t.kind==='human');
   for(const old of container.querySelectorAll('button'))if(!humanTabs.some(t=>t.id===old.dataset.id))old.remove();
   for(const t of humanTabs){
    let row=[...container.children].find(b=>b.dataset.id===t.id);
    if(!row){row=document.createElement('button');row.dataset.id=t.id;row.innerHTML=icon('browser')+'<span></span>';row.onclick=safe(()=>show(t));container.append(row);}
    row.querySelector('span').textContent=t.title==='about:blank'?'New tab':t.title;
    row.setAttribute('aria-label',row.textContent);
    row.classList.toggle('selected',t.id===current?.id);
   }
   $('workspace-terminal').classList.toggle('selected',browser.hidden);
   $('agent-browser').classList.toggle('selected',!browser.hidden&&current?.kind==='agent');
 }
 function hide(){browser.hidden=true;body.classList.remove('browser-open');renderTabs();window.dispatchEvent(new Event('resize'));}
 async function show(t){current=t;browser.hidden=false;body.classList.add('browser-open');$('browser-share').value=t.permission;$('browser-url').value=t.url==='about:blank'?'':t.url;renderTabs();await resizeViewer();await refresh();window.dispatchEvent(new Event('resize'));}
 async function resizeViewer(){
   if(!current||browser.hidden)return;
   const box=browser.querySelector('.browser-canvas');
   const width=box.clientWidth,height=box.clientHeight;
   if(current.viewWidth===width&&current.viewHeight===height)return;
   current.viewWidth=width;current.viewHeight=height;
   await api('/'+current.id+'/viewport','POST',{width,height});
 }
 window.addEventListener('resize',()=>{clearTimeout(window.__browserResize);window.__browserResize=setTimeout(()=>resizeViewer().catch(()=>{}),250);});
 async function refresh(){
   if(!current||browser.hidden||busy)return;
   busy=true;const id=current.id;
   try {
    const snap=await api('/'+id+'/snapshot');if(current?.id!==id)return;
    Object.assign(current,snap);delete current.image;
    $('browser-frame').src='data:image/jpeg;base64,'+snap.image;
    const blank=snap.url==='about:blank';
    $('browser-frame').hidden=blank;$('browser-empty').hidden=!blank;
    $('browser-title').textContent=current.kind==='agent'?'Agent browser':(snap.title||'New tab');
    if(document.activeElement!==$('browser-url'))$('browser-url').value=blank?'':snap.url;
    renderTabs();
   } finally {busy=false;}
 }
 async function action(action,data={}){if(!current)return;await api('/'+current.id+'/action','POST',{action,...data});await refresh();}
 $('new-browser').onclick=safe(async()=>{notify('Starting a private browser…');const t=await api('','POST',{kind:'human'});tabs.push(t);await show(t);notify('Private browser. Choose agent access only when you want to share.');});
 $('agent-browser').onclick=safe(async()=>{let t=tabs.find(t=>t.kind==='agent');if(!t){t=await api('','POST',{kind:'agent'});tabs.push(t);}await show(t);notify('The agent browser keeps running when this view is hidden. Copy its connection to your terminal agent.');});
 $('workspace-terminal').onclick=hide;$('hide-browser').onclick=hide;
 $('workspace-tools').setAttribute('aria-controls','workspace-drawer');
 $('workspace-tools').setAttribute('aria-expanded','false');
 drawer.addEventListener('close',()=>$('workspace-tools').setAttribute('aria-expanded','false'));
 $('workspace-tools').onclick=()=>{drawer.showModal();$('workspace-tools').setAttribute('aria-expanded','true');$('tool-filter').focus();};
 $('drawer-close').onclick=()=>drawer.close();
 drawer.addEventListener('click',e=>{if(e.target===drawer)drawer.close();});
 $('tool-filter').oninput=e=>{drawer.querySelectorAll('#t1toolbar button').forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.toLowerCase()));};
 $('browser-address').onsubmit=safe(async e=>{e.preventDefault();let url=$('browser-url').value.trim();if(!url)return;if(!/^[a-z]+:/i.test(url))url=/\s/.test(url)||!/[.:]/.test(url)?'https://www.google.com/search?q='+encodeURIComponent(url):'http://'+url;notify('Loading page…');await action('navigate',{url});notify('Live browser on the terminal host.');});
 for(const name of ['back','forward','reload'])$('browser-'+name).onclick=safe(()=>action(name));
 $('browser-share').onchange=safe(async e=>{Object.assign(current,await api('/'+current.id+'/permission','POST',{permission:e.target.value}));notify(current.permission==='private'?'Sharing revoked. Previous connection tokens no longer work.':'Access changed. Copy a new connection for your agent.');});
 $('browser-read').onclick=safe(async()=>{if(!current)return;const data=await api('/'+current.id+'/content');const d=document.createElement('dialog');d.className='workspace-drawer';d.setAttribute('aria-label','Browser page text');const heading=document.createElement('h2');heading.textContent=data.title;const content=document.createElement('div');content.className='browser-reading';content.textContent=data.text;const close=document.createElement('button');close.textContent='Done';close.onclick=()=>{d.close();d.remove();};d.append(heading,close,content);body.append(d);d.showModal();});
 $('copy-agent').onclick=safe(async()=>{
   const access=await api('/'+current.id+'/access');
   const connection=JSON.stringify({...access,endpoint:location.origin+access.endpoint});
   try { await navigator.clipboard.writeText(connection);notify('Connection copied. Paste it into your terminal agent.'); }
   catch { const d=document.createElement('dialog');d.className='workspace-drawer';d.setAttribute('aria-label','Agent connection');const label=document.createElement('p');label.textContent='Copy this connection into your terminal agent. Keep it private.';const field=document.createElement('textarea');field.value=connection;field.readOnly=true;field.setAttribute('aria-label','Agent connection');const done=document.createElement('button');done.textContent='Done';done.onclick=()=>{d.close();d.remove();};d.append(label,field,done);body.append(d);d.showModal();field.select(); }});
 $('close-browser').onclick=safe(async()=>{const id=current.id;await api('/'+id,'DELETE');tabs=tabs.filter(t=>t.id!==id);current=null;hide();});
 $('browser-frame').onclick=safe(async e=>{const r=e.target.getBoundingClientRect();await action('click',{x:(e.clientX-r.left)*(current.width||1280)/r.width,y:(e.clientY-r.top)*(current.height||800)/r.height});});
 $('browser-frame').onkeydown=safe(async e=>{if(e.key==='Tab')return;e.preventDefault();await action('key',{key:e.key===' '?'Space':e.key});});
 $('browser-frame').addEventListener('wheel',safe(async e=>{e.preventDefault();await action('scroll',{deltaY:e.deltaY});}),{passive:false});
 $('browser-type').onsubmit=safe(async e=>{e.preventDefault();const input=e.target.querySelector('input');await action('type',{text:input.value});input.value='';});
 $('browser-tab').onclick=safe(()=>action('key',{key:'Tab'}));
 let touchStart=null;
 $('browser-frame').addEventListener('touchstart',e=>{touchStart=e.touches[0].clientY;},{passive:true});
 $('browser-frame').addEventListener('touchend',safe(async e=>{if(touchStart!==null){const delta=touchStart-e.changedTouches[0].clientY;touchStart=null;if(Math.abs(delta)>20)await action('scroll',{deltaY:delta});}}));
 $('browser-enter').onclick=safe(()=>action('key',{key:'Enter'}));
 try {key=(await api('/bootstrap')).key;tabs=await api();renderTabs();}
 catch(e){notify(e.message);}
 // Only visible browser views capture frames. Hidden agent contexts keep executing.
 setInterval(()=>refresh().catch(e=>notify(e.message)),1000);
 window.__workspace={ready:true};
}
