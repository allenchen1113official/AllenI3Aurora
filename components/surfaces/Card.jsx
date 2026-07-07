import React from "react";

const ACCENTS = {
  none:         { line: "transparent", glow: "none" },
  aurora:       { line: "var(--aurora-gradient)", glow: "var(--glow-brand)" },
  insight:      { line: "var(--insight-gradient)", glow: "var(--glow-insight)" },
  intelligence: { line: "var(--intelligence-gradient)", glow: "var(--glow-intelligence)" },
  illumination: { line: "var(--illumination-gradient)", glow: "var(--glow-illumination)" },
};

/**
 * Base surface card. Optional top accent bar (`accent`), glass blur, and an
 * interactive hover-lift. Compose everything else inside.
 */
export function Card({
  accent = "none",
  glass = false,
  interactive = false,
  glow = false,
  padding = "var(--space-6)",
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const a = ACCENTS[accent] || ACCENTS.none;

  return (
    <div
      onMouseEnter={() => interactive && setHover(true)}
      onMouseLeave={() => interactive && setHover(false)}
      style={{
        position: "relative",
        background: glass ? "var(--glass-fill)" : "var(--night-800)",
        backdropFilter: glass ? "var(--blur)" : undefined,
        WebkitBackdropFilter: glass ? "var(--blur)" : undefined,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        padding,
        boxShadow: (glow && a.glow !== "none") ? a.glow : (hover ? "var(--shadow-lg)" : "var(--shadow-card)"),
        transform: hover ? "translateY(-3px)" : "none",
        transition: "transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), border-color var(--dur)",
        cursor: interactive ? "pointer" : "default",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {accent !== "none" && (
        <span
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: a.line,
          }}
        />
      )}
      {children}
    </div>
  );
}
