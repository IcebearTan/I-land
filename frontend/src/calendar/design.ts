import type { CSSProperties } from 'react'
import type { Repeat } from './dates'

export const THEMES = {
  rose: { name: '玫瑰信笺', ink: '#93485b', accent: '#e8637c', soft: '#f7dce0', paper: '#fff5f2' },
  peach: { name: '蜜桃日落', ink: '#975438', accent: '#d58b65', soft: '#f7dfca', paper: '#fff6e9' },
  honey: { name: '蜂蜜奶油', ink: '#82612d', accent: '#c69947', soft: '#f5e6b9', paper: '#fffbeb' },
  leaf: { name: '四叶草', ink: '#46683b', accent: '#7cb860', soft: '#e0ebcd', paper: '#f5f8ec' },
  sea: { name: '海盐蓝', ink: '#3f6f9e', accent: '#7fb6d9', soft: '#d9eaf1', paper: '#f1f8fb' },
  lavender: { name: '暮色紫', ink: '#72547f', accent: '#ad8fbd', soft: '#e9dff0', paper: '#faf5fc' },
  cocoa: { name: '可可拿铁', ink: '#81583e', accent: '#b28b68', soft: '#e8dbc9', paper: '#fbf6ed' },
  slate: { name: '星夜靛蓝', ink: '#4a4b7b', accent: '#8b91b7', soft: '#dfe2ef', paper: '#f3f4fc' },
} as const
export const ICONS = {
  heart: '爱心', cake: '生日蛋糕', flower: '花朵', star: '星星', moon: '月亮', gift: '礼物',
  plane: '旅行', camera: '相机', home: '小屋', ring: '戒指', coffee: '咖啡', music: '音乐',
  sun: '太阳', book: '书本', sparkles: '闪光', flag: '小旗', leaf: '叶子', letter: '信封',
} as const
export const STYLES = { letter: '温柔信笺', ticket: '约定票根', garden: '花园格纹', starry: '星夜许愿' } as const
export type ThemeId = keyof typeof THEMES
export type IconId = keyof typeof ICONS
export type StyleId = keyof typeof STYLES
export interface HolidayDraft {
  name: string; date: string; repeat: Repeat; note: string; icon: IconId; color: ThemeId; style: StyleId; pinned: boolean
}
export interface Holiday extends HolidayDraft { id: number }
export const REPEATS = { once: '仅此一次', yearly: '每年纪念', monthly: '每月纪念' } as const
export const PRESETS: Array<{ label: string; name: string; icon: IconId; color: ThemeId; style: StyleId; repeat: Repeat }> = [
  { label: '相爱纪念', name: '我们的相爱纪念日', icon: 'heart', color: 'rose', style: 'letter', repeat: 'yearly' },
  { label: '生日快乐', name: '生日快乐', icon: 'cake', color: 'honey', style: 'garden', repeat: 'yearly' },
  { label: '一起旅行', name: '我们的下一次旅行', icon: 'plane', color: 'sea', style: 'ticket', repeat: 'once' },
  { label: '约会时光', name: '一起去约会', icon: 'coffee', color: 'cocoa', style: 'ticket', repeat: 'monthly' },
  { label: '结婚纪念', name: '我们的结婚纪念日', icon: 'ring', color: 'peach', style: 'letter', repeat: 'yearly' },
  { label: '搬进新家', name: '我们的新家', icon: 'home', color: 'leaf', style: 'garden', repeat: 'once' },
  { label: '小小成就', name: '值得庆祝的一天', icon: 'flag', color: 'lavender', style: 'starry', repeat: 'once' },
  { label: '许个心愿', name: '一起实现的心愿', icon: 'star', color: 'slate', style: 'starry', repeat: 'once' },
]
export function themeVars(color: string): CSSProperties {
  const theme = THEMES[color as ThemeId] ?? THEMES.rose
  return { '--holiday-ink': theme.ink, '--holiday-accent': theme.accent, '--holiday-soft': theme.soft, '--holiday-paper': theme.paper } as CSSProperties
}
