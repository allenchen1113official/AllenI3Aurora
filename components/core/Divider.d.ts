import * as React from "react";

export interface DividerProps extends React.HTMLAttributes<HTMLElement> {
  /** Render as a vertical rule instead of horizontal. @default false */
  vertical?: boolean;
  /** Centered label chip on the line. */
  label?: string;
}

/** Hairline separator, optionally vertical or labelled. */
export declare function Divider(props: DividerProps): JSX.Element;
