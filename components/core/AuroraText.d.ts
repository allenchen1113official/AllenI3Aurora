import * as React from "react";

export interface AuroraTextProps extends React.HTMLAttributes<HTMLElement> {
  /** Element tag to render. @default "span" */
  as?: keyof JSX.IntrinsicElements;
  /** CSS gradient for the text fill. @default var(--text-gradient) */
  gradient?: string;
}

/** Aurora gradient-clipped display text for mastheads and hero numbers. */
export declare function AuroraText(props: AuroraTextProps): JSX.Element;
