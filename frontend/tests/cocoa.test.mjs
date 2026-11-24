import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const compile=p=>ts.transpileModule(fs.readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64')
const {CocoaInputController}=await import(url(compile('../src/cocoa/input.ts')))
const {isCocoaSnapshot,isCocoaRecipe}=await import(url(compile('../src/cocoa/types.ts')))
const {cocoaPanelState}=await import(url(compile('../src/cocoa/view.ts')))
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve()}
const person=(account='bear')=>({account,display:account,user_id:account==='bear'?1:2})
const cup=(account='bear')=>({id:account==='bear'?1:2,recipient_id:account==='bear'?1:2,recipient_account:account,recipient_display:account,cup_type:'cream',ingredients:[],claimed:false})
const recipe=()=>({run_id:1,name:'临时热可可',created_at:'2026-11-07T01:00:00Z',makers:[person()],cups:[cup(),cup('her')],cheered_at:null})
const run=()=>({id:1,phase:'brewing',version:1,temperature:50,progress:20,choices:{bear:{cup_type:'cream',ingredients:[]},her:{cup_type:'teal',ingredients:['cocoa']}},maker_accounts:['bear'],reason:'',created_at:'2026-11-07T01:00:00Z'})
const snapshot=()=>({run:run(),operators:[{account:'bear',station:'heat',intent:null}],offers:[],recipe:null,visible_cups:[],cheers:null})
function inputHarness(){
 const sent=[],timers=new Map();let next=0
 const transport={leaseKey:'lease-1',sendIntent:async(path,body)=>{sent.push({path,...body});return true}}
 const controller=new CocoaInputController(transport,()=>{}, {set:fn=>{const id=++next;timers.set(id,fn);return id},clear:id=>timers.delete(id)})
 controller.synchronize({runId:1,phase:'brewing',station:'heat'})
 const advance=()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn())}
 return{transport,sent,timers,controller,advance}
}
test('input renews every timer and stop immediately cancels further renewal with a newer seq',()=>{
 const h=inputHarness();h.controller.set('heat');h.advance();h.controller.set('stop');h.advance()
 assert.deepEqual(h.sent.map(r=>[r.mode,r.seq]),[['heat',1],['heat',2],['stop',3]])
 assert.equal(h.timers.size,0);h.controller.dispose()
})
test('late input failure cannot cancel a newer intention or a reconnected scope',async()=>{
 const h=inputHarness();let finish
 h.transport.sendIntent=async(path,body)=>{h.sent.push(body);if(body.seq===1)return new Promise(r=>finish=r);return true}
 h.controller.set('heat');h.controller.set('gentle');finish(false);await flush();assert.equal(h.controller.mode,'gentle')
 const old=h.controller.scope;h.controller.suspend();h.transport.leaseKey='lease-2';h.controller.synchronize({runId:1,phase:'brewing',station:'heat'});h.controller.set('heat')
 h.controller.set('stop',old);assert.equal(h.controller.mode,'heat');h.controller.dispose()
})
test('pause and station swap stop the old role; resume does not restart it',()=>{
 const h=inputHarness();h.controller.set('heat')
 h.controller.synchronize({runId:1,phase:'paused',station:'heat'});assert.equal(h.controller.mode,'stop');assert.equal(h.timers.size,0)
 h.controller.synchronize({runId:1,phase:'brewing',station:'stir'});h.controller.set('heat');assert.equal(h.controller.mode,'stop')
 h.controller.set('stir');assert.equal(h.controller.mode,'stir');h.controller.dispose()
})
test('ordinary pending cannot block an explicit stop transport',()=>{
 const h=inputHarness();h.transport.pending=true;h.controller.set('heat');h.controller.set('stop')
 assert.equal(h.sent.at(-1).mode,'stop');h.controller.dispose()
})
test('new pot changes scope without reusing an old captured release',()=>{
 const h=inputHarness();const old=h.controller.scope;h.controller.set('heat')
 h.controller.synchronize({runId:2,phase:'brewing',station:'heat'});h.controller.set('gentle');h.controller.set('stop',old)
 assert.equal(h.controller.mode,'gentle');assert.ok(h.sent.at(-1).seq>1);h.controller.dispose()
})
test('snapshots reject forged/out-of-range progress, unknown station and duplicate recipients',()=>{
 const s=snapshot();assert.ok(isCocoaSnapshot(s));assert.ok(isCocoaRecipe(recipe()))
 assert.equal(isCocoaSnapshot({...s,run:{...s.run,progress:101}}),false)
 assert.equal(isCocoaSnapshot({...s,run:{...s.run,temperature:NaN}}),false)
 assert.equal(isCocoaSnapshot({...s,operators:[{account:'bear',station:'other',intent:null}]}),false)
 assert.equal(isCocoaRecipe({...recipe(),cups:[cup(),cup()]}),false)
 assert.equal(isCocoaRecipe({...recipe(),makers:[]}),false)
})
test('reserved and historically claimed cups never invent participants or current holders',()=>{
 const saved=recipe();saved.cups.forEach(c=>c.claimed=true)
 const game={account:'bear',display:'bear',connection:{state:'connected',pending:false},members:[],cocoa:{...snapshot(),run:{...run(),phase:'complete'},operators:[],recipe:saved},inputMode:'stop',sessionId:'scope',approaching:false}
 const local={selectedCup:'bear',choicesOpen:false,recipeName:'',view:'activity',selectedRecipe:null,collectionStatus:'ready',collection:[saved]}
 const view=cocoaPanelState(game,'bear',{bear:'小熊',her:'她'},local)
 assert.deepEqual(view.participants,[]);assert.equal(view.result.makers.length,1)
 assert.ok(view.result.cups.every(c=>c.heldBy===null&&c.claimed&&c.allowedActions.length===0))
 assert.ok(view.allowedActions.includes('join'))
 game.members=[{...person(),sprite:'bear',pose:'standing',seat:null,station:'heat',held_cup_id:1}]
 game.cocoa.operators=[{account:'bear',station:'heat',intent:null}]
 const joined=cocoaPanelState(game,'bear',{bear:'小熊',her:'她'},local)
 assert.equal(joined.result.cups[0].heldBy.account,'bear');assert.equal(joined.result.cups[1].heldBy,null)
 assert.ok(!joined.allowedActions.includes('toast'))
})

test('a captured release from an old work intention cannot stop a newer station intention',()=>{
 const h=inputHarness();h.controller.set('heat');const old=h.controller.scope
 h.controller.synchronize({runId:1,phase:'brewing',station:'stir'});h.controller.set('stir')
 h.controller.set('stop',old);assert.equal(h.controller.mode,'stir');h.controller.dispose()
})
