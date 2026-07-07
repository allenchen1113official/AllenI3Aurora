import React from "react";

const TONES = {
  neutral:      { fg: "var(--text-2)", soft: "var(--night-700)", solid: "var(--night-600)" },
  insight:      { fg: "var(--insight)", soft: "var(--insight-soft)", solid: "var(--insight)" },
  intelligence: { fg: "var(--intelligence)", soft: "var(--intelligence-soft)", solid: "var(--intelligence)" },
  illumination: { fg: "var(--illumination)", soft: "var(--illumination-soft)", solid: "var(--illumination)" },
  success:      { fg: "var(--success)", soft: "var(--success-soft)", solid: "var(--success)" },
  warning:      { fg: "var(--warning)", soft: "var(--warning-soft)", solid: "var(--warning)" },
  danger:       { fg: "var(--danger)", soft: "var(--danger-soft)", solid: "var(--danger)" },
};

/**
 * Small status / category label. Tones map to the three I's + semantic colors.
 * variant: "soft" (tinted) | "solid" (filled) | "outline".
 */
export function Badge({ tone = "neutral", variant = "soft", dot = false, children, style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  const looks = {
    soft:    { background: t.soft, color: t.fg, border: "1px solid transparent" },
    solid:   { background: t.solid, color: tone === "neutral" ? "var(--text-1)" : "var(--text-on-accent)", border: "1px solid transparent" },
    outline: { background: "transparent", color: t.fg, border: "1px solid currentColor" },
  };
  const l = looks[variant] || looks.soft;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--fw-semibold)",
        letterSpacing: "var(--ls-wide)",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...l,
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flex: "none" }} />
      )}
      {children}
    </span>
  );
}
