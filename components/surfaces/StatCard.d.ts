import * as React from "react";

/**
 * Props for the dashboard metric widget.
 * @startingPoint section="Surfaces" subtitle="Dashboard metric widget + sparkline" viewport="700x200"
 */
export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Metric name. */
  label?: React.ReactNode;
  /** The big number / value. */
  value?: React.ReactNode;
  /** Trailing unit (e.g. "pt", "%", "檔"). */
  unit?: string;
  /** Change value — number (rendered as ±n%) or a preformatted string. */
  delta?: number | string;
  /** "semantic" = green-up / red-down; "finance" = Taiwan 紅漲綠跌. @default "semantic" */
  deltaMode?: "semantic" | "finance";
  /** Inline sparkline element (see Sparkline). */
  spark?: React.ReactNode;
  /** Accent icon element. */
  icon?: React.ReactNode;
  /** Accent color. @default "brand" */
  tone?: "brand" | "insight" | "intelligence" | "illumination";
}

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

/**
 * Dashboard metric widget with value, delta and optional sparkline.
 * @startingPoint section="Surfaces" subtitle="Dashboard metric widget + sparkline" viewport="700x200"
 */
export declare function StatCard(props: StatCardProps): JSX.Element;
/** Tiny inline sparkline for StatCard and dashboard rows. */
export declare function Sparkline(props: SparklineProps): JSX.Element;
