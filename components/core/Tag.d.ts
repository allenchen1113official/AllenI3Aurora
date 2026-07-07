import * as React from "react";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Selected / active state. @default false */
  selected?: boolean;
  /** Show a remove (×) button and fire this on click. */
  onRemove?: (e: React.MouseEvent) => void;
  /** Leading icon element. */
  icon?: React.ReactNode;
}

/** Interactive pill for filters, topics, and chips. */
export declare function Tag(props: TagProps): JSX.Element;
