/* @ds-bundle: {"format":3,"namespace":"AllenAuroraDesignSystem_e6fd5f","components":[{"name":"AuroraText","sourcePath":"components/core/AuroraText.jsx"},{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Divider","sourcePath":"components/core/Divider.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/forms/Tabs.jsx"},{"name":"Callout","sourcePath":"components/surfaces/Callout.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"SectionHeader","sourcePath":"components/surfaces/SectionHeader.jsx"},{"name":"StatCard","sourcePath":"components/surfaces/StatCard.jsx"},{"name":"Sparkline","sourcePath":"components/surfaces/StatCard.jsx"}],"sourceHashes":{"components/core/AuroraText.jsx":"76320f7331f6","components/core/Avatar.jsx":"c17d2076308b","components/core/Badge.jsx":"a4957fc778d5","components/core/Button.jsx":"63b8760ae70d","components/core/Divider.jsx":"3cf0345be5bf","components/core/IconButton.jsx":"358c5158c5ed","components/core/Tag.jsx":"53424d9423ae","components/forms/Input.jsx":"195445f7d734","components/forms/Switch.jsx":"6f2aa7b6afa1","components/forms/Tabs.jsx":"e8778b5eb05a","components/surfaces/Callout.jsx":"5902bad69654","components/surfaces/Card.jsx":"af560e350dd0","components/surfaces/SectionHeader.jsx":"061648e21bef","components/surfaces/StatCard.jsx":"82b61f642542","ui_kits/aurora/Archive.jsx":"4c61b4a04c5d","ui_kits/aurora/Dashboard.jsx":"cbc8e928bb86","ui_kits/aurora/NewsletterIssue.jsx":"43739e589b0b","ui_kits/aurora/Subscribe.jsx":"0c4091f4f64e","ui_kits/aurora/Timeline.jsx":"9b22a680f2a9","ui_kits/aurora/kit.jsx":"36e7107bfc41"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AllenAuroraDesignSystem_e6fd5f = window.AllenAuroraDesignSystem_e6fd5f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/AuroraText.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Aurora gradient display text. Wraps children in the brand gradient clipped to
 * text — used for masthead, hero numbers, and the I³ wordmark.
 */
function AuroraText({
  as = "span",
  gradient = "var(--text-gradient)",
  children,
  style,
  ...rest
}) {
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      backgroundImage: gradient,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
      display: "inline-block",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { AuroraText });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/AuroraText.jsx", error: String((e && e.message) || e) }); }

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80
};

/**
 * User / brand avatar. Shows an image, or falls back to initials on an aurora
 * tint. Optional gradient ring for "featured" state.
 */
function Avatar({
  src,
  name = "",
  size = "md",
  ring = false,
  style,
  ...rest
}) {
  const dim = SIZES[size] || SIZES.md;
  const initials = name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const inner = src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block"
    }
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-bold)",
      fontSize: dim * 0.4,
      color: "var(--text-on-accent)"
    }
  }, initials || "·");
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
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
      ...style
    }
  }, rest), inner);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  neutral: {
    fg: "var(--text-2)",
    soft: "var(--night-700)",
    solid: "var(--night-600)"
  },
  insight: {
    fg: "var(--insight)",
    soft: "var(--insight-soft)",
    solid: "var(--insight)"
  },
  intelligence: {
    fg: "var(--intelligence)",
    soft: "var(--intelligence-soft)",
    solid: "var(--intelligence)"
  },
  illumination: {
    fg: "var(--illumination)",
    soft: "var(--illumination-soft)",
    solid: "var(--illumination)"
  },
  success: {
    fg: "var(--success)",
    soft: "var(--success-soft)",
    solid: "var(--success)"
  },
  warning: {
    fg: "var(--warning)",
    soft: "var(--warning-soft)",
    solid: "var(--warning)"
  },
  danger: {
    fg: "var(--danger)",
    soft: "var(--danger-soft)",
    solid: "var(--danger)"
  }
};

/**
 * Small status / category label. Tones map to the three I's + semantic colors.
 * variant: "soft" (tinted) | "solid" (filled) | "outline".
 */
function Badge({
  tone = "neutral",
  variant = "soft",
  dot = false,
  children,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.neutral;
  const looks = {
    soft: {
      background: t.soft,
      color: t.fg,
      border: "1px solid transparent"
    },
    solid: {
      background: t.solid,
      color: tone === "neutral" ? "var(--text-1)" : "var(--text-on-accent)",
      border: "1px solid transparent"
    },
    outline: {
      background: "transparent",
      color: t.fg,
      border: "1px solid currentColor"
    }
  };
  const l = looks[variant] || looks.soft;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
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
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "currentColor",
      flex: "none"
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    padding: "6px 14px",
    fontSize: "var(--text-sm)",
    radius: "var(--radius-sm)",
    gap: 6
  },
  md: {
    padding: "9px 18px",
    fontSize: "var(--text-base)",
    radius: "var(--radius-md)",
    gap: 8
  },
  lg: {
    padding: "13px 26px",
    fontSize: "var(--text-md)",
    radius: "var(--radius-lg)",
    gap: 10
  }
};
const VARIANTS = {
  primary: {
    background: "var(--aurora-gradient)",
    color: "var(--text-on-accent)",
    border: "1px solid transparent",
    boxShadow: "var(--glow-brand)"
  },
  secondary: {
    background: "var(--night-700)",
    color: "var(--text-1)",
    border: "1px solid var(--border)"
  },
  outline: {
    background: "transparent",
    color: "var(--text-1)",
    border: "1px solid var(--border-strong)"
  },
  ghost: {
    background: "transparent",
    color: "var(--text-2)",
    border: "1px solid transparent"
  },
  danger: {
    background: "var(--danger)",
    color: "#fff",
    border: "1px solid transparent"
  }
};

/**
 * Primary action button. Aurora-gradient primary, plus secondary / outline /
 * ghost / danger variants in three sizes.
 */
function Button({
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
    ...style
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    style: css,
    disabled: isDisabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false)
  }, rest), loading && /*#__PURE__*/React.createElement(Spinner, null), !loading && icon, children, !loading && iconRight);
}
function Spinner() {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      borderRadius: "50%",
      border: "2px solid currentColor",
      borderTopColor: "transparent",
      display: "inline-block",
      animation: "aurora-spin 0.7s linear infinite"
    }
  });
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Divider.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Hairline divider. Horizontal by default; pass vertical for inline separators.
 * label renders a centered chip on the line ("or", section names, etc).
 */
function Divider({
  vertical = false,
  label,
  style,
  ...rest
}) {
  if (vertical) {
    return /*#__PURE__*/React.createElement("span", _extends({
      role: "separator",
      style: {
        width: 1,
        alignSelf: "stretch",
        background: "var(--border)",
        ...style
      }
    }, rest));
  }
  if (label) {
    return /*#__PURE__*/React.createElement("div", _extends({
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        ...style
      }
    }, rest), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 1,
        background: "var(--border)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-xs)",
        letterSpacing: "var(--ls-wider)",
        textTransform: "uppercase",
        color: "var(--text-3)",
        fontWeight: "var(--fw-semibold)"
      }
    }, label), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        height: 1,
        background: "var(--border)"
      }
    }));
  }
  return /*#__PURE__*/React.createElement("hr", _extends({
    style: {
      border: "none",
      height: 1,
      background: "var(--border)",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Divider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Divider.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: 32,
  md: 40,
  lg: 48
};

/**
 * Square icon-only button. Same variants as Button; pass an icon element
 * (SVG / icon-font glyph) as children.
 */
function IconButton({
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
    solid: {
      background: "var(--aurora-gradient)",
      color: "var(--text-on-accent)",
      border: "1px solid transparent"
    },
    surface: {
      background: "var(--night-700)",
      color: "var(--text-1)",
      border: "1px solid var(--border)"
    },
    ghost: {
      background: active ? "var(--brand-soft)" : "transparent",
      color: active ? "var(--brand)" : "var(--text-2)",
      border: "1px solid transparent"
    }
  };
  const v = variants[variant] || variants.ghost;
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    title: label,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
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
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Interactive pill for filters / topics. Supports selected state and an
 * optional remove (×) affordance.
 */
function Tag({
  selected = false,
  onRemove,
  icon,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
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
      ...style
    }
  }, rest), icon, children, onRemove && /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onRemove(e);
    },
    "aria-label": "Remove",
    style: {
      border: "none",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      display: "inline-flex",
      padding: 0,
      marginLeft: 2,
      opacity: 0.7,
      fontSize: "1.1em",
      lineHeight: 1
    }
  }, "\xD7"));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Text input field with optional label, leading icon, hint and error.
 * Built for the subscribe form and dashboard search.
 */
