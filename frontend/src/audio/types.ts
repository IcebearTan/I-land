/** 纯数据契约；React 与 Phaser 各自导入，播放指令只经过 EventBus。 */
export interface AudioSettings {
  music_enabled: boolean
  ambience_enabled: boolean
  muted: boolean
  music_volume: number
  ambience_volume: number
}

export const DEFAULT_AUDIO: AudioSettings = {
  music_enabled: true, ambience_enabled: true, muted: false,
  music_volume: .35, ambience_volume: .55,
}

export interface AudioMix { dayMusic: number; nightMusic: number; birds: number; crickets: number; waves: number; fireplace: number }
export interface AudioContextInfo {
  scene: 'login' | 'island' | 'seaside' | 'interior' | 'study'
  shore?: number
  grove?: number
  phase?: 'dawn' | 'day' | 'dusk' | 'night'
  /** 连续的夜色权重，与鸟鸣/虫鸣及音乐编配共用，0 = 白天，1 = 深夜。 */
  night?: number
  /** 阁楼书房快捷音景：纯白噪音（壁炉+海浪+虫鸣） / 轻音乐伴读 / 书房静音 */
  studyAudioMode?: 'whitenoise' | 'melody' | 'mute'
}
export type PlaybackStatus = 'off' | 'locked' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error'
export interface AudioStatus {
  status: PlaybackStatus
  message?: string
  period?: 'day' | 'night' | 'transition'
  availableTracks?: number
  playingLayers?: (keyof AudioMix)[]
}

const unit = (value: number) => Math.max(0, Math.min(1, value))

export function nightWeight(hour: number): number {
  const h = ((hour % 24) + 24) % 24
  return h >= 17 ? unit((h - 17) / 3) : unit((7.5 - h) / 2)
}

export function audioMix(settings: AudioSettings, context: AudioContextInfo): AudioMix {
  if (settings.muted) return { dayMusic: 0, nightMusic: 0, birds: 0, crickets: 0, waves: 0, fireplace: 0 }
  const music = settings.music_enabled ? settings.music_volume : 0
  const ambience = settings.ambience_enabled ? settings.ambience_volume : 0
  const night = unit(context.night ?? (context.phase === 'night' ? 1 : context.phase === 'dusk' ? .4 : context.phase === 'dawn' ? .5 : 0))
  if (context.scene === 'study') {
    const mode = context.studyAudioMode ?? 'whitenoise'
    if (mode === 'mute') return { dayMusic: 0, nightMusic: 0, birds: 0, crickets: 0, waves: 0, fireplace: 0 }
    if (mode === 'whitenoise') {
      const base = settings.ambience_enabled ? Math.max(ambience, .42) : .42
      return { dayMusic: 0, nightMusic: 0, birds: 0, crickets: base * night * .18, waves: base * .32, fireplace: base * .40 }
    }
    const studyMusic = (settings.music_enabled ? Math.max(music, .28) : .28) * .52
    return {
      dayMusic: studyMusic * Math.cos(night * Math.PI / 2),
      nightMusic: studyMusic * Math.sin(night * Math.PI / 2),
      birds: 0,
      crickets: ambience * night * .10,
      waves: ambience * .16,
      fireplace: ambience * .28,
    }
  }
  const musicGain = context.scene === 'login' ? .48 : context.scene === 'interior' ? .65 : context.scene === 'seaside' ? .48 : 1 - .4 * unit(context.shore ?? 0)
  // 两种编配同调同节拍，等功率交接，避免到整点时硬切曲目。
  const melody = { dayMusic: music * musicGain * Math.cos(night * Math.PI / 2), nightMusic: music * musicGain * Math.sin(night * Math.PI / 2) }
  if (context.scene === 'login') return { ...melody, birds: 0, crickets: 0, waves: 0, fireplace: 0 }
  // 炉火与个人环境音偏好共用一路；进屋不保留户外声，也不改变静音或播放权限。
  if (context.scene === 'interior') return { ...melody, birds: 0, crickets: 0, waves: 0, fireplace: ambience * .42 }
  if (context.scene === 'seaside') return { ...melody, birds: 0, crickets: ambience * night * .2, waves: ambience, fireplace: 0 }
  const shore = unit(context.shore ?? 0), grove = unit(context.grove ?? 0)
  return {
    ...melody,
    birds: ambience * (.12 + .68 * grove) * (1 - .7 * shore) * (1 - night),
    crickets: ambience * (.16 + .5 * grove) * (1 - .65 * shore) * night,
    waves: ambience * (.10 + .9 * shore),
    fireplace: 0,
  }
}
