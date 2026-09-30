/** 每日记忆卡的领域类型与纯函数（不触碰 React / Phaser）。 */

export type PhotoVariant = 'original' | 'display' | 'thumb'
export type WeatherId = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'wind' | 'fog'

export interface MemoryRecord {
  id: number
  date: string
  title: string
  description: string
  mood: string
  weather: { type: WeatherId | ''; note: string }
  location: string
  photos: string[] // 旧数据路径（只读兼容）
  attachments: string[]
  created_by: string
  created_at: string
  version: number
  updated_by: string
  updated_at: string | null
  deleted: boolean
  deleted_by: string
  deleted_at: string | null
  days_left?: number // 仅「最近删除」列表
}

export interface AttachmentInfo {
  id: string
  owner: string
  width: number
  height: number
  size: number
  original_name: string
  urls: Record<PhotoVariant, string>
}

/** 与后端 MAX_MEMORY_PHOTOS 保持一致 */
export const MAX_PHOTOS = 9
export const MAX_DESCRIPTION = 5000

export const WEATHERS: Record<WeatherId, { label: string; icon: string }> = {
  sunny: { label: '晴', icon: '☀️' },
  cloudy: { label: '多云', icon: '⛅' },
  rain: { label: '雨', icon: '🌧️' },
  snow: { label: '雪', icon: '❄️' },
  wind: { label: '风', icon: '🍃' },
  fog: { label: '雾', icon: '🌫️' },
}

export const MOODS = ['🥰', '😊', '😆', '🥹', '🥲', '😮', '😴', '🎉', '🌊', '🍦', '🌸', '💛'] as const

export function fileUrl(attachmentId: string, variant: PhotoVariant): string {
  return `/api/files/${attachmentId}/${variant}`
}

/** 编辑器里的一张照片：本地预览 + 上传状态机 */
export interface LocalPhoto {
  key: string
  attachmentId: string | null
  name: string
  previewUrl: string // objectURL 或服务端缩略图
  status: 'uploading' | 'done' | 'error'
  progress: number // 0–1
  error: string
}

export interface MemoryDraft {
  id: number | null
  version: number
  clientId: string // 创建幂等标识：超时重试不重复建卡
  date: string
  title: string
  description: string
  mood: string
  weatherType: WeatherId | ''
  weatherNote: string
  location: string
  photos: LocalPhoto[]
}

/** 界面展示名：未填标题时用日期/摘要替代，不强迫用户取标题。 */
export function memoryTitle(memory: Pick<MemoryRecord, 'title' | 'description'>): string {
  if (memory.title.trim()) return memory.title.trim()
  const summary = memory.description.trim()
  if (summary) return summary.length > 18 ? summary.slice(0, 18) + '…' : summary
  return '这一天的一张照片'
}

/** 后端返回的 UTC 时刻 → 本地「x 月 x 日 HH:MM」 */
export function formatMoment(iso: string | null): string {
  if (!iso) return ''
  const time = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : iso + 'Z')
  if (Number.isNaN(time.getTime())) return ''
  return `${time.getMonth() + 1} 月 ${time.getDate()} 日 ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}
