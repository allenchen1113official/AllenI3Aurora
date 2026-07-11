import React from "react";

/**
 * On/off toggle. Controlled via `checked` + `onChange`, or uncontrolled with
 * `defaultChecked`. Track fills with the aurora gradient when on.
 */
export function Switch({ checked, defaultChecked = false, onChange, disabled = false, size = "md", label, style, ...rest }) {
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

  const track = (
    <span
      onClick={toggle}
      role="switch"
      aria-checked={on}
      style={{
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
        ...(!label ? style : {}),
      }}
      {...(!label ? rest : {})}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? W - knob - 3 : 2,
          width: knob,
          height: knob,
          borderRadius: "50%",
          background: "var(--on-solid)",
          boxShadow: "var(--shadow-sm)",
          transition: "left var(--dur) var(--ease-soft)",
        }}
      />
    </span>
  );

  if (!label) return track;
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", ...style }} {...rest}>
      {track}
      <span style={{ fontSize: "var(--text-md)", color: "var(--text-2)" }}>{label}</span>
    </label>
  );
}
