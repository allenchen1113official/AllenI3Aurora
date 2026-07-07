import * as React from "react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Field label rendered above the control. */
  label?: string;
  /** Helper text below the field. */
  hint?: string;
  /** Error message — turns the field red and replaces the hint. */
  error?: string;
  /** Leading icon element. */
  icon?: React.ReactNode;
  /** Trailing element (unit, action). */
  suffix?: React.ReactNode;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
}

/** Text input with label, icon, hint and error states. */
export declare function Input(props: InputProps): JSX.Element;
