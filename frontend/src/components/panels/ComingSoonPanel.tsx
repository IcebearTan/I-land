import { useEffect, useState } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { eventBus } from '../../game/EventBus'
import type { PanelName } from '../../game/EventBus'
import { PixelIcon } from '../PixelIcon'

/** 漂流瓶的施工中占位面板（统一像素木框与卷轴缎带表头）。 */
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
    if (panel) {
      eventBus.emit('PANEL_CLOSED', { panel })
      setPanel(null)
    }
  })

  if (!panel) return null

  const copy = { title: '沙滩漂流瓶', text: '海风会把想说的话送到你身边。漂流瓶留言还在准备中。' }

  function close() {
    eventBus.emit('PANEL_CLOSED', { panel: panel! })
    setPanel(null)
  }

  return (
    <div className="modal-mask" onClick={close}>
      <div
        ref={dialog}
        className="wood-panel modal-panel modal-panel--sm px-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="px-ribbon" id="place-title">
            <PixelIcon name="boat" size={18} />
            <span>{copy.title}</span>
          </div>
          <button type="button" className="px-slot" onClick={close} aria-label="关上漂流瓶面板">
            <PixelIcon name="close" size={18} />
          </button>
        </div>
        <p className="coming-soon">{copy.text}</p>
      </div>
    </div>
  )
}
