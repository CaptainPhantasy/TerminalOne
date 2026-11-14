'use strict';
const crypto = require('crypto');
const puppeteer = require('puppeteer');

function installBrowserWorkspace(app) {
  const humanKey = crypto.randomBytes(32).toString('hex');
  const sessions = new Map();
  let browserPromise;
  let opening=0;
  const engine = () => browserPromise ||= puppeteer.launch({
    headless: true,
    args:['--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],
    ...(process.env.TERMINALONE_CHROME ? { executablePath: process.env.TERMINALONE_CHROME } : {}),
  }).catch(error => { browserPromise = null; throw error; });
  const human = req => req.get('X-Workspace-Key') === humanKey;
  const describe = s => ({ id:s.id, kind:s.kind, permission:s.permission, url:s.page.url(), title:s.title || 'New tab' });
  const route = fn => async (req,res) => {
    res.set('Cache-Control','no-store');
    try {
      const s=sessions.get(req.params.id);
      if(s && /\/(snapshot|content|action|viewport)$/.test(req.path)) {
        const work=(s.queue||Promise.resolve()).then(()=>fn(req,res));
        s.queue=work.catch(()=>{});
        await work;
      } else await fn(req,res);
    } catch (error) { res.status(error.status || 400).json({error:error.message}); }
  };
  function deny(message, status=403) { throw Object.assign(new Error(message), {status}); }
  function session(req, control=false) {
    const s=sessions.get(req.params.id);
    if (!s) deny('Browser tab no longer exists.',404);
    if (!human(req)) {
      if (req.get('Authorization') !== 'Bearer '+s.token) deny('Browser access token required.');
      if (s.permission==='private' || (control && s.permission!=='control')) deny('The owner has not granted this browser permission.');
    }
    return s;
  }
  function address(value) {
    const u=new URL(value);
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password) deny('Use an HTTP or HTTPS address without embedded credentials.',400);
    return u.href;
  }
  app.get('/api/browser/bootstrap',route(async(req,res)=>{
    if(req.get('Authorization')) deny('Agent tokens cannot manage workspace permissions.');
    res.json({key:humanKey});
  }));
  app.get('/api/browser',route(async(req,res)=>{
    if(!human(req)) deny('Workspace access required.');
    res.json([...sessions.values()].map(describe));
  }));
  app.post('/api/browser',route(async(req,res)=>{
    if(!human(req)) deny('Only the owner can create browser tabs.');
    if(sessions.size+opening>=8) deny('Close a tab before opening another (limit eight).',409);
    opening++;
    let context;
    try {
    context=await (await engine()).createBrowserContext();
    const page=await context.newPage();
    await page.setViewport({width:1280,height:800});
    const kind=req.body.kind==='agent'?'agent':'human';
    const s={id:crypto.randomUUID(),token:crypto.randomBytes(32).toString('hex'),page,context,kind,width:1280,height:800,permission:kind==='agent'?'control':'private'};
    sessions.set(s.id,s);
    // Popups remain in this permission boundary; follow in the same tab.
    page.on('popup',async popup=>{const url=popup.url();await popup.close();try{await page.goto(address(url));}catch{}});
    res.json(describe(s));
    } catch(error) { if(context) await context.close();throw error; } finally { opening--; }
  }));
  app.post('/api/browser/:id/permission',route(async(req,res)=>{
    if(!human(req)) deny('Only the owner can change sharing.');
    const s=session(req);
    if(!['private','view','control'].includes(req.body.permission)) deny('Unknown sharing permission.',400);
    s.permission=req.body.permission;
    s.token=crypto.randomBytes(32).toString('hex'); // Revoke every previous capability.
    res.json(describe(s));
  }));
  app.get('/api/browser/:id/access',route(async(req,res)=>{
    if(!human(req)) deny('Only the owner can reveal access.');
    const s=session(req);
    if(s.permission==='private') deny('Choose View or Control before sharing.');
    res.json({id:s.id,token:s.token,permission:s.permission,endpoint:'/api/browser/'+s.id});
  }));
  app.get('/api/browser/:id/snapshot',route(async(req,res)=>{
    const s=session(req);
    await s.page.bringToFront();
    const client=await s.page.createCDPSession();
    let capture;
    try { capture=await client.send('Page.captureScreenshot',{format:'jpeg',quality:75,captureBeyondViewport:false},{timeout:10000}); } finally { await client.detach(); }
    session(req); // Recheck grants after asynchronous work.
    s.title=await s.page.title();
    res.json({...describe(s),image:capture.data,width:s.width,height:s.height});
  }));
  app.post('/api/browser/:id/viewport',route(async(req,res)=>{
    if(!human(req)) deny('Only the owner can resize the viewer.');
    const s=session(req);
    s.width=Math.max(320,Math.min(1920,Math.round(Number(req.body.width)||1280)));
    s.height=Math.max(240,Math.min(1200,Math.round(Number(req.body.height)||800)));
    await s.page.setViewport({width:s.width,height:s.height});
    res.json({width:s.width,height:s.height});
  }));
  app.get('/api/browser/:id/content',route(async(req,res)=>{
    const s=session(req);
    const text=await s.page.evaluate(()=>document.body.innerText);
    session(req);
    res.json({...describe(s),text:text.slice(0,100000)});
  }));
  app.post('/api/browser/:id/action',route(async(req,res)=>{
    const s=session(req,true), {action}=req.body, p=s.page;
    switch(action) {
      case 'navigate': await p.goto(address(req.body.url),{waitUntil:'domcontentloaded',timeout:20000});break;
      case 'back': await p.goBack({waitUntil:'domcontentloaded',timeout:20000});break;
      case 'forward': await p.goForward({waitUntil:'domcontentloaded',timeout:20000});break;
      case 'reload': await p.reload({waitUntil:'domcontentloaded',timeout:20000});break;
      case 'click': {
        const x=Number(req.body.x),y=Number(req.body.y);
        if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>s.width||y>s.height) deny('Invalid pointer position.',400);
        await p.mouse.click(x,y);break;
      }
      case 'type': await p.keyboard.type(String(req.body.text||'').slice(0,10000));break;
      case 'key': await p.keyboard.press(String(req.body.key));break;
      case 'scroll': await p.mouse.wheel({deltaY:Math.max(-1500,Math.min(1500,Number(req.body.deltaY)||0))});break;
      default: deny('Unknown browser action.',400);
    }
    res.json(describe(s));
  }));
  app.delete('/api/browser/:id',route(async(req,res)=>{
    if(!human(req)) deny('Only the owner can close tabs.');
    const s=session(req);sessions.delete(s.id);await s.context.close();res.json({closed:true});
  }));
  return async()=>{sessions.clear();if(browserPromise)await(await browserPromise).close();};
}
module.exports={installBrowserWorkspace};
