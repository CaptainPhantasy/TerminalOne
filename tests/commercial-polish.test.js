const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('complete bespoke icon pyramid is installed and linked', () => {
 for (const file of ['favicon.svg','icon.svg','favicon.ico','favicon-16x16.png','favicon-32x32.png','apple-touch-icon.png','icon-180.png','icon-192.png','icon-512.png']) {
  assert.ok(fs.existsSync(path.join(__dirname,'../public',file)), file);
 }
 const html = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.match(html,/href="\/apple-touch-icon.png"/);
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/manifest.json'),'utf8'));
 assert.deepEqual(manifest.shortcuts.map(x=>x.url), ['/?action=new-tab','/?action=focus']);
 const svg=fs.readFileSync(path.join(__dirname,'../public/favicon.svg'),'utf8');
 assert.ok(!/<rect[^>]*(?:width="(?:100%|512)"|height="(?:100%|512)")/.test(svg), 'no solid root tile');
});
test('commercial chrome has no emoji pictographs or bloom', () => {
 const files=['index.html',...fs.readdirSync(path.join(__dirname,'../public/features')).filter(x=>x.endsWith('.mjs')).map(x=>'features/'+x)];
 for (const file of files) {
  const text=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(text),file+' has a pictograph');
  assert.ok(!/box-shadow:\s*0 0 \d+px|text-shadow:\s*0 0/.test(text),file+' has bloom');
 }
});
