import * as React from "react";

/**
 * Props for the base surface card.
 * @startingPoint section="Surfaces" subtitle="Night-surface card with aurora accent" viewport="700x260"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Top accent bar + optional glow color. @default "none" */
  accent?: "none" | "aurora" | "insight" | "intelligence" | "illumination";
  /** Frosted-glass surface (blur + translucent fill). @default false */
  glass?: boolean;
  /** Hover-lift + pointer cursor. @default false */
  interactive?: boolean;
  /** Render the accent as an ambient glow shadow. @default false */
  glow?: boolean;
  /** Inner padding (any CSS length). @default var(--space-6) */
  padding?: string;
}

/**
 * Base surface card for 艾倫報報 · Aurora.
 * @startingPoint section="Surfaces" subtitle="Night-surface card with aurora accent" viewport="700x260"
 */
export declare function Card(props: CardProps): JSX.Element;
