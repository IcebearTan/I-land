import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CocoaPanel } from '../../../../frontend/src/cocoa/ui'
import { applyDemoAction, chooseDemoPerson, demoScenario, demoView, initialDemo, stepDemo } from './prototype-model'
import '../../../../frontend/src/styles/tokens.css'
import './prototype.css'

const query = new URLSearchParams(location.search), capture = query.has('capture')
function Prototype() {
  const [state, setState] = useState(() => query.has('screen') ? demoScenario(query.get('screen')!) : demoView(initialDemo()))
  const [open, setOpen] = useState(true)
  useEffect(() => {
    if (capture) return
    const timer = window.setInterval(() => { if (!document.hidden) setState(current => stepDemo(current, .5)) }, 500)
    return () => window.clearInterval(timer)
  }, [])
  return <main className={`prototype-shell${capture ? ' is-capture' : ''}`}>
    {!capture && <header className="prototype-controls"><div><strong>热可可 · 本地规则原型</strong><p>这一页只有本机模拟，不连接游戏，不保存作品。A / B 是演示视角。</p></div><nav aria-label="原型展示工具">
      <button onClick={() => setState(current => chooseDemoPerson(current, 'bear'))}>体验 A</button><button onClick={() => setState(current => chooseDemoPerson(current, 'her'))}>体验 B</button>
      <label>查看阶段 <select value={state.phase} onChange={event => { setState(demoScenario(event.target.value)); setOpen(true) }}><option value="idle">开始</option><option value="preparing">准备</option><option value="brewing">制作</option><option value="paused">暂停</option><option value="pouring">分杯</option><option value="complete">作品</option></select></label>
      <button onClick={() => setState(current => ({ ...current, connection: current.connection === 'connected' ? 'offline' : 'connected', inputs: { bear: 'stop', her: 'stop' } }))}>模拟断线/恢复</button>
      <button onClick={() => { setState(demoView(initialDemo())); setOpen(true) }}>重开原型</button>
    </nav></header>}
    <div className="prototype-stage">{!open && <button className="prototype-reopen" onClick={() => setOpen(true)}>重新打开规则原型</button>}
      <CocoaPanel open={open} state={demoView(state)} mode="prototype" onAction={action => { setState(current => applyDemoAction(current, action)); if (action.type === 'close') setOpen(false) }} />
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Prototype />)
