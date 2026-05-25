import { MIME, setDragData } from "../journeyDrag.js";

export default function EncyclopediaPanel({
  visible,
  card,
  poi,
  loading,
  expandLoading,
  error,
  onDropKeyword,
}) {
  if (!visible && !loading && !expandLoading) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(MIME.KEYWORD);
    if (!raw) return;
    try {
      const { keyword } = JSON.parse(raw);
      if (keyword) onDropKeyword?.(keyword);
    } catch {
      /* ignore */
    }
  };

  return (
    <aside
      className={`ency-popup${visible ? " is-visible" : ""}`}
      aria-live="polite"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <header className="ency-popup-head">
        <h2>{loading || expandLoading ? "编织档案…" : card?.title || poi?.name || "城市百科"}</h2>
        <p className="ency-drop-hint">拖入左侧关键词以展开新一版百科档案</p>
      </header>

      {error ? <p className="ency-error">{error}</p> : null}

      {loading || expandLoading ? (
        <div className="ency-skeleton">
          <div className="sk-line sk-wide" />
          <div className="sk-line" />
        </div>
      ) : card ? (
        <div className="ency-popup-body">
          {card.cultural_summary ? (
            <p
              className="ency-draggable-text"
              draggable
              onDragStart={(e) =>
                setDragData(e, MIME.TEXT, {
                  title: card.title,
                  text: card.cultural_summary,
                })
              }
            >
              {card.cultural_summary}
            </p>
          ) : null}

          {card.image_gallery?.length > 0 ? (
            <div className="ency-img-grid">
              {card.image_gallery.map((img, i) => (
                <figure
                  key={img.url || i}
                  className="ency-img-tile"
                  draggable
                  onDragStart={(e) =>
                    setDragData(e, MIME.IMAGE, {
                      url: img.url,
                      caption: img.caption,
                    })
                  }
                >
                  <img src={img.url} alt={img.caption || ""} loading="lazy" />
                  <figcaption>{img.caption}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}

          <DraggableSection title="历史" text={card.sections?.historical_background} cardTitle={card.title} />
          <DraggableSection title="城市身份" text={card.sections?.architecture_urban_identity} cardTitle={card.title} />
          <DraggableSection title="故事" text={card.sections?.notable_stories} cardTitle={card.title} />
          <DraggableSection title="氛围" text={card.sections?.atmosphere} cardTitle={card.title} />
        </div>
      ) : (
        <p className="ency-placeholder">靠近路线上的地点以唤起百科</p>
      )}
    </aside>
  );
}

function DraggableSection({ title, text, cardTitle }) {
  if (!text?.trim()) return null;
  return (
    <section className="ency-mini-section">
      <h3>{title}</h3>
      <p
        className="ency-draggable-text"
        draggable
        onDragStart={(e) =>
          setDragData(e, MIME.TEXT, {
            title: `${cardTitle} · ${title}`,
            text,
          })
        }
      >
        {text}
      </p>
    </section>
  );
}
