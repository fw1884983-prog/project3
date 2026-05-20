export default function EncyclopediaPanel({ card, poi, loading, error, onClose }) {
  if (!card && !loading && !error) return null;

  return (
    <aside className="encyclopedia-panel" aria-live="polite">
      <header className="ency-header">
        <div className="ency-badge" aria-hidden />
        <div className="ency-header-text">
          {loading ? (
            <h2 className="ency-title">正在编织城市记忆…</h2>
          ) : (
            <>
              <h2 className="ency-title">{card?.title || poi?.name || "城市百科"}</h2>
              {card?.subtitle ? <p className="ency-subtitle">{card.subtitle}</p> : null}
            </>
          )}
        </div>
        <button type="button" className="ency-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </header>

      {error ? <p className="ency-error">{error}</p> : null}

      {loading ? (
        <div className="ency-skeleton">
          <div className="sk-line sk-wide" />
          <div className="sk-line" />
          <div className="sk-line sk-short" />
        </div>
      ) : card ? (
        <div className="ency-body">
          {card.keywords?.length > 0 ? (
            <div className="ency-keywords">
              {card.keywords.map((kw) => (
                <span key={kw} className="ency-kw">
                  {kw}
                </span>
              ))}
            </div>
          ) : null}

          {card.cultural_summary ? (
            <section className="ency-section ency-lead">
              <h3>文化概览</h3>
              <p>{card.cultural_summary}</p>
            </section>
          ) : null}

          {card.image_gallery?.length > 0 ? (
            <section className="ency-section">
              <h3>影像档案</h3>
              <Gallery images={card.image_gallery} />
            </section>
          ) : null}

          <Section title="历史背景" text={card.sections?.historical_background} />
          <Section title="建筑与城市身份" text={card.sections?.architecture_urban_identity} />
          <Section title="地方故事" text={card.sections?.notable_stories} />
          <Section title="在地认同" text={card.sections?.local_identity} />
          <Section title="旅行印象" text={card.sections?.travel_impressions} />
          <Section title="氛围与感受" text={card.sections?.atmosphere} />

          {card.timeline_snippets?.length > 0 ? (
            <section className="ency-section">
              <h3>时间片段</h3>
              <ul className="ency-timeline">
                {card.timeline_snippets.map((t, i) => (
                  <li key={`${t.period}-${i}`}>
                    <span className="ency-time-period">{t.period}</span>
                    <span className="ency-time-event">{t.event}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {card.related_nearby?.length > 0 ? (
            <section className="ency-section">
              <h3>附近相关地点</h3>
              <ul className="ency-nearby">
                {card.related_nearby.map((r) => (
                  <li key={r.name}>
                    <strong>{r.name}</strong>
                    <span>{r.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {card.sources?.length > 0 ? (
            <footer className="ency-sources">
              <span className="ency-sources-label">参考来源</span>
              {card.sources.map((s) => (
                <a key={s.url || s.title} href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title || s.url}
                </a>
              ))}
            </footer>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function Section({ title, text }) {
  if (!text?.trim()) return null;
  return (
    <section className="ency-section">
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function Gallery({ images }) {
  return (
    <div className="ency-gallery">
      {images.map((img, i) => (
        <figure key={img.url || i} className="ency-gallery-item">
          <img src={img.url} alt={img.caption || ""} loading="lazy" />
          {img.caption ? <figcaption>{img.caption}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}
