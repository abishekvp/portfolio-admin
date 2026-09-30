import { useEffect, useMemo, useRef, useState } from 'react';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(v) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Multi-series line chart over days with a legend, crosshair + tooltip and a table fallback.
 * series: [{ key, label, slot }] where slot is the categorical colour slot (1, 2, ...).
 */
export function LineChart({ data, series, height = 240, title }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const pad = { top: 12, right: 12, bottom: 28, left: 36 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  const max = useMemo(() => niceMax(Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)))), [data, series]);
  const x = (i) => pad.left + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v) => pad.top + h - (v / max) * h;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(w / 70))));

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.left) / w) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  }

  return (
    <div className="chart">
      <div className="chart-top">
        <div className="legend" aria-label="Legend">
          {series.map((s) => (
            <span key={s.key} className="legend-item">
              <span className={`legend-line series-${s.slot}`} />
              {s.label}
            </span>
          ))}
        </div>
        <button className="link-btn small" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {showTable && (
        <div className="table-wrap chart-table">
          <table className="table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th>Day</th>
                {series.map((s) => (
                  <th key={s.key} className="num">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{shortDay(d.day)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="num">{d[s.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(
        <div ref={ref} className="chart-canvas" style={{ height, display: showTable ? 'none' : undefined }}>
          <svg width={width} height={height} role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} />
                <text className="axis-label" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {Math.round(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              i % labelEvery === 0 || i === data.length - 1 ? (
                <text key={d.day} className="axis-label" x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
                  {shortDay(d.day)}
                </text>
              ) : null
            )}
            {series.map((s) => (
              <path
                key={s.key}
                className={`series-line series-${s.slot}`}
                d={data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[s.key] || 0).toFixed(1)}`).join('')}
              />
            ))}
            {hover != null && (
              <g>
                <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} />
                {series.map((s) => (
                  <circle key={s.key} className={`series-dot series-${s.slot}`} cx={x(hover)} cy={y(data[hover][s.key] || 0)} r={4} />
                ))}
              </g>
            )}
          </svg>
          {hover != null && (
            <div className="chart-tooltip" style={{ left: Math.min(width - 150, Math.max(0, x(hover) + 12)), top: 8 }}>
              <div className="tt-title">{shortDay(data[hover].day)}</div>
              {series.map((s) => (
                <div key={s.key} className="tt-row">
                  <span className={`legend-line series-${s.slot}`} />
                  <strong>{data[hover][s.key] || 0}</strong>
                  <span className="muted">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars with direct labels (single hue: magnitude only). */
export function BarList({ items, empty = 'No data yet', format = (v) => v }) {
  if (!items?.length) return <p className="muted small">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="bar-list">
      {items.map((i) => (
        <li key={i.label} title={`${i.label}: ${format(i.count)}`}>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(2, (i.count / max) * 100)}%` }} />
            <span className="bar-label">{i.label}</span>
          </div>
          <span className="bar-value">{format(i.count)}</span>
        </li>
      ))}
    </ul>
  );
}

export function StatTile({ label, value, sub, icon: Icon }) {
  return (
    <div className="stat-tile">
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {Icon && <Icon size={16} className="muted" />}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub muted">{sub}</div>}
    </div>
  );
}
