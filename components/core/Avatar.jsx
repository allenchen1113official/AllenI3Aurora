import React from "react";

const SIZES = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 };

/**
 * User / brand avatar. Shows an image, or falls back to initials on an aurora
 * tint. Optional gradient ring for "featured" state.
 */
export function Avatar({ src, name = "", size = "md", ring = false, style, ...rest }) {
  const dim = SIZES[size] || SIZES.md;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const inner = src ? (
    <img
      src={src}
      alt={name}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  ) : (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: "var(--fw-bold)",
        fontSize: dim * 0.4,
        color: "var(--text-on-accent)",
      }}
    >
      {initials || "·"}
    </span>
  );

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dim,
        height: dim,
        borderRadius: "50%",
        overflow: "hidden",
        flex: "none",
        background: src ? "var(--night-700)" : "var(--aurora-gradient)",
        border: ring ? "2px solid transparent" : "1px solid var(--border)",
        boxShadow: ring ? "0 0 0 2px var(--night-900), 0 0 0 4px var(--aurora-teal)" : "none",
        ...style,
      }}
      {...rest}
    >
      {inner}
    </span>
  );
}
