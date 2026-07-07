import * as React from "react";

export interface SwitchProps {
  /** Controlled on/off state. */
  checked?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultChecked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** @default "md" */
  size?: "sm" | "md";
  /** Optional trailing text label. */
  label?: string;
  style?: React.CSSProperties;
}

/** On/off toggle; track fills with the aurora gradient when on. */
export declare function Switch(props: SwitchProps): JSX.Element;
