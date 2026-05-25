export default function JourneySettleModal({ log, onClose }) {
  if (!log) return null;

  return (
    <div className="settle-overlay" role="dialog" aria-modal="true">
      <div className="settle-panel">
        <header className="settle-head">
          <h2>{log.title || "旅行日志"}</h2>
          {log.subtitle ? <p>{log.subtitle}</p> : null}
          <button type="button" className="settle-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        {log.full_story ? <div className="settle-story">{log.full_story}</div> : null}
        {Array.isArray(log.sections) && log.sections.length > 0 ? (
          <div className="settle-sections">
            {log.sections.map((s, i) => (
              <section key={i}>
                <h3>
                  {s.heading}
                  {s.place ? <span className="settle-place"> · {s.place}</span> : null}
                </h3>
                <p>{s.body}</p>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
