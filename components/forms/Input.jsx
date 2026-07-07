import React from "react";

/**
 * Text input field with optional label, leading icon, hint and error.
 * Built for the subscribe form and dashboard search.
 */
export function Input({
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

  return (
    <label htmlFor={fieldId} style={{ display: "flex", flexDirection: "column", gap: 7, ...style }}>
      {label && (
        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--fw-semibold)", color: "var(--text-2)" }}>
          {label}
        </span>
      )}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: pad,
          background: "var(--night-800)",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${error ? "var(--danger)" : focus ? "var(--border-aurora)" : "var(--border)"}`,
          boxShadow: focus && !error ? "var(--focus-ring)" : "none",
          transition: "border-color var(--dur), box-shadow var(--dur)",
        }}
      >
        {icon && <span style={{ color: "var(--text-3)", display: "flex", flex: "none" }}>{icon}</span>}
        <input
          id={fieldId}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--text-1)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-md)",
          }}
          {...rest}
        />
        {suffix && <span style={{ color: "var(--text-3)", flex: "none" }}>{suffix}</span>}
      </span>
      {(hint || error) && (
        <span style={{ fontSize: "var(--text-xs)", color: error ? "var(--danger)" : "var(--text-3)" }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
