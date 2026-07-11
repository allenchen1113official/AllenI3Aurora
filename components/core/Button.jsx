import React from "react";

// Padding/gap values align to the 4px spacing grid (tokens/spacing.css --space-*):
// sm = space-2/space-4 (8/16), md = space-3/space-5 (12/20), lg = space-4/space-6 (16/24).
const SIZES = {
  sm: { padding: "var(--space-2) var(--space-4)", fontSize: "var(--text-sm)", radius: "var(--radius-sm)", gap: 4 },
  md: { padding: "var(--space-3) var(--space-5)", fontSize: "var(--text-base)", radius: "var(--radius-md)", gap: 8 },
  lg: { padding: "var(--space-4) var(--space-6)", fontSize: "var(--text-md)", radius: "var(--radius-lg)", gap: 12 },
};

const VARIANTS = {
  primary:   { background: "var(--aurora-gradient)", color: "var(--text-on-accent)", border: "1px solid transparent", boxShadow: "var(--glow-brand)" },
  secondary: { background: "var(--night-700)", color: "var(--text-1)", border: "1px solid var(--border)" },
  outline:   { background: "transparent", color: "var(--text-1)", border: "1px solid var(--border-strong)" },
  ghost:     { background: "transparent", color: "var(--text-2)", border: "1px solid transparent" },
  danger:    { background: "var(--danger)", color: "var(--on-solid)", border: "1px solid transparent" },
};

/**
 * Primary action button. Aurora-gradient primary, plus secondary / outline /
 * ghost / danger variants in three sizes.
 */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  block = false,
  loading = false,
  disabled = false,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.primary;
  const isDisabled = disabled || loading;

  const css = {
    display: block ? "flex" : "inline-flex",
    width: block ? "100%" : undefined,
    alignItems: "center",
    justifyContent: "center",
    gap: s.gap,
    fontFamily: "var(--font-display)",
    fontWeight: "var(--fw-bold)",
    fontSize: s.fontSize,
    lineHeight: 1.1,
    padding: s.padding,
    borderRadius: s.radius,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.5 : 1,
    transform: hover && !isDisabled ? "translateY(-1px)" : "translateY(0)",
    filter: hover && !isDisabled ? "brightness(1.06) saturate(1.05)" : "none",
    transition: "transform var(--dur) var(--ease-out), filter var(--dur) var(--ease-out), background var(--dur)",
    whiteSpace: "nowrap",
    userSelect: "none",
    ...v,
    ...style,
  };

  return (
    <button
      style={css}
      disabled={isDisabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...rest}
    >
      {loading && <Spinner />}
      {!loading && icon}
      {children}
      {!loading && iconRight}
    </button>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        animation: "aurora-spin 0.7s linear infinite",
      }}
    />
  );
}
