import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const data = code => 'data:text/javascript;base64,'+Buffer.from(code).toString('base64')
function compile(file) {
 return ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 .replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href))
 .replaceAll("'react'",JSON.stringify(pathToFileURL(require.resolve('react')).href))
}
const iconURL=data(compile('./CocoaCupIcon.tsx'))
const hooksURL=data(compile('../../hooks/useDialogFocus.ts'))
const source=compile('./CocoaPanel.tsx').replace(/from ['"]\.\/CocoaCupIcon['"]/,`from '${iconURL}'`).replace(/from ['"]\.\.\/\.\.\/hooks\/useDialogFocus['"]/,`from '${hooksURL}'`).replace(/import ['"]\.\/cocoa.css['"];?/,'')
const {CocoaPanel}=await import(data(source))
const model=await import(data(compile('../../../../docs/planning/designs/cocoa-03-ui/prototype-model.ts')))
const {initialDemo,demoView,demoScenario,stepDemo,applyDemoAction:act,chooseDemoPerson:person}=model
const html=state=>renderToStaticMarkup(React.createElement(CocoaPanel,{open:true,state,onAction:()=>{},mode:'prototype'}))
function buttonMarkup(markup,label){return markup.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0]}

test('controlled rendering labels prototype and never invents another maker or completion',()=>{
 const state=demoScenario('brewing'), before=JSON.stringify(state), calls=[]
 const markup=renderToStaticMarkup(React.createElement(CocoaPanel,{open:true,state,onAction:a=>calls.push(a),mode:'prototype'}))
 assert.match(markup,/仅本机演示/);assert.match(markup,/46%/);assert.doesNotMatch(markup,/热可可做好了/)
 assert.equal(JSON.stringify(state),before);assert.deepEqual(calls,[])
 const result=demoScenario('complete');result.result.makers=[result.self]
 assert.match(html(result),/演示者 A做的/);assert.doesNotMatch(html(result),/演示者 A、演示者 B一起做的/)
 result.result.cups[0].claimed=true;result.result.cups[0].heldBy=null
 assert.match(html(result),/演示者 A已领取/);assert.doesNotMatch(html(result),/演示者 A拿着这杯/)
})
test('disconnect blocks brewing, while a pending ordinary request cannot trap stop input',()=>{
 const offline=demoScenario('offline')
 assert.match(buttonMarkup(html(offline),'中火'),/disabled/)
 const pending=demoScenario('brewing');pending.pending=true
 assert.doesNotMatch(buttonMarkup(html(pending),'关火'),/disabled/)
 assert.match(buttonMarkup(html(pending),'暂停一下'),/disabled/)
})
test('swaps and cheers require visible confirmation; only confirmed feedback is celebrated',()=>{
 const swap=demoScenario('swap'), markup=html(swap)
 assert.match(markup,/想和你交换工位/);assert.match(markup,/>好呀<|>先不了</)
 let state=demoScenario('complete');for(const cup of state.result.cups){cup.claimed=true;cup.heldBy={...cup.owner}}
 state=demoView(state);state=act(state,{type:'toast'})
 assert.equal(state.toastFeedback,undefined)
 const invite=state.invitations[0];state=person(state,'her');state=act(state,{type:'respond-invitation',offerId:invite.id,accept:true})
 assert.match(state.toastFeedback,/轻轻碰了杯/)
})
test('single operator can warm then stir without adding the absent reserved-cup owner as a maker',()=>{
 let s=act(demoView(initialDemo()),{type:'start'});s=act(s,{type:'choose-station',station:'heat'});s=act(s,{type:'begin'});s=act(s,{type:'set-input',mode:'heat'})
 for(let i=0;i<20;i++)s=stepDemo(s,.5)
 assert.equal(s.temperature,64);assert.equal(s.progress,0)
 s=act(s,{type:'choose-station',station:'stir'});s=act(s,{type:'set-input',mode:'stir'})
 for(let i=0;i<25;i++)s=stepDemo(s,.5)
 assert.equal(s.phase,'pouring');assert.deepEqual(s.madeBy.map(p=>p.account),['bear'])
 s=act(s,{type:'portion',name:'独自试做'});s=act(s,{type:'portion',name:'重复不会再分杯'})
 assert.equal(s.collection.items.length,1);assert.equal(s.result.cups.length,2);assert.equal(s.result.makers.length,1)
})
test('the same warming input changes temperature differently with a real local stir operator',()=>{
 const duo=demoScenario('brewing'), without=structuredClone(duo);without.inputs.her='stop'
 const a=stepDemo(duo,.5),b=stepDemo(without,.5)
 assert.ok(a.temperature<b.temperature);assert.equal(a.progress,50);assert.equal(b.progress,46)
})
test('temperature excursions only wait; pause and long gaps never farm offline progress',()=>{
 let s=demoScenario('brewing');s.temperature=80;const old=s.progress;s=stepDemo(s,.5);assert.equal(s.progress,old)
 s=act(s,{type:'pause'});const paused=structuredClone(s);s=stepDemo(s,3600);assert.deepEqual(s,paused)
 s=act(s,{type:'resume'});s=stepDemo(s,30);assert.equal(s.phase,'paused');assert.equal(s.progress,old)
})
test('choices belong to the actor and joining alone does not create a contribution',()=>{
 let s=act(demoView(initialDemo()),{type:'start'}), original=s.choices[1].ingredients
 s=act(s,{type:'set-ingredients',owner:'her',ingredients:['cocoa']});assert.deepEqual(s.choices[1].ingredients,original)
 s=act(s,{type:'set-ingredients',owner:'bear',ingredients:['cocoa','cinnamon','cocoa']});assert.deepEqual(s.choices[0].ingredients,['cocoa','cinnamon'])
 s=act(s,{type:'set-ingredients',owner:'bear',ingredients:[]});assert.deepEqual(s.choices[0].ingredients,[])
 s=person(s,'her');s=act(s,{type:'join'});assert.deepEqual(s.madeBy,[])
})
test('cancelling a pass leaves the reserved cup, and old offer responses cannot claim it',()=>{
 let s=demoScenario('complete'), cupId=s.result.cups[1].id
 s=act(s,{type:'offer',cupId});const offerId=s.result.cups[1].offer.id
 s=act(s,{type:'cancel-offer',cupId,offerId});assert.equal(s.result.cups[1].heldBy,null)
 s=person(s,'her');s=act(s,{type:'accept-offer',cupId,offerId});assert.equal(s.result.cups[1].heldBy,null)
 s=act(s,{type:'claim',cupId});assert.equal(s.result.cups[1].heldBy.account,'her');assert.equal(s.result.cups.length,2)
})
test('release intents preserve the old session/account and remove listeners after teardown',async()=>{
 const effects=[];globalThis.__cocoaEffects=effects
 const mockReact=data(`export const useEffect=fn=>globalThis.__cocoaEffects.push(fn);export const useRef=value=>({current:value});export const useId=()=> 'cocoa-test';`)
 const mockDialog=data(`export const useDialogFocus=()=>({current:null});`)
 const runtimeSource=source.replace(JSON.stringify(pathToFileURL(require.resolve('react')).href),JSON.stringify(mockReact)).replace(`'${hooksURL}'`,`'${mockDialog}'`)
 const {CocoaPanel:Render}=await import(data(runtimeSource)), actions=[]
 const windowBefore=globalThis.window,documentBefore=globalThis.document
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false
 try {
  const state=demoScenario('brewing');state.pending=true
  const tree=Render({open:true,state,onAction:a=>actions.push(a)})
  const cleanup=effects[0]();window.dispatchEvent(new Event('blur'));document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));cleanup()
  assert.deepEqual(actions.map(a=>a.reason),['blur','hidden','unmount'])
  assert.ok(actions.every(a=>a.type==='release-input'&&a.sessionId==='local-demo-1'&&a.account==='bear'))
  window.dispatchEvent(new Event('blur'));assert.equal(actions.length,3)
  function findClose(node) { if(!node||typeof node!=='object')return null; if(node.props?.['aria-label']==='合上热可可面板')return node; for(const child of React.Children.toArray(node.props?.children)){const found=findClose(child);if(found)return found}return null }
  findClose(tree).props.onClick()
  assert.deepEqual(actions.slice(-2).map(a=>a.type),['release-input','close'])
  assert.equal(actions.at(-2).reason,'close')
 } finally { globalThis.window=windowBefore;globalThis.document=documentBefore;delete globalThis.__cocoaEffects }
})
