import React from "react";

/**
 * Aurora gradient display text. Wraps children in the brand gradient clipped to
 * text — used for masthead, hero numbers, and the I³ wordmark.
 */
export function AuroraText({ as = "span", gradient = "var(--text-gradient)", children, style, ...rest }) {
  const Tag = as;
  return (
    <Tag
      style={{
        backgroundImage: gradient,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
        display: "inline-block",
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
