export default function RouteTimeline({
  progress,
  onProgressChange,
  disabled,
  journal,
  activeKeywords,
  onAddKeywordToJournal,
}) {
  const pct = Math.round((progress ?? 0) * 100);

  return (
    <div className="route-timeline" aria-label="路线时间轴">
      <div className="timeline-header">
        <span className="timeline-title">路线时间轴</span>
        <span className="timeline-progress-label">{pct}%</span>
      </div>
      <div className="timeline-track-wrap">
        <input
          type="range"
          className="timeline-slider"
          min={0}
          max={1000}
          step={1}
          value={Math.round((progress ?? 0) * 1000)}
          disabled={disabled}
          onChange={(e) => onProgressChange(Number(e.target.value) / 1000)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="沿路线拖动车辆位置"
        />
        <div className="timeline-vehicle-icon" style={{ left: `${pct}%` }} aria-hidden>
          🚗
        </div>
      </div>

      <p className="timeline-hint">
        叙事分析已解锁本时间轴：请手动拖动滑块或地图 🚗（不会自动播放）；靠近重点 POI 时弹出百科。
      </p>

      {activeKeywords?.length > 0 ? (
        <div className="timeline-keywords">
          <span className="timeline-kw-label">当前关键词（点击收录）</span>
          {activeKeywords.map((kw) => (
            <button
              key={kw}
              type="button"
              className="timeline-kw-chip"
              onClick={() => onAddKeywordToJournal?.(kw)}
              title="加入旅行日志胶卷"
            >
              {kw}
            </button>
          ))}
        </div>
      ) : null}

      {journal?.length > 0 ? (
        <div className="filmstrip">
          <span className="filmstrip-label">旅行日志胶卷</span>
          <div className="filmstrip-reel">
            {journal.map((entry) => (
              <article key={entry.id} className="filmstrip-frame">
                {entry.thumb ? (
                  <img src={entry.thumb} alt="" className="filmstrip-thumb" />
                ) : (
                  <div className="filmstrip-placeholder" />
                )}
                <span className="filmstrip-title">{entry.title}</span>
                {entry.keywords?.length ? (
                  <div className="filmstrip-kws">
                    {entry.keywords.slice(0, 3).map((k) => (
                      <span key={k} className="filmstrip-kw">
                        {k}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