function Input({
  label,
  hint,
  error,
  icon,
  suffix,
  size = "md",
  style,
  id,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const pad = size === "lg" ? "14px 16px" : size === "sm" ? "8px 12px" : "11px 14px";
  const fieldId = id || (label ? `in-${label}` : undefined);
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: fieldId,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 7,
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-sm)",
      fontWeight: "var(--fw-semibold)",
      color: "var(--text-2)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: pad,
      background: "var(--night-800)",
      borderRadius: "var(--radius-md)",
      border: `1px solid ${error ? "var(--danger)" : focus ? "var(--border-aurora)" : "var(--border)"}`,
      boxShadow: focus && !error ? "var(--focus-ring)" : "none",
      transition: "border-color var(--dur), box-shadow var(--dur)"
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-3)",
      display: "flex",
      flex: "none"
    }
  }, icon), /*#__PURE__*/React.createElement("input", _extends({
    id: fieldId,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: "none",
      outline: "none",
      background: "transparent",
      color: "var(--text-1)",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-md)"
    }
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-3)",
      flex: "none"
    }
  }, suffix)), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-xs)",
      color: error ? "var(--danger)" : "var(--text-3)"
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * On/off toggle. Controlled via `checked` + `onChange`, or uncontrolled with
 * `defaultChecked`. Track fills with the aurora gradient when on.
 */
function Switch({
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  size = "md",
  label,
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isControlled = checked !== undefined;
  const on = isControlled ? checked : internal;
  const W = size === "sm" ? 36 : 46;
  const H = size === "sm" ? 20 : 26;
  const knob = H - 6;
  function toggle() {
    if (disabled) return;
    if (!isControlled) setInternal(!on);
    onChange && onChange(!on);
  }
  const track = /*#__PURE__*/React.createElement("span", _extends({
    onClick: toggle,
    role: "switch",
    "aria-checked": on,
    style: {
      width: W,
      height: H,
      borderRadius: "var(--radius-pill)",
      background: on ? "var(--aurora-gradient)" : "var(--night-600)",
      border: "1px solid " + (on ? "transparent" : "var(--border)"),
      position: "relative",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background var(--dur) var(--ease-out)",
      flex: "none",
      boxShadow: on ? "var(--glow-brand)" : "none",
      ...(!label ? style : {})
    }
  }, !label ? rest : {}), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 2,
      left: on ? W - knob - 3 : 2,
      width: knob,
      height: knob,
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "var(--shadow-sm)",
      transition: "left var(--dur) var(--ease-soft)"
    }
  }));
  if (!label) return track;
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      ...style
    }
  }, rest), track, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-md)",
      color: "var(--text-2)"
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Tabs.jsx
try { (() => {
/**
 * Segmented tab control. Pass `items` [{ id, label, icon }], the active `value`,
 * and `onChange`. `variant`: "segment" (pill track) | "underline".
 */
function Tabs({
  items = [],
  value,
  defaultValue,
  onChange,
  variant = "segment",
  style
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? items[0]?.id);
  const active = value !== undefined ? value : internal;
  function pick(id) {
    if (value === undefined) setInternal(id);
    onChange && onChange(id);
  }
  if (variant === "underline") {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 22,
        borderBottom: "1px solid var(--border)",
        ...style
      }
    }, items.map(it => {
      const on = it.id === active;
      return /*#__PURE__*/React.createElement("button", {
        key: it.id,
        onClick: () => pick(it.id),
        style: {
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: "10px 2px",
          marginBottom: -1,
          fontFamily: "var(--font-display)",
          fontWeight: "var(--fw-bold)",
          fontSize: "var(--text-md)",
          color: on ? "var(--text-1)" : "var(--text-3)",
          borderBottom: `2px solid ${on ? "var(--aurora-teal)" : "transparent"}`,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          transition: "color var(--dur)"
        }
      }, it.icon, it.label);
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      gap: 4,
      padding: 4,
      background: "var(--night-800)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, items.map(it => {
    const on = it.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      onClick: () => pick(it.id),
      style: {
        border: "none",
        cursor: "pointer",
        padding: "7px 16px",
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-display)",
        fontWeight: "var(--fw-bold)",
        fontSize: "var(--text-base)",
        color: on ? "var(--text-on-accent)" : "var(--text-2)",
        background: on ? "var(--aurora-gradient)" : "transparent",
        boxShadow: on ? "var(--shadow-sm)" : "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        transition: "background var(--dur), color var(--dur)"
      }
    }, it.icon, it.label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Callout.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  insight: {
    fg: "var(--insight)",
    soft: "var(--insight-soft)"
  },
  intelligence: {
    fg: "var(--intelligence)",
    soft: "var(--intelligence-soft)"
  },
  illumination: {
    fg: "var(--illumination)",
    soft: "var(--illumination-soft)"
  },
  info: {
    fg: "var(--info)",
    soft: "var(--info-soft)"
  },
  warning: {
    fg: "var(--warning)",
    soft: "var(--warning-soft)"
  },
  danger: {
    fg: "var(--danger)",
    soft: "var(--danger-soft)"
  }
};

/**
 * Tinted callout / note box with a colored left rail, icon, optional title and
 * body. Tones cover the three I's plus info / warning / danger.
 */
function Callout({
  tone = "insight",
  icon,
  title,
  children,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.insight;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      gap: 14,
      padding: "var(--space-4) var(--space-5)",
      background: t.soft,
      borderRadius: "var(--radius-md)",
      borderLeft: `3px solid ${t.fg}`,
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.fg,
      flex: "none",
      display: "flex",
      marginTop: 1
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-bold)",
      color: "var(--text-1)",
      fontSize: "var(--text-md)",
      marginBottom: children ? 4 : 0
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-2)",
      fontSize: "var(--text-base)",
      lineHeight: 1.55
    }
  }, children)));
}
Object.assign(__ds_scope, { Callout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Callout.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ACCENTS = {
  none: {
    line: "transparent",
    glow: "none"
  },
  aurora: {
    line: "var(--aurora-gradient)",
    glow: "var(--glow-brand)"
  },
  insight: {
    line: "var(--insight-gradient)",
    glow: "var(--glow-insight)"
  },
  intelligence: {
    line: "var(--intelligence-gradient)",
    glow: "var(--glow-intelligence)"
  },
  illumination: {
    line: "var(--illumination-gradient)",
    glow: "var(--glow-illumination)"
  }
};

/**
 * Base surface card. Optional top accent bar (`accent`), glass blur, and an
 * interactive hover-lift. Compose everything else inside.
 */
function Card({
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
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => interactive && setHover(true),
    onMouseLeave: () => interactive && setHover(false),
    style: {
      position: "relative",
      background: glass ? "var(--glass-fill)" : "var(--night-800)",
      backdropFilter: glass ? "var(--blur)" : undefined,
      WebkitBackdropFilter: glass ? "var(--blur)" : undefined,
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-xl)",
      padding,
      boxShadow: glow && a.glow !== "none" ? a.glow : hover ? "var(--shadow-lg)" : "var(--shadow-card)",
      transform: hover ? "translateY(-3px)" : "none",
      transition: "transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out), border-color var(--dur)",
      cursor: interactive ? "pointer" : "default",
      overflow: "hidden",
      ...style
    }
  }, rest), accent !== "none" && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      background: a.line
    }
  }), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/SectionHeader.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Section heading block: uppercase aurora kicker, title, optional description,
 * and a right-aligned action slot. Used across dashboard and newsletter.
 */
function SectionHeader({
  kicker,
  title,
  description,
  action,
  align = "left",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 16,
      marginBottom: "var(--space-5)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: align,
      maxWidth: 640
    }
  }, kicker && /*#__PURE__*/React.createElement("div", {
    style: {
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
      marginBottom: 8
    }
  }, kicker), title && /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-black)",
      fontSize: "var(--text-2xl)",
      color: "var(--text-1)",
      margin: 0,
      lineHeight: 1.15
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 8,
      color: "var(--text-3)",
      fontSize: "var(--text-md)",
      lineHeight: 1.55
    }
  }, description)), action && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: "none"
    }
  }, action));
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  insight: "var(--insight)",
  intelligence: "var(--intelligence)",
  illumination: "var(--illumination)",
  brand: "var(--aurora-teal)"
};

/**
 * Dashboard metric widget: label, big value, delta chip, and an optional inline
 * sparkline. `deltaMode="finance"` uses Taiwan 紅漲綠跌 colors; "semantic" uses
 * green-up / red-down.
 */
function StatCard({
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
  const deltaColor = delta == null ? "var(--text-3)" : deltaMode === "finance" ? up ? "var(--finance-up)" : "var(--finance-down)" : up ? "var(--success)" : "var(--danger)";
  const deltaText = typeof delta === "number" ? `${up ? "+" : ""}${delta}%` : delta;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: "var(--night-800)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-5)",
      boxShadow: "var(--shadow-card)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minWidth: 0,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-sm)",
      color: "var(--text-3)",
      fontWeight: "var(--fw-semibold)"
    }
  }, label), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: accent,
      display: "flex",
      opacity: 0.9
    }
  }, icon)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: "var(--fw-black)",
      fontSize: "var(--text-3xl)",
      color: "var(--text-1)",
      lineHeight: 1,
      fontVariantNumeric: "tabular-nums"
    }
  }, value), unit && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-md)",
      color: "var(--text-3)",
      fontWeight: "var(--fw-semibold)"
    }
  }, unit)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10
    }
  }, delta != null && /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      color: deltaColor,
      fontWeight: "var(--fw-bold)",
      fontSize: "var(--text-sm)",
      fontFamily: "var(--font-mono)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "1.1em"
    }
  }, up ? "▲" : "▼"), deltaText), spark && /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      display: "flex",
      justifyContent: "flex-end"
    }
  }, spark)));
}

