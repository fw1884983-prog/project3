import { MIME, getDragData, newItemId } from "../journeyDrag.js";

export default function JourneyFilmstrip({
  frames,
  activeFrameId,
  onSelectFrame,
  onDropItem,
  onSettle,
  settling,
}) {
  const handleDrop = (e, frameId) => {
    e.preventDefault();
    const kw = getDragData(e, MIME.KEYWORD);
    const txt = getDragData(e, MIME.TEXT);
    const img = getDragData(e, MIME.IMAGE);
    if (kw) {
      onDropItem(frameId, { id: newItemId(), type: "keyword", label: kw.keyword });
      return;
    }
    if (txt) {
      onDropItem(frameId, {
        id: newItemId(),
        type: "text",
        label: txt.title || "摘录",
        text: txt.text,
      });
      return;
    }
    if (img) {
      onDropItem(frameId, {
        id: newItemId(),
        type: "image",
        label: img.caption || "图片",
        url: img.url,
      });
    }
  };

  return (
    <div className="journey-filmstrip" aria-label="旅行日志胶卷">
      <div className="filmstrip-toolbar">
        <span className="filmstrip-title">旅行日志胶卷</span>
        <span className="filmstrip-hint">每到达新地点自动生成一帧 · 拖入关键词或百科内容</span>
        <button
          type="button"
          className="btn btn-settle"
          disabled={!frames.length || settling}
          onClick={onSettle}
        >
          {settling ? "结算中…" : "结算旅行日志"}
        </button>
      </div>
      <div className="filmstrip-reel">
        {frames.length === 0 ? (
          <p className="filmstrip-empty">完成叙事分析后，沿路拖动时间轴经过地点以生成胶卷帧</p>
        ) : (
          frames.map((f, idx) => (
            <article
              key={f.id}
              className={`film-frame${f.id === activeFrameId ? " is-active" : ""}`}
              onClick={() => onSelectFrame(f.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, f.id)}
            >
              <div className="film-sprocket" aria-hidden />
              <div className="film-frame-inner">
                <span className="film-order">#{idx + 1}</span>
                <span className="film-place">{f.poiName}</span>
                <div className="film-items">
                  {f.items.length === 0 ? (
                    <span className="film-drop-hint">拖入内容</span>
                  ) : (
                    f.items.map((it) => (
                      <div key={it.id} className={`film-item film-item-${it.type}`}>
                        {it.type === "image" && it.url ? (
                          <img src={it.url} alt="" className="film-item-img" />
                        ) : null}
                        <span>{it.label || it.text?.slice(0, 40)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="film-sprocket" aria-hidden />
            </article>
          ))
        )}
      </div>
    </div>
  );
}
