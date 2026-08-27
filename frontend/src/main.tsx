import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

// 页面级报错显示条：像素场景出问题时，她/你截图就能看到真实原因
window.addEventListener('error', (e) => {
  let bar = document.getElementById('err-bar')
  if (!bar) {
    bar = document.createElement('div')
    bar.id = 'err-bar'
    bar.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#a8352a;color:#fff;' +
      'font:11px/1.5 ui-monospace,monospace;padding:6px 12px;white-space:pre-wrap;max-height:30vh;overflow:auto;'
    const close = document.createElement('button')
    close.textContent = '×'
    close.style.cssText =
      'position:absolute;top:4px;right:8px;background:none;border:0;color:#fff;font-size:16px;cursor:pointer;'
    close.onclick = () => bar!.remove()
    bar.appendChild(close)
    document.body.appendChild(bar)
  }
  const line = document.createElement('div')
  line.textContent = e.error?.stack ?? e.message
  bar.appendChild(line)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
