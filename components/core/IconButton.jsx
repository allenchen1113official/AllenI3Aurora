import React from "react";

const SIZES = { sm: 32, md: 40, lg: 48 };

/**
 * Square icon-only button. Same variants as Button; pass an icon element
 * (SVG / icon-font glyph) as children.
 */
export function IconButton({
  variant = "ghost",
  size = "md",
  label,
  active = false,
  disabled = false,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const dim = SIZES[size] || SIZES.md;

  const variants = {
    solid:   { background: "var(--aurora-gradient)", color: "var(--text-on-accent)", border: "1px solid transparent" },
    surface: { background: "var(--night-700)", color: "var(--text-1)", border: "1px solid var(--border)" },
    ghost:   { background: active ? "var(--brand-soft)" : "transparent", color: active ? "var(--brand)" : "var(--text-2)", border: "1px solid transparent" },
  };
  const v = variants[variant] || variants.ghost;

  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: dim,
        height: dim,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: hover && !disabled && variant === "ghost" ? "var(--night-700)" : v.background,
        color: v.color,
        border: v.border,
        transition: "background var(--dur), color var(--dur), transform var(--dur) var(--ease-out)",
        transform: hover && !disabled ? "translateY(-1px)" : "none",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
