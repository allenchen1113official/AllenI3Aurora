import * as React from "react";

/**
 * Props for the primary action button.
 * @startingPoint section="Core" subtitle="Aurora-gradient action button + variants" viewport="700x180"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Icon element rendered before the label. */
  icon?: React.ReactNode;
  /** Icon element rendered after the label. */
  iconRight?: React.ReactNode;
  /** Fill the container width. @default false */
  block?: boolean;
  /** Show a spinner and block interaction. @default false */
  loading?: boolean;
}

/**
 * The primary action control for 艾倫報報 · Aurora.
 * @startingPoint section="Core" subtitle="Aurora-gradient action button + variants" viewport="700x180"
 */
export declare function Button(props: ButtonProps): JSX.Element;
