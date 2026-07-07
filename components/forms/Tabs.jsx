import React from "react";

/**
 * Segmented tab control. Pass `items` [{ id, label, icon }], the active `value`,
 * and `onChange`. `variant`: "segment" (pill track) | "underline".
 */
export function Tabs({ items = [], value, defaultValue, onChange, variant = "segment", style }) {
  const [internal, setInternal] = React.useState(defaultValue ?? items[0]?.id);
  const active = value !== undefined ? value : internal;

  function pick(id) {
    if (value === undefined) setInternal(id);
    onChange && onChange(id);
  }

  if (variant === "underline") {
    return (
      <div style={{ display: "flex", gap: 22, borderBottom: "1px solid var(--border)", ...style }}>
        {items.map((it) => {
          const on = it.id === active;
          return (
            <button
              key={it.id}
              onClick={() => pick(it.id)}
              style={{
                border: "none", background: "transparent", cursor: "pointer",
                padding: "10px 2px", marginBottom: -1,
                fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-md)",
                color: on ? "var(--text-1)" : "var(--text-3)",
                borderBottom: `2px solid ${on ? "var(--aurora-teal)" : "transparent"}`,
                display: "inline-flex", alignItems: "center", gap: 7,
                transition: "color var(--dur)",
              }}
            >
              {it.icon}{it.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex", gap: 4, padding: 4,
        background: "var(--night-800)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", ...style,
      }}
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            onClick={() => pick(it.id)}
            style={{
              border: "none", cursor: "pointer",
              padding: "7px 16px", borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)", fontSize: "var(--text-base)",
              color: on ? "var(--text-on-accent)" : "var(--text-2)",
              background: on ? "var(--aurora-gradient)" : "transparent",
              boxShadow: on ? "var(--shadow-sm)" : "none",
              display: "inline-flex", alignItems: "center", gap: 7,
              transition: "background var(--dur), color var(--dur)",
            }}
          >
            {it.icon}{it.label}
          </button>
        );
      })}
    </div>
  );
}