/** Tiny inline sparkline. Pass an array of numbers as `data`. */
function Sparkline({
  data = [],
  width = 96,
  height = 30,
  color = "var(--aurora-teal)"
}) {
  if (!data.length) return null;
  const min = Math.min(...data),
    max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const pts = data.map((d, i) => `${i * step},${height - (d - min) / span * (height - 4) - 2}`).join(" ");
  const id = "sg" + Math.random().toString(36).slice(2, 7);
  return /*#__PURE__*/React.createElement("svg", {
    width: width,
    height: height,
    viewBox: `0 0 ${width} ${height}`,
    style: {
      display: "block",
      overflow: "visible"
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: id,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: color,
    stopOpacity: "0.35"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: color,
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("polyline", {
    points: pts,
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: `0,${height} ${pts} ${width},${height}`,
    fill: `url(#${id})`
  }));
}
Object.assign(__ds_scope, { StatCard, Sparkline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/StatCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/Archive.jsx
try { (() => {
/* Archive — past issues grid with cadence filter */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const {
    Card,
    Badge,
    Tag,
    Button,
    IconButton,
    Tabs,
    SectionHeader
  } = NS;
  function IssueCard({
    it
  }) {
    const I = window.Icons;
    return /*#__PURE__*/React.createElement(Card, {
      interactive: true,
      padding: "0",
      style: {
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        height: 150
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: it.cover,
      alt: "",
      style: {
        width: "100%",
        height: "100%",
        objectFit: "cover"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to top, rgba(5,7,15,.55), transparent 60%)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        top: 12,
        left: 12,
        display: "flex",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: it.tone,
      variant: "solid"
    }, it.kind)), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        bottom: 10,
        right: 12,
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        color: "#fff",
        fontSize: 13,
        textShadow: "0 1px 6px rgba(0,0,0,.6)"
      }
    }, "No.", it.no)), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "16px 18px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-3)",
        fontSize: 12.5,
        fontFamily: "var(--font-mono)"
      }
    }, it.date), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        color: "var(--text-1)",
        fontSize: "var(--text-lg)",
        lineHeight: 1.32,
        flex: 1
      }
    }, it.title), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-3)",
        fontSize: 12.5
      }
    }, it.items, " \u5247\u5F59\u6574"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: "var(--brand)",
        fontWeight: 700,
        fontSize: 13
      }
    }, "\u95B1\u8B80 ", /*#__PURE__*/React.createElement(I.arrow, {
      size: 15
    })))));
  }
  function Archive() {
    const K = window.KIT,
      I = window.Icons;
    const [filter, setFilter] = React.useState("all");
    const map = {
      all: null,
      day: "日報",
      week: "週報",
      month: "月報"
    };
    const list = K.issues.filter(x => !map[filter] || x.kind === map[filter]);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "var(--space-8)"
      }
    }, /*#__PURE__*/React.createElement(SectionHeader, {
      kicker: "ARCHIVE \xB7 \u6B77\u671F\u5F59\u6574",
      title: "\u6BCF\u4E00\u671F\uFF0C\u90FD\u662F\u4E00\u5708\u5E74\u8F2A",
      description: "\u65E5\u5831\u6355\u6349\u7576\u4E0B\uFF0C\u9031\u5831\u6536\u6582\u8108\u7D61\uFF0C\u6708\u5831\u6C89\u6FB1\u6210\u9577\u3002\u7FFB\u95B1\u904E\u53BB\uFF0C\u770B\u898B\u81EA\u5DF1\u7684\u8B8A\u5316\u3002",
      action: /*#__PURE__*/React.createElement(Button, {
        variant: "secondary",
        icon: /*#__PURE__*/React.createElement(I.search, {
          size: 16
        })
      }, "\u641C\u5C0B\u6B77\u671F")
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: "var(--space-6)",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(Tabs, {
      value: filter,
      onChange: setFilter,
      items: [{
        id: "all",
        label: "全部"
      }, {
        id: "day",
        label: "日報"
      }, {
        id: "week",
        label: "週報"
      }, {
        id: "month",
        label: "月報"
      }]
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Tag, {
      selected: true
    }, "2026"), /*#__PURE__*/React.createElement(Tag, null, "2025"), /*#__PURE__*/React.createElement(Tag, null, "2024"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(272px, 1fr))",
        gap: "var(--space-5)"
      }
    }, list.map((it, i) => /*#__PURE__*/React.createElement(IssueCard, {
      key: i,
      it: it
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "center",
        marginTop: "var(--space-10)"
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "outline"
    }, "\u8F09\u5165\u66F4\u65E9\u7684\u5831\u5831")));
  }
  window.Archive = Archive;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/Archive.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/Dashboard.jsx
