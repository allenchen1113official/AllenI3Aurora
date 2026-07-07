import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color tone. The three I's map to insight / intelligence / illumination. @default "neutral" */
  tone?: "neutral" | "insight" | "intelligence" | "illumination" | "success" | "warning" | "danger";
  /** @default "soft" */
  variant?: "soft" | "solid" | "outline";
  /** Leading status dot. @default false */
  dot?: boolean;
}

/** Small status / category label. */
export declare function Badge(props: BadgeProps): JSX.Element;
