// 只渲染本目录 file:// 规则原型。独立 headless 进程、临时 profile；不连接应用浏览器/API。
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const folder = path.dirname(fileURLToPath(import.meta.url))
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'cocoa-ui-offline-'))
const browser = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
let serial = 0, buffer = '', diagnostics = ''
const pending = new Map()
browser.stderr.on('data', chunk => { diagnostics += chunk.toString() })
browser.stdio[4].on('data', chunk => {
  buffer += chunk.toString()
  let end
  while ((end = buffer.indexOf('\0')) >= 0) {
    const text = buffer.slice(0, end); buffer = buffer.slice(end + 1)
    if (!text) continue
    const message = JSON.parse(text), item = pending.get(message.id)
    if (item) { pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result) }
  }
})
function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
}
const cases = [['idle',390,844],['preparing',320,568],['brewing',390,844],['paused',320,568],['pouring',320,568],['offer',390,844],['collection',1024,900],['swap',320,568],['cheers',390,844],['offline',320,568]]
const evidence = []
try {
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true })
  await call('Page.enable', {}, sessionId)
  await fs.mkdir(path.join(folder,'previews'), { recursive: true })
  for (const [screen,width,height] of cases) {
    await call('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false }, sessionId)
    const url = pathToFileURL(path.join(folder,'index.html')); url.search = `capture=1&screen=${screen}`
    await call('Page.navigate', { url: url.href }, sessionId)
    await call('Runtime.evaluate', { expression: `new Promise(resolve => { const check = () => document.querySelector('.cocoa-panel') ? document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(resolve))) : setTimeout(check,20); check() })`, awaitPromise:true }, sessionId)
    const result = await call('Runtime.evaluate', { expression: `(() => { const p=document.querySelector('.cocoa-panel'),r=p.getBoundingClientRect(); return {viewport:[innerWidth,innerHeight], documentWidth:document.documentElement.scrollWidth,panel:{x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight}, bodyFont:getComputedStyle(p).fontSize,smallTargets:[...p.querySelectorAll('button,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width<43.9||r.height<43.9}).map(e=>({text:e.textContent||e.placeholder,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),prototypeLabel:!!p.querySelector('.cocoa-prototype')}; })()`, returnByValue:true }, sessionId)
    evidence.push({screen, ...result.result.value})
    const shot = await call('Page.captureScreenshot', {format:'png',captureBeyondViewport:false}, sessionId)
    await fs.writeFile(path.join(folder,'previews',`${screen}-${width}.png`),Buffer.from(shot.data,'base64'))
    if (['preparing','brewing','offer'].includes(screen)) {
      await call('Runtime.evaluate', { expression:`document.querySelector('.cocoa-panel').scrollTop=99999` }, sessionId)
      const bottom = await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId)
      await fs.writeFile(path.join(folder,'previews',`${screen}-${width}-bottom.png`),Buffer.from(bottom.data,'base64'))
    }
  }
  const report = {kind:'isolated-offline-component-render-not-live-game', date:'2026-11-07', cases:evidence}
  await fs.writeFile(path.join(folder,'previews','layout-evidence.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
} finally {
  try { await call('Browser.close') } catch { browser.kill('SIGTERM') }
}
