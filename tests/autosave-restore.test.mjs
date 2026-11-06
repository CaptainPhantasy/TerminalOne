import {test} from 'node:test';
import assert from 'node:assert/strict';
import {init} from '../public/features/autosave.mjs';
test('restore reads the previous session before a fresh connection can overwrite it',()=>{
 const original={window:globalThis.window,document:globalThis.document,setTimeout:globalThis.setTimeout,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 const callbacks=[],writes=[],store=new Map([['terminalone.autosave',JSON.stringify({lines:['Previous session output'],theme:'tokyo-night',style:'default'})]]);
 try {
  globalThis.window={addEventListener(){}};
  globalThis.document={body:{dataset:{theme:'tokyo-night',style:'default'}},getElementById(){return {textContent:'Connected'};}};
  globalThis.setTimeout=cb=>{callbacks.push(cb);return 1;};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
  const term={buffer:{active:{length:1,getLine(){return {translateToString(){return '';}};}}},write(text){writes.push(text);}};
  init({term,storage:{get:(k,d)=>store.get(k)||d,set:(k,v)=>store.set(k,v)},onTermReady:cb=>cb(),toast(){}});
  callbacks.forEach(cb=>cb());
  assert.ok(writes.some(text=>text.includes('Previous session output')),'existing history must survive connect');
 }finally{Object.assign(globalThis,original);}
});