try { (() => {
/* Dashboard (home) — rich, dense control panel */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const {
    Card,
    StatCard,
    Sparkline,
    SectionHeader,
    Badge,
    Tag,
    Button,
    IconButton,
    Avatar
  } = NS;
  function ToneDot({
    tone
  }) {
    const c = {
      insight: "var(--insight)",
      intelligence: "var(--intelligence)",
      illumination: "var(--illumination)"
    }[tone] || "var(--brand)";
    return /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 99,
        background: c,
        flex: "none",
        boxShadow: `0 0 10px ${c}`
      }
    });
  }
  function Dashboard() {
    const K = window.KIT,
      I = window.Icons;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "var(--space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-8)"
      }
    }, /*#__PURE__*/React.createElement(Card, {
      accent: "aurora",
      glow: true,
      padding: "var(--space-6)",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 240
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: "illumination",
      dot: true
    }, "2026 \u5E74 6 \u6708 30 \u65E5 \xB7 \u661F\u671F\u4E00")), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-3xl)",
        color: "var(--text-1)",
        margin: 0,
        lineHeight: 1.1
      }
    }, "\u65E9\u5B89\uFF0CAllen \u2600\uFE0F"), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-2)",
        margin: "8px 0 0",
        fontSize: "var(--text-md)"
      }
    }, K.brand.tagline, "\u3000\u4ECA\u5929\u6709 ", /*#__PURE__*/React.createElement("b", {
      style: {
        color: "var(--insight)"
      }
    }, "4"), " \u5247\u95DC\u6CE8\u52D5\u614B\u3001", /*#__PURE__*/React.createElement("b", {
      style: {
        color: "var(--intelligence)"
      }
    }, "1"), " \u5834\u6703\u8B70\u8207 ", /*#__PURE__*/React.createElement("b", {
      style: {
        color: "var(--illumination)"
      }
    }, "2"), " \u96C6\u5FC5\u807D Podcast\u3002")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      iconRight: /*#__PURE__*/React.createElement(I.arrow, {
        size: 16
      })
    }, "\u64B0\u5BEB\u4ECA\u65E5\u901F\u5831"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      icon: /*#__PURE__*/React.createElement(I.cal, {
        size: 16
      })
    }, "\u884C\u4E8B\u66C6"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "var(--space-4)"
      }
    }, K.stats.map((s, i) => {
      const col = {
        insight: "var(--insight)",
        intelligence: "var(--intelligence)",
        illumination: "var(--illumination)"
      }[s.tone];
      return /*#__PURE__*/React.createElement(StatCard, {
        key: i,
        label: s.label,
        value: s.value,
        unit: s.unit,
        delta: s.delta,
        deltaMode: s.mode,
        tone: s.tone,
        icon: /*#__PURE__*/React.createElement(I.chart, {
          size: 18
        }),
        spark: /*#__PURE__*/React.createElement(Sparkline, {
          data: s.data,
          color: s.mode === "finance" ? "var(--finance-up)" : col
        })
      });
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr",
        gap: "var(--space-6)",
        alignItems: "start"
      },
      className: "kit-2col"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeader, {
      kicker: "INSIGHT \xB7 \u6D1E\u5BDF",
      title: "\u4ECA\u65E5\u95DC\u6CE8\u52D5\u614B",
      action: /*#__PURE__*/React.createElement(Button, {
        variant: "ghost",
        size: "sm",
        iconRight: /*#__PURE__*/React.createElement(I.arrow, {
          size: 15
        })
      }, "\u5168\u90E8")
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 12
      }
    }, K.focus.map((f, i) => {
      const I2 = I[f.icon];
      return /*#__PURE__*/React.createElement(Card, {
        key: i,
        interactive: true,
        padding: "var(--space-5)"
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 16,
          alignItems: "flex-start"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 44,
          height: 44,
          flex: "none",
          borderRadius: 14,
          background: `var(--${f.tone}-soft)`,
          color: `var(--${f.tone})`,
          display: "grid",
          placeItems: "center"
        }
      }, /*#__PURE__*/React.createElement(I2, {
        size: 22
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 5
        }
      }, /*#__PURE__*/React.createElement(Badge, {
        tone: f.tone
      }, f.tag), /*#__PURE__*/React.createElement(ToneDot, {
        tone: f.tone
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          color: "var(--text-1)",
          fontSize: "var(--text-lg)",
          lineHeight: 1.3
        }
      }, f.title), /*#__PURE__*/React.createElement("div", {
        style: {
          color: "var(--text-3)",
          fontSize: 13,
          marginTop: 4
        }
      }, f.meta)), /*#__PURE__*/React.createElement(IconButton, {
        size: "sm",
        label: "\u6536\u85CF"
      }, /*#__PURE__*/React.createElement(I.bookmark, {
        size: 17
      }))));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 24
      }
    }), /*#__PURE__*/React.createElement(SectionHeader, {
      kicker: "ILLUMINATION \xB7 \u555F\u767C",
      title: "\u5F85\u8B80 \xB7 \u9032\u884C\u4E2D",
      action: /*#__PURE__*/React.createElement(Button, {
        variant: "ghost",
        size: "sm"
      }, "\u7BA1\u7406")
    }), /*#__PURE__*/React.createElement(Card, {
      padding: "var(--space-5)"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 16
      }
    }, K.reading.map((r, i) => /*#__PURE__*/React.createElement("div", {
      key: i
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        marginBottom: 7
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-1)",
        fontWeight: 700,
        fontSize: "var(--text-md)"
      }
    }, r.title), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-3)",
        fontSize: 12.5
      }
    }, r.src)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        color: "var(--illumination)",
        fontWeight: 700,
        fontSize: 13
      }
    }, r.pct, "%")), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 6,
        borderRadius: 99,
        background: "var(--night-700)",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: r.pct + "%",
        height: "100%",
        background: "var(--illumination-gradient)"
      }
    }))))))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)"
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeader, {
      kicker: "INTELLIGENCE \xB7 \u667A\u6167",
      title: "\u5E38\u807D Podcast",
      style: {
        marginBottom: "var(--space-4)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 10
      }
    }, K.podcasts.map((p, i) => /*#__PURE__*/React.createElement(Card, {
      key: i,
      interactive: true,
      padding: "14px 16px"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 13
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 40,
        flex: "none",
        borderRadius: 12,
        background: `var(--${p.tone}-soft)`,
        color: `var(--${p.tone})`,
        display: "grid",
        placeItems: "center"
      }
    }, /*#__PURE__*/React.createElement(I.headphones, {
      size: 20
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-1)",
        fontWeight: 700,
        fontSize: 14,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, p.title), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-3)",
        fontSize: 12
      }
    }, p.meta)), /*#__PURE__*/React.createElement(IconButton, {
      size: "sm",
      variant: "ghost",
      label: "\u64AD\u653E"
    }, /*#__PURE__*/React.createElement(I.play, {
      size: 16
    }))))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionHeader, {
      kicker: "\u5E38\u7528\u7DB2\u7AD9",
      title: "\u5FEB\u901F\u524D\u5F80",
      style: {
        marginBottom: "var(--space-4)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10
      }
    }, K.links.map((l, i) => {
      const I2 = I[l.icon];
      return /*#__PURE__*/React.createElement("a", {
        key: i,
        href: "#",
        onClick: e => e.preventDefault(),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 13px",
          background: "var(--night-800)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-2)",
          fontSize: 13.5,
          fontWeight: 600
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          color: "var(--brand)",
          display: "flex"
        }
      }, /*#__PURE__*/React.createElement(I2, {
        size: 17
      })), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }
      }, l.label), /*#__PURE__*/React.createElement(I.ext, {
        size: 13,
        style: {
          color: "var(--text-4)"
        }
      }));
    }))), /*#__PURE__*/React.createElement(Card, {
      accent: "intelligence",
      padding: "var(--space-5)"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        color: "var(--text-1)",
        fontSize: "var(--text-lg)"
      }
    }, "\u500B\u4EBA\u5E74\u8F2A"), /*#__PURE__*/React.createElement(Badge, {
      tone: "intelligence"
    }, "51 \u5708")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 10
      }
    }, K.annuli.slice(-3).reverse().map((a, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        gap: 12,
        alignItems: "baseline"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        color: `var(--${a.tone})`,
        fontWeight: 700,
        fontSize: 13,
        width: 42,
        flex: "none"
      }
    }, a.year), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-2)",
        fontSize: 13.5
      }
    }, a.title))))))));
  }
  window.Dashboard = Dashboard;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/NewsletterIssue.jsx
