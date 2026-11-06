import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const code = ts.transpileModule(fs.readFileSync(new URL('../src/visual/layout.ts', import.meta.url), 'utf8'), { compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022} }).outputText
const {worldZoom}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
test('shared world zoom preserves integer pixels and covers the island without changing scene scale',()=>{
  for(const [w,h,expected] of [[320,568,2],[390,844,2],[568,320,2],[844,390,2],[1280,800,2],[1470,782,3],[1920,1080,3],[2560,1440,4]]){
    const zoom=worldZoom(w,h)
    assert.equal(zoom,expected,`${w}x${h}`)
    assert.ok(Number.isInteger(zoom)&&zoom>=2)
    assert.ok(w/zoom<=640&&h/zoom<=480,'no unpainted strip outside the island')
  }
})
