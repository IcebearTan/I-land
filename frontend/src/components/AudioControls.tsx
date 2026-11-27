import type { useIslandAudio } from '../audio/useIslandAudio'
import { PixelIcon } from './PixelIcon'

/** Sound controls inside Island Settings — pixel styled, zero boilerplate copy. */
export function AudioControls({ audio }: { audio: ReturnType<typeof useIslandAudio> }) {
  const { settings, playback, ready } = audio
  const needsGesture = ['locked', 'blocked', 'error'].includes(playback.status)
  const quiet = settings.muted || needsGesture
  const startLabel =
    playback.status === 'error'
      ? '重试播放'
      : playback.status === 'blocked'
        ? '继续播放'
        : '开启小岛声音'
  const loading = playback.status === 'loading'
  const statusCopy = !ready
    ? '读取声音偏好中…'
    : loading
      ? '载入小岛声音中…'
      : playback.status === 'error'
        ? playback.message
        : playback.status === 'blocked' || playback.status === 'locked'
          ? '点一下下方按钮即可播放声音。'
          : settings.muted
            ? '当前已静音。'
            : playback.period === 'night'
              ? '此刻 · 星光小岛与虫鸣'
              : '此刻 · 慢慢靠岸与海风'

  return (
    <section
      className="settings-section audio-settings"
      aria-labelledby="audio-title"
      data-playback-status={playback.status}
      data-audio-period={playback.period}
      data-audio-tracks={playback.availableTracks}
      data-audio-playing-layers={playback.playingLayers?.join(',')}
    >
      <div className="audio-heading">
        <div>
          <h3 id="audio-title" className="px-font">
            小岛的声音
          </h3>
          <p className="audio-description" role="status">
            {statusCopy}
          </p>
        </div>
        <div className="px-slot" aria-hidden="true">
          <PixelIcon name={playback.period === 'night' ? 'night' : 'sound-on'} size={22} />
        </div>
      </div>

      <button
        type="button"
        className={`px-btn audio-master${quiet ? ' px-btn-accent' : ''}`}
        disabled={!ready || loading}
        onClick={() => (quiet ? audio.start() : audio.change({ muted: true }, true))}
      >
        <PixelIcon name={quiet ? 'sound-on' : 'sound-off'} size={18} />
        <span>{loading ? '载入中…' : quiet ? startLabel : '全部静音'}</span>
      </button>

      <fieldset className="audio-channels" disabled={!ready}>
        <legend className="sr-only">分别调整音乐与环境声</legend>
        <div className="audio-channel">
          <label className="audio-toggle">
            <div>
              <strong className="px-font">背景音乐</strong>
              <span>昼夜旋律渐变</span>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-label="背景音乐"
              checked={settings.music_enabled}
              onChange={(e) => audio.change({ music_enabled: e.target.checked }, true)}
            />
          </label>
          <label className="audio-slider">
            <span className="sr-only">音乐音量</span>
            <input
              aria-label="音乐音量"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(settings.music_volume * 100)}
              disabled={!settings.music_enabled}
              onChange={(e) => audio.change({ music_volume: Number(e.target.value) / 100 })}
              onPointerUp={audio.saveNow}
              onKeyUp={audio.saveNow}
              onBlur={audio.saveNow}
            />
            <output className="px-font">{Math.round(settings.music_volume * 100)}%</output>
          </label>
        </div>

        <div className="audio-channel">
          <label className="audio-toggle">
            <div>
              <strong className="px-font">环境声音</strong>
              <span>鸟鸣、虫声、海浪与炉火</span>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-label="环境声"
              checked={settings.ambience_enabled}
              onChange={(e) => audio.change({ ambience_enabled: e.target.checked }, true)}
            />
          </label>
          <label className="audio-slider">
            <span className="sr-only">环境声音量</span>
            <input
              aria-label="环境声音量"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(settings.ambience_volume * 100)}
              disabled={!settings.ambience_enabled}
              onChange={(e) => audio.change({ ambience_volume: Number(e.target.value) / 100 })}
              onPointerUp={audio.saveNow}
              onKeyUp={audio.saveNow}
              onBlur={audio.saveNow}
            />
            <output className="px-font">{Math.round(settings.ambience_volume * 100)}%</output>
          </label>
        </div>
      </fieldset>

      {audio.error ? (
        <div className="audio-save-error" role="alert">
          <p>{audio.error}</p>
          <button type="button" className="px-btn" onClick={audio.retry}>
            重试
          </button>
        </div>
      ) : (
        audio.saved && (
          <p className="audio-save px-font" role="status">
            声音偏好已保存。
          </p>
        )
      )}
    </section>
  )
}