try { (() => {
/* Newsletter Issue — editorial magazine reading view (日報·週報·月報) */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const {
    Card,
    Badge,
    Tag,
    Button,
    IconButton,
    Avatar,
    Divider,
    Callout,
    SectionHeader
  } = NS;
  function Dek({
    children
  }) {
    return /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-3)",
        fontSize: "var(--text-lg)",
        lineHeight: 1.6,
        margin: "0 0 var(--space-6)",
        maxWidth: "var(--container-read)"
      }
    }, children);
  }
  function Lead({
    children
  }) {
    return /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-2)",
        fontSize: "var(--text-md)",
        lineHeight: "var(--lh-relaxed)",
        margin: "0 0 var(--space-4)"
      }
    }, children);
  }
  function Rule({
    label
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        margin: "var(--space-10) 0 var(--space-8)"
      }
    }, /*#__PURE__*/React.createElement(Divider, {
      label: label
    }));
  }
  function NewsletterIssue() {
    const I = window.Icons;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 860,
        margin: "0 auto",
        padding: "var(--space-10) var(--gutter) var(--space-24)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginBottom: "var(--space-10)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 18
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 34,
        height: 34,
        borderRadius: 10,
        background: "var(--aurora-gradient)",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: 15,
        color: "var(--text-on-accent)"
      }
    }, "I\xB3"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        letterSpacing: ".02em",
        fontSize: 18,
        color: "var(--text-1)"
      }
    }, "\u827E\u502B\u5831\u5831")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "center",
        gap: 10,
        marginBottom: 20
      }
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: "insight",
      variant: "solid"
    }, "\u9031\u5831"), /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral"
    }, "\u7B2C 26 \u671F"), /*#__PURE__*/React.createElement(Badge, {
      tone: "neutral"
    }, "2026.06.29")), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "clamp(2rem, 5vw, var(--text-5xl))",
        lineHeight: 1.08,
        letterSpacing: "var(--ls-tight)",
        color: "var(--text-1)",
        margin: "0 auto",
        maxWidth: 720
      }
    }, "AI \u4EE3\u7406\u7684\u8A18\u61B6\u6230\u722D\uFF0C", /*#__PURE__*/React.createElement("br", null), "\u8207\u53F0\u80A1\u7684\u975C\u9ED8\u8F2A\u52D5"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginTop: 22,
        color: "var(--text-3)",
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      src: "../../assets/avatar.jpg",
      name: "Allen Chen",
      size: "sm"
    }), /*#__PURE__*/React.createElement("span", null, "Allen Chen \u4E3B\u7DE8"), /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: .4
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "\u95B1\u8B80\u7D04 6 \u5206\u9418"))), /*#__PURE__*/React.createElement("div", {
      style: {
        borderRadius: "var(--radius-2xl)",
        overflow: "hidden",
        border: "1px solid var(--border)",
        marginBottom: "var(--space-8)",
        boxShadow: "var(--shadow-lg)",
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/rabbit-reading.jpeg",
      alt: "cover",
      style: {
        width: "100%",
        height: 340,
        objectFit: "cover"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to top, rgba(5,7,15,.72), transparent 55%)"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        left: 22,
        bottom: 18,
        color: "var(--text-3)",
        fontSize: 12.5
      }
    }, "\u672C\u671F\u5C01\u9762 \xB7 \u300C\u5728\u66F8\u6D77\u88E1\u7684\u5C08\u6CE8\u300D")), /*#__PURE__*/React.createElement(Dek, null, "\u6D1E\u5BDF\u4E16\u754C\uFF0E\u7D2F\u7A4D\u667A\u6167\uFF0E\u9EDE\u4EAE\u672A\u4F86\u3002\u672C\u9031\u6211\u5011\u628A\u76EE\u5149\u653E\u5728\u5169\u4EF6\u770B\u4F3C\u7121\u95DC\u3001\u5BE6\u5247\u540C\u6E90\u7684\u4E8B\uFF1A\u5927\u578B\u8A9E\u8A00\u6A21\u578B\u5982\u4F55\u300C\u8A18\u4F4F\u300D\uFF0C\u4EE5\u53CA\u8CC7\u91D1\u5982\u4F55\u5728\u566A\u97F3\u4E2D\u6084\u6084\u63DB\u624B\u3002"), /*#__PURE__*/React.createElement(Rule, {
      label: "INSIGHT \xB7 \u6D1E\u5BDF"
    }), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-2xl)",
        color: "var(--text-1)",
        margin: "0 0 var(--space-4)"
      }
    }, "\u4E00\u3001\u8A18\u61B6\uFF0C\u662F\u4EE3\u7406\u7684\u8B77\u57CE\u6CB3"), /*#__PURE__*/React.createElement(Lead, null, "\u904E\u53BB\u4E00\u5E74\uFF0CAgent \u7684\u7AF6\u722D\u7126\u9EDE\u5F9E\u300C\u6703\u4E0D\u6703\u7528\u5DE5\u5177\u300D\u8F49\u5411\u300C\u8A18\u5F97\u591A\u5C11\u3001\u8A18\u5F97\u591A\u6E96\u300D\u3002\u7576\u4E0A\u4E0B\u6587\u8996\u7A97\u4E0D\u518D\u662F\u74F6\u9838\uFF0C\u771F\u6B63\u7684\u5DEE\u7570\u51FA\u73FE\u5728\u6AA2\u7D22\u8207\u907A\u5FD8\u7684\u7B56\u7565\u4E0A\u2014\u2014\u4EC0\u9EBC\u8A72\u7559\u4E0B\uFF0C\u4EC0\u9EBC\u8A72\u4E3B\u52D5\u5FD8\u6389\u3002"), /*#__PURE__*/React.createElement(Lead, null, "\u9019\u8207\u6295\u8CC7\u6975\u70BA\u76F8\u4F3C\uFF1A\u8CC7\u8A0A\u4E0D\u662F\u8D8A\u591A\u8D8A\u597D\uFF0C\u80FD\u88AB\u7D50\u69CB\u5316\u3001\u88AB\u56DE\u9867\u3001\u88AB\u884C\u52D5\u7684\u8CC7\u8A0A\uFF0C\u624D\u662F\u8907\u5229\u7684\u4F86\u6E90\u3002"), /*#__PURE__*/React.createElement(Callout, {
      tone: "intelligence",
      icon: /*#__PURE__*/React.createElement(I.bulb, {
        size: 19
      }),
      title: "\u672C\u9031\u667A\u6167 Intelligence"
    }, "\u5DE5\u5177\u6703\u88AB\u8907\u88FD\uFF0C\u8A18\u61B6\u4E0D\u6703\u3002\u7121\u8AD6\u662F\u7522\u54C1\u9084\u662F\u500B\u4EBA\uFF0C\u80FD\u6301\u7E8C\u7D2F\u7A4D\u4E26\u5584\u7528\u8108\u7D61\u7684\u4EBA\uFF0C\u7D42\u5C07\u52DD\u51FA\u3002"), /*#__PURE__*/React.createElement(Rule, {
      label: "\u7406\u8CA1 \xB7 FINANCE"
    }), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-2xl)",
        color: "var(--text-1)",
        margin: "0 0 var(--space-4)"
      }
    }, "\u4E8C\u3001\u975C\u9ED8\u8F2A\u52D5\u4E0B\u7684\u7C4C\u78BC\u7DDA\u7D22"), /*#__PURE__*/React.createElement(Lead, null, "\u5927\u76E4\u6307\u6578\u6CE2\u703E\u4E0D\u9A5A\uFF0C\u5E95\u4E0B\u7684\u8CC7\u91D1\u537B\u5728\u63DB\u624B\u3002\u672C\u9031\u5916\u8CC7\u8207\u6295\u4FE1\u7684\u300C\u96D9\u9023\u8CB7\u300D\u540D\u55AE\u65B0\u589E 3 \u6A94\uFF0C\u96C6\u4E2D\u5728\u534A\u5C0E\u9AD4\u8207\u822A\u904B\u2014\u2014\u9019\u901A\u5E38\u662F\u8F2A\u52D5\u7684\u524D\u594F\uFF0C\u800C\u975E\u7D50\u8AD6\u3002"), /*#__PURE__*/React.createElement(Card, {
      padding: "0",
      style: {
        overflow: "hidden",
        margin: "var(--space-4) 0 var(--space-6)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr",
        padding: "12px 18px",
        background: "var(--night-850)",
        borderBottom: "1px solid var(--border)",
        fontSize: 12.5,
        color: "var(--text-3)",
        fontWeight: 700,
        letterSpacing: ".05em"
      }
    }, /*#__PURE__*/React.createElement("span", null, "\u6A19\u7684"), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: "right"
      }
    }, "\u6536\u76E4"), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: "right"
      }
    }, "\u6F32\u8DCC")), [["台積電 2330", "1,085", "+2.4%", true], ["長榮 2603", "218.5", "+3.1%", true], ["聯發科 2454", "1,420", "-0.7%", false]].map((r, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr",
        padding: "14px 18px",
        borderBottom: i < 2 ? "1px solid var(--border-subtle)" : "none",
        alignItems: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-1)",
        fontWeight: 700
      }
    }, r[0]), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: "right",
        fontFamily: "var(--font-mono)",
        color: "var(--text-2)"
      }
    }, r[1]), /*#__PURE__*/React.createElement("span", {
      style: {
        textAlign: "right",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        color: r[3] ? "var(--finance-up)" : "var(--finance-down)"
      }
    }, r[2])))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: "var(--text-4)",
        marginBottom: "var(--space-6)"
      }
    }, "\u203B \u53F0\u80A1\u6163\u4F8B \u7D05\u6F32\u7DA0\u8DCC\u3002\u8CC7\u6599\u50C5\u4F9B\u53C3\u8003\uFF0C\u975E\u6295\u8CC7\u5EFA\u8B70\u3002"), /*#__PURE__*/React.createElement(Rule, {
      label: "ILLUMINATION \xB7 \u555F\u767C"
    }), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-2xl)",
        color: "var(--text-1)",
        margin: "0 0 var(--space-4)"
      }
    }, "\u4E09\u3001\u9019\u9031\u6211\u5B78\u5230\u7684\u4E00\u4EF6\u4E8B"), /*#__PURE__*/React.createElement(Lead, null, "\u628A\u7814\u7A76\u505A\u6210\u7522\u54C1\uFF0C\u6700\u96E3\u7684\u4E0D\u662F\u7814\u7A76\uFF0C\u800C\u662F\u300C\u6301\u7E8C\u767C\u8868\u300D\u3002\u827E\u502B\u5831\u5831\u672C\u8EAB\u5C31\u662F\u9019\u500B\u4FE1\u5FF5\u7684\u5BE6\u8E10\u2014\u2014\u6BCF\u9031\u903C\u81EA\u5DF1\u628A\u6563\u843D\u7684\u89C0\u5BDF\uFF0C\u6536\u6582\u6210\u4E00\u4EFD\u53EF\u4EE5\u5BC4\u51FA\u53BB\u7684\u6771\u897F\u3002"), /*#__PURE__*/React.createElement("blockquote", {
      style: {
        margin: "var(--space-6) 0",
        padding: "4px 0 4px 22px",
        borderLeft: "3px solid var(--illumination)",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: "var(--text-xl)",
        lineHeight: 1.45,
        color: "var(--text-1)"
      }
    }, "\u300C\u5C11\u5373\u662F\u591A\u3002\u6BCF\u5929\u4E3B\u52D5\u780D\u6389\u4E00\u4EF6\u4E0D\u91CD\u8981\u7684\u4E8B\uFF0C\u66FF\u771F\u6B63\u7684\u91CD\u9EDE\u9A30\u51FA\u7A7A\u9593\u3002\u300D"), /*#__PURE__*/React.createElement(Card, {
      accent: "aurora",
      glow: true,
      padding: "var(--space-8)",
      style: {
        textAlign: "center",
        marginTop: "var(--space-10)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-2xl)",
        color: "var(--text-1)",
        marginBottom: 8
      }
    }, "\u559C\u6B61\u9019\u671F\u5831\u5831\u55CE\uFF1F"), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-3)",
        margin: "0 0 20px",
        maxWidth: 420,
        marginInline: "auto"
      }
    }, "\u628A\u5B83\u8F49\u5BC4\u7D66\u4E00\u4F4D\u4F60\u5728\u4E4E\u7684\u670B\u53CB\uFF0C\u6216\u56DE\u4FE1\u544A\u8A34\u6211\u4F60\u60F3\u770B\u7684\u4E3B\u984C\u3002"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 10,
        justifyContent: "center",
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      icon: /*#__PURE__*/React.createElement(I.mail, {
        size: 16
      })
    }, "\u56DE\u4FE1\u7D66\u4E3B\u7DE8"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      icon: /*#__PURE__*/React.createElement(I.link, {
        size: 16
      })
    }, "\u5206\u4EAB\u9023\u7D50"))));
  }
  window.NewsletterIssue = NewsletterIssue;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/NewsletterIssue.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/Subscribe.jsx
