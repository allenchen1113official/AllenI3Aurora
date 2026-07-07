import * as React from "react";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled active id. */
  value?: string;
  /** Initial active id when uncontrolled. */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** @default "segment" */
  variant?: "segment" | "underline";
  style?: React.CSSProperties;
}

/** Segmented or underlined tab control. */
export declare function Tabs(props: TabsProps): JSX.Element;
