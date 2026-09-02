import type { SVGProps } from "react";
import type { ToolId } from "@/core/commands/tools";

/**
 * Original monochrome tool icons. Silhouettes are intentionally familiar to
 * anyone coming from a professional NLE, but every path is drawn from scratch —
 * no third-party assets, logos or traced artwork.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
  viewBox: "0 0 24 24",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...props,
});

export function SelectionIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3.5 18.5 13H12.5l-2.2 7.2z" />
    </svg>
  );
}

export function TrackSelectIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6h6M4 12h6M4 18h6" />
      <path d="M13 12h7M17 8.5l3.5 3.5L17 15.5" />
    </svg>
  );
}

export function RippleEditIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5v14" />
      <rect x="8" y="7.5" width="6" height="9" rx="1" />
      <path d="M17 9.5 19.5 12 17 14.5" />
      <path d="M15.5 12h4" />
    </svg>
  );
}

export function RollingEditIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4v16" />
      <path d="M8.5 9 6 12l2.5 3" />
      <path d="M15.5 9 18 12l-2.5 3" />
      <path d="M4 12h3M17 12h3" />
    </svg>
  );
}

export function RateStretchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="7.5" width="16" height="9" rx="1" />
      <path d="M8 10.5v3M12 9.5v5M16 10.5v3" />
    </svg>
  );
}

export function RazorIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v9" />
      <path d="M8.5 12h7l-1.5 8.5h-4z" />
      <path d="M4 15.5h4M16 15.5h4" />
    </svg>
  );
}

export function SlipIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <path d="M9 12h6" />
      <path d="M11 9.5 8.5 12l2.5 2.5M13 9.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

export function SlideIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="8.5" y="6" width="7" height="12" rx="1" />
      <path d="M5 6v12M19 6v12" />
      <path d="M3.5 12h2M18.5 12h2" />
    </svg>
  );
}

export function PenIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 19.5 6 14l9-9 3 3-9 9z" />
      <path d="M14 6.5 17.5 10" />
      <path d="M4 19.5h6" />
    </svg>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 11.5V7.5a1.5 1.5 0 0 1 3 0V15a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-2.5a1.5 1.5 0 0 1 3 0" />
    </svg>
  );
}

export function ZoomIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M14.5 14.5 20 20" />
      <path d="M8 10.5h5M10.5 8v5" />
    </svg>
  );
}

export function TextIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 6h14" />
      <path d="M12 6v13" />
      <path d="M9 19h6" />
    </svg>
  );
}

export function SnapIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 4v7a5 5 0 0 0 10 0V4" />
      <path d="M5 4h4M15 4h4" />
      <path d="M12 16v4" />
    </svg>
  );
}

export const TOOL_ICONS: Record<ToolId, (props: IconProps) => JSX.Element> = {
  selection: SelectionIcon,
  trackSelect: TrackSelectIcon,
  rippleEdit: RippleEditIcon,
  rollingEdit: RollingEditIcon,
  rateStretch: RateStretchIcon,
  razor: RazorIcon,
  slip: SlipIcon,
  slide: SlideIcon,
  pen: PenIcon,
  hand: HandIcon,
  zoom: ZoomIcon,
  text: TextIcon,
};
