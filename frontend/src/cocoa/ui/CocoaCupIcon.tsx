import type { CocoaCupStyle } from './types'

/** 控件用图标，不替代 ART 交付的游戏内杯子资产。 */
export function CocoaCupIcon({ style, size = 40 }: { style: CocoaCupStyle; size?: number }) {
  return <svg className="cocoa-cup-icon" width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M28 15h4a6 6 0 0 1 0 12h-4" stroke="currentColor" strokeWidth="2" />
    <path d="M8 14h21v15a6 6 0 0 1-6 6h-9a6 6 0 0 1-6-6V14Z" fill={style === 'teal' ? '#3f887f' : '#f0d9a8'} stroke="currentColor" strokeWidth="2" />
    <path d="M12 18h13v3H12z" fill="#6e4529" />
    <path d="M13 10c-3-4 3-4 0-8m7 8c-3-4 3-4 0-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
}
