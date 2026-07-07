import * as React from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** @default "ghost" */
  variant?: "solid" | "surface" | "ghost";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** Accessible label (also the tooltip). */
  label?: string;
  /** Highlighted / pressed state (ghost only). @default false */
  active?: boolean;
}

/** Square, icon-only button. Pass the icon element as children. */
export declare function IconButton(props: IconButtonProps): JSX.Element;
