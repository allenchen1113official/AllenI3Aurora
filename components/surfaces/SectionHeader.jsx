import React from "react";

/**
 * Section heading block: uppercase aurora kicker, title, optional description,
 * and a right-aligned action slot. Used across dashboard and newsletter.
 */
export function SectionHeader({ kicker, title, description, action, align = "left", style, ...rest }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: "var(--space-5)",
        ...style,
      }}
      {...rest}
    >
      <div style={{ textAlign: align, maxWidth: 640 }}>
        {kicker && (
          <div
            style={{
              display: "inline-block",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--fw-bold)",
              letterSpacing: "var(--ls-wider)",
              textTransform: "uppercase",
              backgroundImage: "var(--text-gradient)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
              marginBottom: 8,
            }}
          >
            {kicker}
          </div>
        )}
        {title && (
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-black)", fontSize: "var(--text-2xl)", color: "var(--text-1)", margin: 0, lineHeight: 1.15 }}>
            {title}
          </h2>
        )}
        {description && (
          <p style={{ marginTop: 8, color: "var(--text-3)", fontSize: "var(--text-md)", lineHeight: 1.55 }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ flex: "none" }}>{action}</div>}
    </div>
  );
}
