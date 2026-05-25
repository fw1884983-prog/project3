import { JourneyLogLayout } from "./JourneyLogLayouts.jsx";

export default function JourneySettleModal({ log, onClose }) {
  if (!log) return null;

  return (
    <div className="settle-overlay" role="dialog" aria-modal="true">
      <div className="settle-panel settle-panel-wide">
        <header className="settle-head settle-head-compact">
          <div>
            <p className="settle-layout-badge">
              排版方案 {log.layout_variant || "A"}
              {log.layout_label ? ` · ${log.layout_label}` : ""}
            </p>
          </div>
          <button type="button" className="settle-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="settle-layout-wrap">
          <JourneyLogLayout log={log} />
        </div>
        {Array.isArray(log.sections) && log.sections.length > 0 ? (
          <details className="settle-details">
            <summary>展开完整段落</summary>
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
          </details>
        ) : null}
      </div>
    </div>
  );
}
