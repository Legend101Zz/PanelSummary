/** A few line icons, drawn at 20px on a 20-unit grid with a 1.6 stroke. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const ChevronLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </svg>
);
export const ChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </svg>
);
export const ArrowLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 10H4.5M9 5l-5 5 5 5" />
  </svg>
);
export const Close = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 5 10 10M15 5 5 15" />
  </svg>
);
/** One page. */
export const PageIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="2.5" width="10" height="15" rx="0.5" />
  </svg>
);
/** A page split into panels. */
export const PanelsIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="2.5" width="10" height="15" rx="0.5" />
    <path d="M5 9.5h10M10.5 2.5v7" />
  </svg>
);
/** The source text beside the page. */
export const SourceIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 4.5c2.2-.9 4.5-.9 7 .6 2.5-1.5 4.8-1.5 7-.6v11c-2.2-.9-4.5-.9-7 .6-2.5-1.5-4.8-1.5-7-.6z" />
    <path d="M10 5.1v11" />
  </svg>
);
export const ZoomReset = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 7V3.5H7M13 3.5h3.5V7M16.5 13v3.5H13M7 16.5H3.5V13" />
  </svg>
);
export const Upload = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 13V3.5M6 7.5l4-4 4 4M4 13.5v3h12v-3" />
  </svg>
);
