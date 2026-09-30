import { useEffect, useState } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { eventBus } from '../../game/EventBus'
import type { PanelName } from '../../game/EventBus'

/** 漂流瓶的施工中占位面板（M4 接管）。 */
export function ComingSoonPanel() {
  const [panel, setPanel] = useState<PanelName | null>(null)

  useEffect(() => {
    const onBottle = () => {
      setPanel('bottle')
      eventBus.emit('PANEL_OPENED', { panel: 'bottle' })
    }
    eventBus.on('OPEN_BOTTLE', onBottle)
    return () => {
      eventBus.off('OPEN_BOTTLE', onBottle)
    }
  }, [])

  const dialog = useDialogFocus(!!panel, () => {
    if (panel) { eventBus.emit('PANEL_CLOSED', { panel }); setPanel(null) }
  })

  if (!panel) return null

  const copy = { title: '沙滩 · 漂流瓶', text: '海风会把想说的话送到你身边。漂流瓶留言还在准备中。' }

  function close() {
    eventBus.emit('PANEL_CLOSED', { panel: panel! })
    setPanel(null)
  }

  return (
    <div className="modal-mask" onClick={close}>
      <div ref={dialog} className="wood-panel modal-panel modal-panel--sm" role="dialog" aria-modal="true" aria-labelledby="place-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="place-title">
            {copy.title}
          </h2>
          <button className="btn btn-mini" onClick={close}>
            关上 ✕
          </button>
        </div>
        <p className="coming-soon">{copy.text}</p>
      </div>
    </div>
  )
}
