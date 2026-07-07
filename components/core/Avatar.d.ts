import * as React from "react";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Image URL. Falls back to initials when absent. */
  src?: string;
  /** Full name — used for initials and alt text. */
  name?: string;
  /** @default "md" */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Aurora gradient ring for featured state. @default false */
  ring?: boolean;
}

/** User / brand avatar with image or initials fallback. */
export declare function Avatar(props: AvatarProps): JSX.Element;
