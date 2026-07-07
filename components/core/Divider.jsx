import React from "react";

/**
 * Hairline divider. Horizontal by default; pass vertical for inline separators.
 * label renders a centered chip on the line ("or", section names, etc).
 */
export function Divider({ vertical = false, label, style, ...rest }) {
  if (vertical) {
    return (
      <span
        role="separator"
        style={{ width: 1, alignSelf: "stretch", background: "var(--border)", ...style }}
        {...rest}
      />
    );
  }
  if (label) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, ...style }} {...rest}>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span
          style={{
            fontSize: "var(--text-xs)",
            letterSpacing: "var(--ls-wider)",
            textTransform: "uppercase",
            color: "var(--text-3)",
            fontWeight: "var(--fw-semibold)",
          }}
        >
          {label}
        </span>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
    );
  }
  return <hr style={{ border: "none", height: 1, background: "var(--border)", ...style }} {...rest} />;
}
