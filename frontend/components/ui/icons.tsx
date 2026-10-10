/**
 * App icon set. Line icons on a 20 x 20 grid with round caps and joins, no fills (only the pressed
 * moon fills). The line is always 2.2 px on screen: the stroke in the grid is 2.2 x 20 / size.
 * Decorative by default (aria-hidden). Pass `title` to name one.
 * Do not use components/Icons.tsx here: the reader owns that file.
 */
import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children" | "width" | "height"> {
  /** Drawn size in px. Default 20. */
  size?: number;
  title?: string;
}

/** Stroke width in grid units for a 2.2 px line at the drawn size. */
export const iconStroke = (size: number, line = 2.2) => (line * 20) / size;

function make(paths: ReactNode, opts: { line?: number } = {}) {
  return function Icon({ size = 20, title, strokeWidth, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth ?? iconStroke(size, opts.line)}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        focusable="false"
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        {paths}
      </svg>
    );
  };
}

export const CheckIcon = make(<path d="M4.5 10.5l3.7 3.7L15.5 6" />);
export const ProblemIcon = make(
  <>
    <path d="M10 2.8 18 16.5H2z" />
    <path d="M10 8v4" />
    <path d="M10 14.2v.1" />
  </>,
);
export const InfoIcon = make(
  <>
    <circle cx="10" cy="10" r="7.4" />
    <path d="M10 9.2v4.4" />
    <path d="M10 6.3v.1" />
  </>,
);
export const ClockIcon = make(
  <>
    <circle cx="10" cy="10" r="7.4" />
    <path d="M10 5.8V10l2.8 1.8" />
  </>,
);
export const MoonIcon = make(<path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9z" />);
/** The pressed moon: the one filled icon. */
export function MoonFilledIcon(props: IconProps) {
  return <MoonIcon {...props} fill="currentColor" />;
}
export const MenuIcon = make(<path d="M3 6h14M3 10h14M3 14h14" />);
export const CloseIcon = make(<path d="M5 5l10 10M15 5L5 15" />);
export const ArrowRightIcon = make(<path d="M3.5 10h12M11 5.5 15.5 10 11 14.5" />);
export const ArrowLeftIcon = make(<path d="M16.5 10h-12M9 5.5 4.5 10 9 14.5" />);
export const ChevronDownIcon = make(<path d="M5 7.5l5 5 5-5" />);
export const ChevronUpIcon = make(<path d="M5 12.5l5-5 5 5" />);
export const ChevronLeftIcon = make(<path d="M12.5 4.5 7 10l5.5 5.5" />);
export const ChevronRightIcon = make(<path d="M7.5 4.5 13 10l-5.5 5.5" />);
export const UploadIcon = make(<path d="M10 13V3.5M6 7.2l4-4 4 4M3.5 13.5v2.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2.5" />);
export const RetryIcon = make(<path d="M16.2 10a6.2 6.2 0 1 1-2-4.6M16.4 3.2v3.2h-3.2" />);
/** Three dots in a row. The loading dots use a wider line so they read as dots. */
export const DotsIcon = make(<path d="M4 10v.01M10 10v.01M16 10v.01" />, { line: 3.4 });
/** Step marks. */
export const StepNowIcon = make(
  <>
    <circle cx="10" cy="10" r="7.4" />
    <path d="M8.6 7.2v5.6l4.4-2.8z" />
  </>,
);
export const StepNextIcon = make(<circle cx="10" cy="10" r="7.4" />);
/** The wordmark's mark: a page split into panels. Sits on an action-colour tile. */
export function PanelMark({ width = 14, height = 20 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 18 26" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="16" height="24" />
      <path d="M1 10h16M9 10v15M1 18h8" />
    </svg>
  );
}