try { (() => {
/* Subscribe — landing + subscription management */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const {
    Card,
    Badge,
    Button,
    Input,
    Switch,
    Divider,
    AuroraText,
    Avatar
  } = NS;
  function Cadence({
    id,
    icon,
    title,
    desc,
    when,
    tone,
    on,
    onToggle
  }) {
    const I = window.Icons;
    const I2 = I[icon];
    return /*#__PURE__*/React.createElement(Card, {
      padding: "var(--space-5)",
      style: {
        borderColor: on ? "var(--border-aurora)" : "var(--border)",
        boxShadow: on ? "var(--glow-brand)" : "var(--shadow-card)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 46,
        height: 46,
        flex: "none",
        borderRadius: 14,
        background: `var(--${tone}-soft)`,
        color: `var(--${tone})`,
        display: "grid",
        placeItems: "center"
      }
    }, /*#__PURE__*/React.createElement(I2, {
      size: 23
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        color: "var(--text-1)",
        fontSize: "var(--text-lg)"
      }
    }, title), /*#__PURE__*/React.createElement(Switch, {
      checked: on,
      onChange: onToggle
    })), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-3)",
        fontSize: 13.5,
        margin: "5px 0 10px",
        lineHeight: 1.5
      }
    }, desc), /*#__PURE__*/React.createElement(Badge, {
      tone: tone,
      dot: true
    }, when))));
  }
  function Subscribe() {
    const I = window.Icons;
    const [state, setState] = React.useState({
      day: false,
      week: true,
      month: true
    });
    const [done, setDone] = React.useState(false);
    return /*#__PURE__*/React.createElement("div", {
      style: {
        minHeight: "100%"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        overflow: "hidden",
        padding: "var(--space-20) var(--gutter) var(--space-16)",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: "radial-gradient(60% 60% at 50% 0%, var(--intelligence-soft), transparent 70%)",
        pointerEvents: "none"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        maxWidth: 720,
        margin: "0 auto"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 24
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 40,
        borderRadius: 12,
        background: "var(--aurora-gradient)",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: 17,
        color: "var(--text-on-accent)",
        boxShadow: "var(--glow-brand)"
      }
    }, "I\xB3"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: 20,
        color: "var(--text-1)"
      }
    }, "\u827E\u502B\u5831\u5831")), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "clamp(2.4rem, 6vw, var(--text-6xl))",
        lineHeight: 1.05,
        letterSpacing: "var(--ls-tight)",
        color: "var(--text-1)",
        margin: 0
      }
    }, "\u6D1E\u5BDF\u4E16\u754C", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement(AuroraText, null, "\u7D2F\u7A4D\u667A\u6167\uFF0E\u9EDE\u4EAE\u672A\u4F86")), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-2)",
        fontSize: "var(--text-lg)",
        lineHeight: 1.6,
        margin: "22px auto 0",
        maxWidth: 560
      }
    }, "\u4E00\u4EFD\u95DC\u65BC\u7406\u8CA1\u3001\u5DE5\u4F5C\u3001\u7814\u7A76\u8207\u751F\u6D3B\u7684\u500B\u4EBA\u96FB\u5B50\u5831\u3002\u7531 Allen \u6BCF\u65E5\u3001\u6BCF\u9031\u3001\u6BCF\u6708\uFF0C\u89AA\u624B\u628A\u6563\u843D\u7684\u89C0\u5BDF\uFF0C\u6536\u6582\u6210\u503C\u5F97\u4F60\u82B1\u6642\u9593\u95B1\u8B80\u7684\u6771\u897F\u3002"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        marginTop: 30,
        flexWrap: "wrap",
        color: "var(--text-3)",
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 7
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      src: "../../assets/avatar.jpg",
      name: "A",
      size: "xs"
    }), " 1,240+ \u4F4D\u8B80\u8005"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 7
      }
    }, /*#__PURE__*/React.createElement(I.check, {
      size: 16,
      style: {
        color: "var(--insight)"
      }
    }), " \u514D\u8CBB \xB7 \u96A8\u6642\u9000\u8A02"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 7
      }
    }, /*#__PURE__*/React.createElement(I.check, {
      size: 16,
      style: {
        color: "var(--insight)"
      }
    }), " \u7121\u5EE3\u544A")))), /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 760,
        margin: "0 auto",
        padding: "0 var(--gutter) var(--space-24)"
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-2xl)",
        color: "var(--text-1)",
        textAlign: "center",
        margin: "0 0 var(--space-6)"
      }
    }, "\u9078\u64C7\u4F60\u7684\u7BC0\u594F"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gap: "var(--space-4)",
        marginBottom: "var(--space-8)"
      }
    }, /*#__PURE__*/React.createElement(Cadence, {
      id: "day",
      icon: "sparkle",
      tone: "illumination",
      title: "\u65E5\u5831 \xB7 \u65E9\u6668\u901F\u5831",
      when: "\u6BCF\u65E5 07:00",
      on: state.day,
      onToggle: v => setState({
        ...state,
        day: v
      }),
      desc: "\u4E09\u5247\u4F60\u4ECA\u5929\u8A72\u77E5\u9053\u7684\u4E8B\u2014\u2014\u5E02\u5834\u3001\u79D1\u6280\u3001\u751F\u6D3B\uFF0C\u5169\u5206\u9418\u8B80\u5B8C\u3002"
    }), /*#__PURE__*/React.createElement(Cadence, {
      id: "week",
      icon: "paper",
      tone: "insight",
      title: "\u9031\u5831 \xB7 \u6DF1\u5EA6\u5F59\u6574",
      when: "\u6BCF\u9031\u4E00 09:00",
      on: state.week,
      onToggle: v => setState({
        ...state,
        week: v
      }),
      desc: "\u4E00\u9031\u8108\u7D61\u7684\u6536\u6582\uFF1A\u95DC\u6CE8\u52D5\u614B\u3001\u7C4C\u78BC\u6D1E\u5BDF\u3001\u95B1\u8B80\u8207\u555F\u767C\u3002\u65D7\u8266\u5167\u5BB9\u3002"
    }), /*#__PURE__*/React.createElement(Cadence, {
      id: "month",
      icon: "rings",
      tone: "intelligence",
      title: "\u6708\u5831 \xB7 \u6C89\u6FB1\u56DE\u9867",
      when: "\u6BCF\u6708 1 \u865F",
      on: state.month,
      onToggle: v => setState({
        ...state,
        month: v
      }),
      desc: "\u4E00\u500B\u6708\u7684\u6210\u9577\u56DE\u9867\u8207\u4E0B\u6708\u8A08\u756B\uFF0C\u9644\u500B\u4EBA\u5E74\u8F2A\u7684\u65B0\u523B\u5EA6\u3002"
    })), /*#__PURE__*/React.createElement(Card, {
      accent: "aurora",
      glow: true,
      padding: "var(--space-8)"
    }, done ? /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        padding: "var(--space-6) 0"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 64,
        height: 64,
        margin: "0 auto 16px",
        borderRadius: 99,
        background: "var(--insight-soft)",
        color: "var(--insight)",
        display: "grid",
        placeItems: "center"
      }
    }, /*#__PURE__*/React.createElement(I.check, {
      size: 34
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-2xl)",
        color: "var(--text-1)"
      }
    }, "\u8A02\u95B1\u6210\u529F \uD83C\uDF89"), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-3)",
        marginTop: 8
      }
    }, "\u78BA\u8A8D\u4FE1\u5DF2\u5BC4\u51FA\uFF0C\u8A18\u5F97\u5230\u4FE1\u7BB1\u9EDE\u64CA\u555F\u7528\u9023\u7D50\u3002"), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 18
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => setDone(false)
    }, "\u8FD4\u56DE"))) : /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-xl)",
        color: "var(--text-1)",
        marginBottom: 6
      }
    }, "\u6700\u5F8C\u4E00\u6B65\uFF0C\u7559\u500B Email"), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-3)",
        fontSize: 14,
        margin: "0 0 20px"
      }
    }, "\u9078\u5B9A\u7684\u7BC0\u594F\u6703\u4F9D\u6392\u7A0B\u9001\u9054\u4F60\u7684\u4FE1\u7BB1\u3002\u6211\u5011\u7D55\u4E0D\u5BC4\u9001\u5783\u573E\u4FE1\u3002"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "flex-end"
      }
    }, /*#__PURE__*/React.createElement(Input, {
      label: "\u4F60\u7684 Email",
      icon: /*#__PURE__*/React.createElement(I.mail, {
        size: 17
      }),
      placeholder: "you@example.com",
      style: {
        flex: 1,
        minWidth: 240
      }
    }), /*#__PURE__*/React.createElement(Button, {
      size: "lg",
      iconRight: /*#__PURE__*/React.createElement(I.arrow, {
        size: 18
      }),
      onClick: () => setDone(true)
    }, "\u958B\u59CB\u8A02\u95B1")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 16,
        paddingTop: 16,
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(Switch, {
      defaultChecked: true,
      size: "sm"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-3)",
        fontSize: 13
      }
    }, "\u6211\u540C\u610F\u63A5\u6536\u827E\u502B\u5831\u5831\u96FB\u5B50\u5831\uFF0C\u4E26\u53EF\u96A8\u6642\u4E00\u9375\u9000\u8A02\u3002"))))));
  }
  window.Subscribe = Subscribe;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/Subscribe.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/Timeline.jsx
