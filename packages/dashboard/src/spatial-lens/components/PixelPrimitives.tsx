import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import styles from "../styles/pixel-primitives.module.css";
import {
  normalizePixelStatusTone,
  type PixelStatusTone,
} from "../tokens.js";

type PixelDensity = "compact" | "comfortable" | "spacious";
type PixelPanelElevation = "flat" | "raised" | "inset";
type PixelButtonVariant = "solid" | "ghost" | "floor";
type PixelDividerOrientation = "horizontal" | "vertical";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function getToneClassName(tone: PixelStatusTone) {
  return styles[`tone-${tone}`];
}

export interface PixelThemeProviderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PixelThemeProvider({
  children,
  className,
  ...props
}: PixelThemeProviderProps) {
  return (
    <div
      {...props}
      className={joinClassNames(styles["pixel-theme"], className)}
      data-spatial-lens-theme="pixel-control-plane"
    >
      {children}
    </div>
  );
}
export interface PixelFrameProps extends HTMLAttributes<HTMLDivElement> {
  density?: PixelDensity;
}

export function PixelFrame({
  density = "comfortable",
  className,
  ...props
}: PixelFrameProps) {
  return (
    <div
      {...props}
      className={joinClassNames(styles["pixel-frame"], className)}
      data-density={density}
    />
  );
}

export interface PixelPanelProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "aside" | "div";
  elevation?: PixelPanelElevation;
}

export function PixelPanel({
  as: Element = "section",
  elevation = "flat",
  className,
  ...props
}: PixelPanelProps) {
  return (
    <Element
      {...props}
      className={joinClassNames(styles["pixel-panel"], className)}
      data-elevation={elevation}
    />
  );
}

export interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: PixelStatusTone | string | null;
  variant?: PixelButtonVariant;
}

export function PixelButton({
  tone = "idle",
  variant = "solid",
  className,
  type = "button",
  ...props
}: PixelButtonProps) {
  const normalizedTone = normalizePixelStatusTone(tone);
  return (
    <button
      {...props}
      type={type}
      className={joinClassNames(
        styles["pixel-button"],
        getToneClassName(normalizedTone),
        className,
      )}
      data-variant={variant}
      data-tone={normalizedTone}
    />
  );
}

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PixelStatusTone | string | null;
}

export function StatusPill({
  tone = "idle",
  className,
  ...props
}: StatusPillProps) {
  const normalizedTone = normalizePixelStatusTone(tone);
  return (
    <span
      {...props}
      className={joinClassNames(
        styles["status-pill"],
        getToneClassName(normalizedTone),
        className,
      )}
      data-tone={normalizedTone}
    />
  );
}

export interface PixelDividerProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: PixelDividerOrientation;
}

export function PixelDivider({
  orientation = "horizontal",
  className,
  ...props
}: PixelDividerProps) {
  return (
    <hr
      {...props}
      className={joinClassNames(styles["pixel-divider"], className)}
      data-orientation={orientation}
    />
  );
}

export interface PixelTooltipProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function PixelTooltip({
  children,
  className,
  role = "tooltip",
  ...props
}: PixelTooltipProps) {
  return (
    <span
      {...props}
      className={joinClassNames(styles["pixel-tooltip"], className)}
      role={role}
    >
      {children}
    </span>
  );
}
