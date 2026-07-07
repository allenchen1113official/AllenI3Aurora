import * as React from "react";

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Uppercase aurora-gradient kicker above the title. */
  kicker?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned action slot (button, link, tabs). */
  action?: React.ReactNode;
  /** @default "left" */
  align?: "left" | "center";
}

/** Section heading with aurora kicker, title, description and action slot. */
export declare function SectionHeader(props: SectionHeaderProps): JSX.Element;
