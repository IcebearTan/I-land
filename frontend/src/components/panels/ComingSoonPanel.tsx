import { useEffect, useState } from 'react'
import { eventBus } from '../../game/EventBus'
import type { PanelName } from '../../game/EventBus'

/** 灯塔日历 / 漂流瓶的施工中占位面板（M3 / M4 接管） */
export function ComingSoonPanel() {
  const [panel, setPanel] = useState<PanelName | null>(null)

  useEffect(() => {
    const onCalendar = () => {
      setPanel('calendar')
      eventBus.emit('PANEL_OPENED', { panel: 'calendar' })
    }
    const onBottle = () => {
      setPanel('bottle')
      eventBus.emit('PANEL_OPENED', { panel: 'bottle' })
    }
    eventBus.on('OPEN_CALENDAR', onCalendar)
    eventBus.on('OPEN_BOTTLE', onBottle)
    return () => {
      eventBus.off('OPEN_CALENDAR', onCalendar)
      eventBus.off('OPEN_BOTTLE', onBottle)
    }
  }, [])

  if (!panel) return null

  const copy =
    panel === 'calendar'
      ? { icon: '🗓', title: '灯塔 · 记忆日历', text: '纪念日与每日记忆（照片/天气/描述）将在 M3 建成，正在打地基…' }
      : { icon: '🍾', title: '沙滩 · 漂流瓶', text: '给彼此的随手留言将在 M4 漂上这片沙滩…' }

  function close() {
    eventBus.emit('PANEL_CLOSED', { panel: panel! })
    setPanel(null)
  }

  return (
    <div className="modal-mask" onClick={close}>
      <div className="wood-panel modal-panel modal-panel--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            {copy.icon} {copy.title}
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
