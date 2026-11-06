/** Commercial UI gate. Run with Playwright and @axe-core/playwright available.
 * PLAYWRIGHT_TOOLS may point at an isolated tooling directory containing node_modules.
 * Screenshots and the complete machine-readable report are written to POLISH_SHOTS.
 */
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(process.env.PLAYWRIGHT_TOOLS ? path.join(process.env.PLAYWRIGHT_TOOLS,'package.json') : import.meta.url);
const {chromium}=require('playwright');
const {default:AxeBuilder}=require('@axe-core/playwright');
const out=process.env.POLISH_SHOTS || '/tmp/terminalone-commercial-shots';
await mkdir(out,{recursive:true});
const port=Number(process.env.COMMERCIAL_PORT||11247),url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
const results=[];
let browser;
const viewports=[[390,844,'iphone'],[844,390,'iphone'],[932,430,'iphone'],[820,1180,'ipad'],[1180,820,'ipad'],[1440,900,'desktop']];
export function measureLayout() {
 const visible=e=>!e.closest('[inert]') && e.getClientRects().length && e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0 && getComputedStyle(e).visibility!=='hidden';
 const identify=e=>e.id || e.getAttribute('aria-label') || e.textContent.trim().slice(0,45) || e.className;
 const rect=e=>{
  const r=e.getBoundingClientRect();let left=r.left,right=r.right,top=r.top,bottom=r.bottom;
  // Include every external shadow spread/blur extent, not only the CSS flow box.
  const sh=getComputedStyle(e).boxShadow;
  if(sh!=='none') {
   const px=[...sh.replace(/rgba?\([^)]*\)/g,'').matchAll(/(-?[\d.]+)px/g)].map(x=>Number(x[1]));
   if(px.length>=3){const [x,y,blur,spread=0]=px,pad=blur+spread;left=Math.min(left,r.left+x-pad);right=Math.max(right,r.right+x+pad);top=Math.min(top,r.top+y-pad);bottom=Math.max(bottom,r.bottom+y+pad);}
  }
  const style=getComputedStyle(e);
  if(style.outlineStyle!=='none') {
   const pad=Math.max(0,parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset));
   left-=pad;right+=pad;top-=pad;bottom+=pad;
  }
  return {left,right,top,bottom,width:right-left,height:bottom-top};
 };
 const intersection=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
 const scope=document.querySelector('#settingsModal.open,.t1palette.open,.t1-tablet-sheet.open,.t1-swipe-history-tray.open') || (document.body.classList.contains('t1-tools-open') ? document.querySelector('#t1toolbar') : document);
 const controls=[...scope.querySelectorAll('button,select,.t1session-tab,.t1keybar-cfg label')].filter(visible);
 const readable=[...new Set([...controls,...scope.querySelectorAll('.terminal-title,.terminal-status,.terminal-footer span,.t1-smart-suggest .label')])].filter(visible);
 const regions=[...scope.querySelectorAll('.terminal-header,.t1toolbar,.terminal-container,.keybar,.terminal-footer,.t1-chrome-fab,.t1-fab,.t1-smart-suggest,.t1toast')].filter(visible);
 const overlaps=[];let pairs=0;
 for(const group of [[...new Set([...controls,...regions])]])for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++) {
  const a=group[i],b=group[j];if(a.contains(b)||b.contains(a))continue;pairs++;
  const area=intersection(rect(a),rect(b));if(area>0.1)overlaps.push({a:identify(a),b:identify(b),area});
 }
 const clipped=[];
 for(const e of readable) {
  const r=e.getBoundingClientRect(),outer=rect(e);
  if(outer.left<-.5||outer.right>innerWidth+.5||outer.top<-.5||outer.bottom>innerHeight+.5)clipped.push({element:identify(e),reason:'viewport'});
  if(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)clipped.push({element:identify(e),reason:'scroll-box'});
  if(e.tagName!=='SELECT') {
   const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let text;
   while(text=walker.nextNode())if(text.textContent.trim()) {
    const range=document.createRange();range.selectNodeContents(text);
    for(const tr of range.getClientRects())if(tr.left<r.left-.5||tr.right>r.right+.5||tr.top<r.top-.5||tr.bottom>r.bottom+.5)clipped.push({element:identify(e),reason:'text'});
   }
  }
  for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){
   const ar=a.getBoundingClientRect(),st=getComputedStyle(a);
   if(/hidden|clip|auto|scroll/.test(st.overflowX)&& (r.left<ar.left-.5||r.right>ar.right+.5))clipped.push({element:identify(e),reason:'ancestor-x'});
   if(/hidden|clip|auto|scroll/.test(st.overflowY)&& (r.top<ar.top-.5||r.bottom>ar.bottom+.5))clipped.push({element:identify(e),reason:'ancestor-y'});
  }
 }
 const targets=controls.filter(e=>e.getBoundingClientRect().width<43.9||e.getBoundingClientRect().height<43.9).map(identify);
 return {pairs,overlaps,clipped,targets,overflow:document.documentElement.scrollWidth>innerWidth,emoji:/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(document.body.innerText),terminalHeight:document.querySelector('.terminal-container').getBoundingClientRect().height};
}
try {
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/opt/google/chrome/chrome',args:['--no-sandbox']});
 let index=0;
 for(const [width,height,device] of viewports) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:device!=='desktop',colorScheme:'dark',userAgent:device==='iphone'?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1':device==='ipad'?'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1':undefined});
  const page=await context.newPage();
  await page.goto(url);await page.waitForFunction(()=>window.__t1Features?.length===39);
  await page.waitForTimeout(500);
  const report={width,height,device,states:[],themes:[]};
  report.states.push({name:'expanded',...await page.evaluate(measureLayout)});
  if(device==='iphone' && height<500) {
   await page.evaluate(()=>{document.body.style.padding='0px 44px 21px';window.dispatchEvent(new Event('resize'));});
   await page.waitForTimeout(250);
   report.states.push({name:'safe-area-insets',...await page.evaluate(measureLayout)});
   await page.screenshot({path:path.join(out,`safe-area-${width}x${height}.png`)});
   await page.evaluate(()=>{document.body.style.padding='';window.dispatchEvent(new Event('resize'));});
   await page.waitForTimeout(250);
  }
  console.log(width,height,JSON.stringify(report.states[0]));
  results.push(report);
  await writeFile(path.join(out,'collision-contrast-report.json'),JSON.stringify(results,null,2)+'\n');
  await page.screenshot({path:path.join(out,`${String(++index).padStart(2,'0')}-${width}x${height}.png`)});
  // Keyboard focus rings are part of the collision envelope, not decoration.
  await page.keyboard.press('Tab');
  const focusable=page.locator('button:visible,select:visible,.t1session-tab:visible');
  for(let n=0;n<await focusable.count();n++) {
   const control=focusable.nth(n);
   if(await control.isDisabled())continue;
   await control.focus();
   report.states.push({name:'keyboard-focus-'+n,...await page.evaluate(measureLayout)});
  }
  await page.locator('.xterm-helper-textarea').focus();
  if(device==='iphone' && height<500) {
   await page.click('.t1-tools-toggle');
   report.states.push({name:'tools-sheet',...await page.evaluate(measureLayout)});
   await page.screenshot({path:path.join(out,`tools-${width}x${height}.png`)});
   await page.click('.t1-tools-done');
  }
  if(device!=='desktop') {
   await page.evaluate(()=>window.__terminalOneChrome.setCollapsed(true));await page.waitForTimeout(150);
   report.states.push({name:'focused',...await page.evaluate(measureLayout)});
   await page.evaluate(()=>window.__terminalOneChrome.setCollapsed(false));
  }
  // Check every stable preset ID, both typography styles, and all chrome text colors.
  const themes=await page.evaluate(()=>window.__terminalOne.themes());
  for(const theme of themes) {
   await page.evaluate(id=>window.__terminalOne.setTheme(id),theme);
   await page.waitForTimeout(220);
   const contrast=await page.evaluate(()=>{
    const s=getComputedStyle(document.documentElement),v=k=>s.getPropertyValue('--ui-'+k).trim();
    const lum=hex=>{const c=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
    const ratio=(a,b)=>{let x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    return {text:Math.min(...['fg','muted','accent'].flatMap(c=>['bg','elevated'].map(b=>ratio(v(c),v(b))))),border:Math.min(...['bg','elevated'].map(b=>ratio(v('border'),v(b))))};
   });
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   report.themes.push({id:theme,...contrast,violations:axe.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  }
  await page.evaluate(()=>{window.__terminalOne.setTheme('solarized-light');window.__terminalOne.setStyle('floyd');});
  await page.waitForTimeout(150);report.states.push({name:'paper-compact',...await page.evaluate(measureLayout)});
  await page.click('#settingsBtn');
  report.states.push({name:'settings',...await page.evaluate(measureLayout)});
  report.settingsAxe=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations;
  await page.screenshot({path:path.join(out,`settings-${width}x${height}.png`)});await page.click('#settingsClose');
  report.icons=[];
  for(const icon of ['favicon.svg','icon.svg','favicon.ico','favicon-16x16.png','favicon-32x32.png','apple-touch-icon.png','icon-180.png','icon-192.png','icon-512.png','manifest.json']){const response=await context.request.get(url+'/'+icon);report.icons.push({name:icon,status:response.status(),type:response.headers()['content-type']});}
  await page.click('#closeBtn');await context.close();
 }
 await writeFile(path.join(out,'collision-contrast-report.json'),JSON.stringify(results,null,2)+'\n');
 const errors=results.flatMap(r=>r.states.flatMap(s=>s.overlaps.length||s.clipped.length||s.targets.length||s.overflow||s.emoji||s.terminalHeight<44?[{viewport:[r.width,r.height],...s}]:[]));
 const contrastErrors=results.flatMap(r=>r.themes.filter(t=>t.text<4.5||t.border<3||t.violations.length).map(t=>({viewport:[r.width,r.height],...t})));
 console.log(JSON.stringify({viewports:results.length,errors,contrastErrors,settingsErrors:results.flatMap(r=>(r.settingsAxe||[]).map(x=>({viewport:[r.width,r.height],id:x.id}))),icons:results.every(r=>r.icons.every(i=>i.status===200))},null,2));
 if(errors.length||contrastErrors.length||results.some(r=>r.settingsAxe?.length||r.icons.some(i=>i.status!==200)))process.exitCode=1;
}finally {await browser?.close();server.kill('SIGTERM');}