try { (() => {
/* Timeline — 個人年輪 (personal annual-rings life timeline) */
(function () {
  const NS = window.AllenAuroraDesignSystem_e6fd5f;
  const {
    Card,
    Badge,
    Button,
    SectionHeader,
    AuroraText
  } = NS;
  function Timeline() {
    const K = window.KIT,
      I = window.Icons;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "var(--space-8)",
        maxWidth: 1040,
        margin: "0 auto"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginBottom: "var(--space-12)"
      }
    }, /*#__PURE__*/React.createElement(Badge, {
      tone: "intelligence",
      dot: true
    }, "ANNULI \xB7 \u500B\u4EBA\u5E74\u8F2A"), /*#__PURE__*/React.createElement("h1", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "clamp(2.2rem, 5vw, var(--text-5xl))",
        lineHeight: 1.08,
        color: "var(--text-1)",
        margin: "16px 0 0"
      }
    }, "\u4E00\u5708\u4E00\u5708\uFF0C", /*#__PURE__*/React.createElement(AuroraText, null, "\u7D2F\u7A4D\u6210\u6211")), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-3)",
        fontSize: "var(--text-lg)",
        marginTop: 14
      }
    }, "1975 \u2192 2026 \xB7\u300051 \u5708\u751F\u547D\u523B\u5EA6")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "var(--space-4)",
        marginBottom: "var(--space-12)"
      }
    }, [["51", "年", "insight"], ["6", "重要轉折", "intelligence"], ["∞", "持續累積", "illumination"]].map((s, i) => /*#__PURE__*/React.createElement(Card, {
      key: i,
      accent: s[2],
      padding: "var(--space-5)",
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "var(--font-display)",
        fontWeight: 900,
        fontSize: "var(--text-4xl)",
        lineHeight: 1,
        color: `var(--${s[2]})`
      }
    }, s[0]), /*#__PURE__*/React.createElement("div", {
      style: {
        color: "var(--text-3)",
        fontSize: 13.5,
        marginTop: 8
      }
    }, s[1])))), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        paddingLeft: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: "absolute",
        left: 19,
        top: 8,
        bottom: 8,
        width: 2,
        background: "linear-gradient(to bottom, var(--insight), var(--intelligence) 50%, var(--illumination))",
        opacity: .5,
        borderRadius: 2
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)"
      }
    }, K.annuli.slice().reverse().map((a, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: "flex",
        gap: 22,
        alignItems: "flex-start"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: "relative",
        zIndex: 1,
        width: 40,
        height: 40,
        flex: "none",
        borderRadius: 99,
        background: "var(--night-800)",
        border: `2px solid var(--${a.tone})`,
        display: "grid",
        placeItems: "center",
        boxShadow: `0 0 16px var(--${a.tone})`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 12,
        height: 12,
        borderRadius: 99,
        background: `var(--${a.tone})`
      }
    })), /*#__PURE__*/React.createElement(Card, {
      interactive: true,
      padding: "var(--space-5)",
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 6,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        fontSize: "var(--text-xl)",
        color: `var(--${a.tone})`
      }
    }, a.year), /*#__PURE__*/React.createElement(Badge, {
      tone: a.tone
    }, a.title)), /*#__PURE__*/React.createElement("p", {
      style: {
        color: "var(--text-2)",
        margin: 0,
        fontSize: "var(--text-md)",
        lineHeight: 1.6
      }
    }, a.body)))))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginTop: "var(--space-12)"
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      icon: /*#__PURE__*/React.createElement(I.rings, {
        size: 17
      })
    }, "\u65B0\u589E\u4E00\u6BB5\u91CC\u7A0B\u7891")));
  }
  window.Timeline = Timeline;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/Timeline.jsx", error: String((e && e.message) || e) }); }

// ui_kits/aurora/kit.jsx
try { (() => {
/* ============================================================
   艾倫報報 · Aurora UI kit — shared shell, icons & mock data
   Loaded before the screen files. Exposes globals on window.
   ============================================================ */
const NS = window.AllenAuroraDesignSystem_e6fd5f;
const {
  Avatar,
  Badge,
  IconButton,
  Tag,
  Button
} = NS;

/* ---------- Icons (stroke, 1.9, rounded — the brand icon language) ---------- */
const mkIcon = (paths, opts = {}) => props => /*#__PURE__*/React.createElement("svg", {
  width: props.size || 20,
  height: props.size || 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: opts.w || 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: {
    display: "block",
    ...props.style
  }
}, paths);
const Icons = {
  home: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 10.5 12 3l9 7.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 9.5V21h14V9.5"
  }))),
  paper: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "3",
    width: "16",
    height: "18",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 8h8M8 12h8M8 16h5"
  }))),
  rings: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "5.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "2"
  }))),
  mail: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "5",
    width: "18",
    height: "14",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m3 7 9 6 9-6"
  }))),
  archive: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "4",
    rx: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 8v11h14V8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 12h4"
  }))),
  search: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  }))),
  bell: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13.7 21a2 2 0 0 1-3.4 0"
  }))),
  settings: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.2A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 0 1 0-4h.2A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 0 1 4 0v.2A1.6 1.6 0 0 0 15 4.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-1.1 2.7V9a1.6 1.6 0 0 0 1.1 2.7z"
  }))),
  chart: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 3v18h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m7 14 3.5-4 3 3L21 6"
  }))),
  wallet: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 11h-4a2 2 0 0 0 0 4h4z"
  }))),
  book: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 19a2 2 0 0 1 2-2h13"
  }))),
  headphones: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 14v-2a8 8 0 0 1 16 0v2"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2.5",
    y: "14",
    width: "4.5",
    height: "7",
    rx: "1.6"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "17",
    y: "14",
    width: "4.5",
    height: "7",
    rx: "1.6"
  }))),
  link: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 15 15 9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11 6.5 13 4.5a4 4 0 0 1 6 6l-2 2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13 17.5 11 19.5a4 4 0 0 1-6-6l2-2"
  }))),
  bulb: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 18h6M10 22h4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"
  }))),
  bookmark: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 3h12v18l-6-4-6 4z"
  }))),
  arrow: mkIcon(/*#__PURE__*/React.createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6"
  }), {
    w: 2.2
  }),
  play: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M7 4v16l13-8z",
    fill: "currentColor",
    stroke: "none"
  }))),
  ext: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M14 4h6v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 4 10 14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4"
  }))),
  cal: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "17",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 9h18M8 2v4M16 2v4"
  }))),
  check: mkIcon(/*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }), {
    w: 2.4
  }),
  briefcase: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "7",
    width: "18",
    height: "13",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
  }))),
  compass: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m15.5 8.5-2 5-5 2 2-5z",
    fill: "currentColor",
    stroke: "none"
  }))),
  sparkle: mkIcon(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"
  }))),
  menu: mkIcon(/*#__PURE__*/React.createElement("path", {
    d: "M4 6h16M4 12h16M4 18h16"
  }), {
    w: 2.2
  })
};
window.Icons = Icons;

