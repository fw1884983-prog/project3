import { MIME, setDragData } from "../journeyDrag.js";

/** 仅在触发范围内显示；离开范围由父组件卸载 */
export default function KeywordRail({ keywords, poiName }) {
  if (!keywords?.length) return null;

  return (
    <aside className="kw-rail" aria-label="当前地点关键词">
      <p className="kw-rail-title">关键词</p>
      <p className="kw-rail-sub">{poiName}</p>
      <div className="kw-rail-list">
        {keywords.map((kw) => (
          <div
            key={kw}
            className="kw-chip-draggable"
            draggable
            onDragStart={(e) => setDragData(e, MIME.KEYWORD, { keyword: kw, poiName })}
            title="拖到右侧百科展开，或拖到底部胶卷帧"
          >
            {kw}
          </div>
        ))}
      </div>
    </aside>
  );
}
