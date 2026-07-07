import * as React from "react";

export interface CalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default "insight" */
  tone?: "insight" | "intelligence" | "illumination" | "info" | "warning" | "danger";
  /** Leading icon element. */
  icon?: React.ReactNode;
  title?: React.ReactNode;
}

/** Tinted note / callout box with colored rail and icon. */
export declare function Callout(props: CalloutProps): JSX.Element;
