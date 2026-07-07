import React from "react";

const TONES = {
  insight: "var(--insight)",
  intelligence: "var(--intelligence)",
  illumination: "var(--illumination)",
  brand: "var(--aurora-teal)",
};

/**
 * Dashboard metric widget: label, big value, delta chip, and an optional inline
 * sparkline. `deltaMode="finance"` uses Taiwan 紅漲綠跌 colors; "semantic" uses
 * green-up / red-down.
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaMode = "semantic",
  spark,
  icon,
  tone = "brand",
  style,
  ...rest
}) {
  const accent = TONES[tone] || TONES.brand;
  const up = typeof delta === "number" ? delta >= 0 : String(delta || "").trim().startsWith("+");
  const deltaColor =
    delta == null ? "var(--text-3)"
    : deltaMode === "finance" ? (up ? "var(--finance-up)" : "var(--finance-down)")
    : (up ? "var(--success)" : "var(--danger)");
  const deltaText = typeof delta === "number" ? `${up ? "+" : ""}${delta}%` : delta;

  return (
    <div
      style={{
        background: "var(--night-800)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
        ...style,
      }}
      {...rest}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-3)", fontWeight: "var(--fw-semibold)" }}>
          {label}
        </span>
        {icon && (
          <span style={{ color: accent, display: "flex", opacity: 0.9 }}>{icon}</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-black)", fontSize: "var(--text-3xl)", color: "var(--text-1)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: "var(--text-md)", color: "var(--text-3)", fontWeight: "var(--fw-semibold)" }}>{unit}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        {delta != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: deltaColor, fontWeight: "var(--fw-bold)", fontSize: "var(--text-sm)", fontFamily: "var(--font-mono)" }}>
            <span style={{ fontSize: "1.1em" }}>{up ? "▲" : "▼"}</span>{deltaText}
          </span>
        )}
        {spark && <span style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>{spark}</span>}
      </div>
    </div>
  );
}

/** Tiny inline sparkline. Pass an array of numbers as `data`. */
export function Sparkline({ data = [], width = 96, height = 30, color = "var(--aurora-teal)" }) {
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const pts = data.map((d, i) => `${i * step},${height - ((d - min) / span) * (height - 4) - 2}`).join(" ");
  const id = "sg" + Math.random().toString(36).slice(2, 7);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${id})`} />
    </svg>
  );
}