/* ---------- Mock data ---------- */
window.KIT = {
  brand: {
    zh: "艾倫報報",
    en: "Allen³ Aurora",
    tagline: "洞察世界．累積智慧．點亮未來。"
  },
  nav: [{
    id: "dashboard",
    label: "儀表板",
    en: "Dashboard",
    icon: "home"
  }, {
    id: "issue",
    label: "本期報報",
    en: "This Issue",
    icon: "paper"
  }, {
    id: "archive",
    label: "歷期彙整",
    en: "Archive",
    icon: "archive"
  }, {
    id: "timeline",
    label: "個人年輪",
    en: "Annuli",
    icon: "rings"
  }, {
    id: "subscribe",
    label: "訂閱管理",
    en: "Subscribe",
    icon: "mail"
  }],
  stats: [{
    label: "加權指數 TAIEX",
    value: "23,412",
    unit: "pt",
    delta: "+1.24%",
    tone: "insight",
    mode: "finance",
    data: [5, 5.4, 5.1, 6, 5.8, 6.6, 6.2, 7, 7.4]
  }, {
    label: "本月結餘",
    value: "42,180",
    unit: "TWD",
    delta: "+8.0%",
    tone: "intelligence",
    mode: "semantic",
    data: [4, 4.2, 4.1, 4.5, 4.4, 4.8, 5, 5.2]
  }, {
    label: "深度工作",
    value: "26.5",
    unit: "hr",
    delta: "+12%",
    tone: "illumination",
    mode: "semantic",
    data: [3, 3.5, 3.2, 4, 3.8, 4.4, 4.6, 5]
  }, {
    label: "待讀清單",
    value: "12",
    unit: "篇",
    delta: "-3",
    tone: "insight",
    mode: "semantic",
    data: [8, 7, 9, 6, 5, 6, 5, 4]
  }],
  focus: [{
    tag: "理財",
    tone: "insight",
    title: "外資投信「雙連買」新增 3 檔",
    meta: "半導體 · 航運 · 今日 09:41",
    icon: "chart"
  }, {
    tag: "工作",
    tone: "intelligence",
    title: "Q3 產品藍圖評審會議前置準備",
    meta: "明日 14:00 · 附 3 份文件",
    icon: "briefcase"
  }, {
    tag: "研究",
    tone: "illumination",
    title: "LLM Agent 記憶架構 — 讀書筆記整理",
    meta: "進度 60% · 待續 2 節",
    icon: "compass"
  }, {
    tag: "興趣",
    tone: "insight",
    title: "薩克斯風 · 週末錄音清單",
    meta: "3 首待練 · 上次 11/18",
    icon: "sparkle"
  }],
  reading: [{
    title: "原子習慣：微小改變的複利效應",
    src: "重讀筆記",
    pct: 82
  }, {
    title: "The Almanack of Naval Ravikant",
    src: "Kindle",
    pct: 45
  }, {
    title: "台股籌碼面實戰：三大法人解讀",
    src: "PDF",
    pct: 12
  }],
  podcasts: [{
    title: "股癌 Gooaye — EP.整理盤心法",
    meta: "1h 12m · 昨天",
    tone: "insight"
  }, {
    title: "曼報 Manny's Newsletter Radio",
    meta: "38m · 2 天前",
    tone: "intelligence"
  }, {
    title: "Lex Fridman — Memory & Agents",
    meta: "2h 04m · 本週",
    tone: "illumination"
  }],
  links: [{
    label: "Showmethemoney 看盤",
    icon: "chart"
  }, {
    label: "TradingView",
    icon: "chart"
  }, {
    label: "Notion 研究庫",
    icon: "book"
  }, {
    label: "GitHub",
    icon: "link"
  }, {
    label: "Medium 草稿",
    icon: "paper"
  }, {
    label: "Google Scholar",
    icon: "compass"
  }],
  issues: [{
    no: 26,
    kind: "週報",
    date: "2026.06.29",
    tone: "insight",
    title: "AI 代理的記憶戰爭，與台股的靜默輪動",
    items: 8,
    cover: "../../assets/rabbit-reading.jpeg"
  }, {
    no: 25,
    kind: "週報",
    date: "2026.06.22",
    tone: "insight",
    title: "當利率轉彎，現金流的重新定價",
    items: 7,
    cover: "../../assets/rabbit-proposal.jpeg"
  }, {
    no: "06",
    kind: "月報",
    date: "2026.06.01",
    tone: "intelligence",
    title: "六月總結：三個決定，一次轉身",
    items: 14,
    cover: "../../assets/rabbit-mountain.jpeg"
  }, {
    no: 24,
    kind: "週報",
    date: "2026.06.15",
    tone: "insight",
    title: "被高估的專注，與被低估的休息",
    items: 6,
    cover: "../../assets/rabbit-bike.jpeg"
  }, {
    no: 23,
    kind: "週報",
    date: "2026.06.08",
    tone: "insight",
    title: "把研究做成產品：從筆記到電子報",
    items: 9,
    cover: "../../assets/rabbit-forest.jpeg"
  }, {
    no: "182",
    kind: "日報",
    date: "2026.06.30",
    tone: "illumination",
    title: "早晨速報：三則你該知道的事",
    items: 3,
    cover: "../../assets/rabbit-golden.jpeg"
  }],
  annuli: [{
    year: "1975",
    tone: "insight",
    title: "序章 · 出生",
    body: "一切的起點。"
  }, {
    year: "1998",
    tone: "intelligence",
    title: "投入資訊科技",
    body: "以 ITS 專業踏入職場，開始累積系統思維。"
  }, {
    year: "2011",
    tone: "illumination",
    title: "拿起薩克斯風",
    body: "音樂成為生活的另一種語言與節奏。"
  }, {
    year: "2020",
    tone: "insight",
    title: "開始寫作與研究",
    body: "把每天的觀察，變成可累積的筆記與洞察。"
  }, {
    year: "2024",
    tone: "intelligence",
    title: "Showmethemoney 上線",
    body: "開源台股看盤儀表板，工具服務更多人。"
  }, {
    year: "2026",
    tone: "illumination",
    title: "艾倫報報 創刊",
    body: "洞察世界．累積智慧．點亮未來 — 個人品牌成形。"
  }]
};

/* ---------- Sidebar ---------- */
function Sidebar({
  active,
  onNav
}) {
  const {
    nav,
    brand
  } = window.KIT;
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: "var(--sidebar-w)",
      flex: "none",
      background: "var(--night-850)",
      borderRight: "1px solid var(--border)",
      padding: "20px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 22,
      minHeight: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "4px 6px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 12,
      background: "var(--aurora-gradient)",
      display: "grid",
      placeItems: "center",
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: 17,
      color: "var(--text-on-accent)",
      boxShadow: "var(--glow-brand)"
    }
  }, "I\xB3"), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.15
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      color: "var(--text-1)",
      fontSize: 16
    }
  }, brand.zh), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--text-3)",
      letterSpacing: ".08em"
    }
  }, brand.en))), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4
    }
  }, nav.map(n => {
    const on = active === n.id;
    const I = Icons[n.icon];
    return /*#__PURE__*/React.createElement("button", {
      key: n.id,
      onClick: () => onNav(n.id),
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 13px",
        borderRadius: "var(--radius-md)",
        border: "1px solid " + (on ? "var(--border-aurora)" : "transparent"),
        background: on ? "var(--brand-soft)" : "transparent",
        color: on ? "var(--text-1)" : "var(--text-3)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all var(--dur)",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 14.5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: on ? "var(--brand)" : "var(--text-3)",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement(I, {
      size: 19
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, n.label), on && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 6,
        height: 6,
        borderRadius: 99,
        background: "var(--brand)"
      }
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      padding: 14,
      borderRadius: "var(--radius-lg)",
      background: "linear-gradient(160deg, var(--intelligence-soft), transparent)",
      border: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--text-3)",
      marginBottom: 8
    }
  }, "\u672C\u9031\u5831\u5831\u5373\u5C07\u767C\u9001"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 800,
      color: "var(--text-1)",
      fontSize: 14,
      marginBottom: 10
    }
  }, "\u9031\u5831 \xB7 \u7B2C 27 \u671F"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    block: true,
    iconRight: /*#__PURE__*/React.createElement(Icons.arrow, {
      size: 15
    })
  }, "\u7ACB\u5373\u9810\u89BD")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "6px"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    src: "../../assets/avatar.jpg",
    name: "Allen Chen",
    size: "sm",
    ring: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.2,
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-1)",
      fontWeight: 700,
      fontSize: 13
    }
  }, "Allen Chen"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-3)",
      fontSize: 11
    }
  }, "\u4E3B\u7DE8 \xB7 Editor")), /*#__PURE__*/React.createElement(IconButton, {
    size: "sm",
    label: "\u8A2D\u5B9A"
  }, /*#__PURE__*/React.createElement(Icons.settings, {
    size: 17
  }))));
}

/* ---------- Topbar ---------- */
function Topbar({
  title,
  sub,
  onMenu
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "16px var(--space-8)",
      borderBottom: "1px solid var(--border)",
      background: "var(--glass-fill)",
      backdropFilter: "var(--blur)",
      WebkitBackdropFilter: "var(--blur)",
      position: "sticky",
      top: 0,
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "kit-menu",
    onClick: onMenu,
    style: {
      display: "none",
      border: "1px solid var(--border)",
      background: "var(--night-800)",
      color: "var(--text-2)",
      borderRadius: 10,
      padding: 8,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(Icons.menu, {
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: "var(--font-display)",
      fontWeight: 900,
      fontSize: "var(--text-2xl)",
      color: "var(--text-1)",
      margin: 0,
      lineHeight: 1.1
    }
  }, title), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--text-3)",
      fontSize: 13.5,
      marginTop: 3
    }
  }, sub)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "kit-search",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 14px",
      background: "var(--night-800)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-pill)",
      color: "var(--text-3)",
      fontSize: 13.5,
      width: 220
    }
  }, /*#__PURE__*/React.createElement(Icons.search, {
    size: 16
  }), /*#__PURE__*/React.createElement("span", null, "\u641C\u5C0B\u52D5\u614B\u3001\u500B\u80A1\u3001\u7B46\u8A18\u2026")), /*#__PURE__*/React.createElement(IconButton, {
    variant: "surface",
    label: "\u901A\u77E5"
  }, /*#__PURE__*/React.createElement(Icons.bell, {
    size: 19
  }))));
}
window.Sidebar = Sidebar;
window.Topbar = Topbar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/aurora/kit.jsx", error: String((e && e.message) || e) }); }

__ds_ns.AuroraText = __ds_scope.AuroraText;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Divider = __ds_scope.Divider;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Callout = __ds_scope.Callout;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Sparkline = __ds_scope.Sparkline;

})();
