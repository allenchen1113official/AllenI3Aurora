import React from "react";

const TONES = {
  insight:      { fg: "var(--insight)", soft: "var(--insight-soft)" },
  intelligence: { fg: "var(--intelligence)", soft: "var(--intelligence-soft)" },
  illumination: { fg: "var(--illumination)", soft: "var(--illumination-soft)" },
  info:         { fg: "var(--info)", soft: "var(--info-soft)" },
  warning:      { fg: "var(--warning)", soft: "var(--warning-soft)" },
  danger:       { fg: "var(--danger)", soft: "var(--danger-soft)" },
};

/**
 * Tinted callout / note box with a colored left rail, icon, optional title and
 * body. Tones cover the three I's plus info / warning / danger.
 */
export function Callout({ tone = "insight", icon, title, children, style, ...rest }) {
  const t = TONES[tone] || TONES.insight;
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "var(--space-4) var(--space-5)",
        background: t.soft,
        borderRadius: "var(--radius-md)",
        borderLeft: `3px solid ${t.fg}`,
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ color: t.fg, flex: "none", display: "flex", marginTop: 1 }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>
        {title && (
          <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)", color: "var(--text-1)", fontSize: "var(--text-md)", marginBottom: children ? 4 : 0 }}>
            {title}
          </div>
        )}
        {children && (
          <div style={{ color: "var(--text-2)", fontSize: "var(--text-base)", lineHeight: 1.55 }}>{children}</div>
        )}
      </div>
    </div>
  );
}
