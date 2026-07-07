import React from "react";

/**
 * Interactive pill for filters / topics. Supports selected state and an
 * optional remove (×) affordance.
 */
export function Tag({ selected = false, onRemove, icon, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: "var(--radius-pill)",
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-sm)",
        fontWeight: "var(--fw-semibold)",
        cursor: rest.onClick ? "pointer" : "default",
        background: selected ? "var(--brand-soft)" : hover ? "var(--night-700)" : "var(--night-800)",
        color: selected ? "var(--brand)" : "var(--text-2)",
        border: `1px solid ${selected ? "var(--border-aurora)" : "var(--border)"}`,
        transition: "background var(--dur), color var(--dur), border-color var(--dur)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(e); }}
          aria-label="Remove"
          style={{
            border: "none",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            display: "inline-flex",
            padding: 0,
            marginLeft: 2,
            opacity: 0.7,
            fontSize: "1.1em",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}
