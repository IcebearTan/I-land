import type { useIslandAudio } from '../audio/useIslandAudio'

/** 设置内的声音控件。React 只操作偏好和事件，不接触播放器。 */
export function AudioControls({ audio }: { audio: ReturnType<typeof useIslandAudio> }) {
  const { settings, playback, ready } = audio
  const needsGesture = ['locked', 'blocked', 'error'].includes(playback.status)
  const quiet = settings.muted || needsGesture
  const startLabel = playback.status === 'error' ? '重试播放' : playback.status === 'blocked' ? '继续播放' : '开启声音'
  const loading = playback.status === 'loading'
  const statusCopy = !ready ? '正在读取你的声音偏好…' : loading ? '正在带来小岛的声音…' :
    playback.status === 'error' ? playback.message :
    playback.status === 'blocked' || playback.status === 'locked' ? '浏览器暂停了声音，轻点继续播放。' :
    settings.muted ? '此刻安静。你的音量和开关都留着。' :
    !settings.music_enabled && !settings.ambience_enabled ? '音乐和环境声都关着，随时可以单独打开。' :
    '白天听鸟鸣，夜里听虫声，岸边有海浪，屋里有炉火。'

  return <section className="settings-section audio-settings" aria-labelledby="audio-title" data-playback-status={playback.status}
    data-audio-period={playback.period} data-audio-tracks={playback.availableTracks} data-audio-playing-layers={playback.playingLayers?.join(',')}>
    <div className="audio-heading"><div><h3 id="audio-title">小岛的声音</h3><p className="settings-note">{playback.period === 'night' ? '此刻 · 星光小岛' : playback.period === 'transition' ? '此刻 · 日夜渐渐交接' : '此刻 · 慢慢靠岸'}</p></div><span className="audio-heading-note" aria-hidden="true">{playback.period === 'night' ? '☾' : '♫'}</span></div>
    <p className="audio-description" role="status">{statusCopy}</p>
    <button className={`btn audio-master ${quiet ? 'btn-primary' : ''}`} disabled={!ready || loading}
      onClick={() => quiet ? audio.start() : audio.change({ muted: true }, true)}>
      {loading ? '正在加载…' : quiet ? startLabel : '全部静音'}
    </button>
    <fieldset className="audio-channels" disabled={!ready}>
      <legend className="sr-only">分别调整音乐与环境声</legend>
      <div className="audio-channel">
        <label className="audio-toggle"><div><strong>背景音乐</strong><span>《慢慢靠岸》与《星光小岛》随昼夜渐变</span></div>
          <input type="checkbox" role="switch" aria-label="背景音乐" checked={settings.music_enabled} onChange={e => audio.change({ music_enabled: e.target.checked }, true)} />
        </label>
        <label className="audio-slider"><span className="sr-only">音乐音量</span>
          <input aria-label="音乐音量" type="range" min="0" max="100" step="1" value={Math.round(settings.music_volume * 100)}
            disabled={!settings.music_enabled} onChange={e => audio.change({ music_volume: Number(e.target.value) / 100 })} onPointerUp={audio.saveNow} onKeyUp={audio.saveNow} onBlur={audio.saveNow} />
          <output>{Math.round(settings.music_volume * 100)}%</output>
        </label>
      </div>
      <div className="audio-channel">
        <label className="audio-toggle"><div><strong>环境的声音</strong><span>鸟鸣、虫声、海浪与屋里的炉火</span></div>
          <input type="checkbox" role="switch" aria-label="环境声" checked={settings.ambience_enabled} onChange={e => audio.change({ ambience_enabled: e.target.checked }, true)} />
        </label>
        <label className="audio-slider"><span className="sr-only">环境声音量</span>
          <input aria-label="环境声音量" type="range" min="0" max="100" step="1" value={Math.round(settings.ambience_volume * 100)}
            disabled={!settings.ambience_enabled} onChange={e => audio.change({ ambience_volume: Number(e.target.value) / 100 })} onPointerUp={audio.saveNow} onKeyUp={audio.saveNow} onBlur={audio.saveNow} />
          <output>{Math.round(settings.ambience_volume * 100)}%</output>
        </label>
      </div>
    </fieldset>
    {audio.error ? <div className="audio-save-error" role="alert"><p>{audio.error}</p><button className="btn btn-mini" onClick={audio.retry}>重试保存 / 读取</button></div> :
      <p className="audio-save" role="status">{audio.saving ? '正在记住你的偏好…' : audio.saved ? '声音偏好已保存，只属于你。' : '分别记住两个人的偏好，调整后自动保存。'}</p>}
    <p className="audio-footnote">切到后台自动暂停，回到前台继续。下岛后只有登录页的轻音乐。</p>
  </section>
}
