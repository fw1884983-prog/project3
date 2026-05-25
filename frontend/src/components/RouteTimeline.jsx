export default function RouteTimeline({ progress, onProgressChange, disabled }) {
  const pct = Math.round((progress ?? 0) * 100);

  return (
    <div className="route-timeline-compact" aria-label="路线进度">
      <span className="timeline-label">沿路探索</span>
      <input
        type="range"
        className="timeline-slider"
        min={0}
        max={1000}
        step={1}
        value={Math.round((progress ?? 0) * 1000)}
        disabled={disabled}
        onChange={(e) => onProgressChange(Number(e.target.value) / 1000)}
        aria-valuenow={pct}
        aria-label="拖动时间轴，车辆沿路线移动"
      />
      <span className="timeline-pct">{pct}%</span>
    </div>
  );
}
