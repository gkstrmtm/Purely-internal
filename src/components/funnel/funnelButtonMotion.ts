export const FUNNEL_BUTTON_MOTION_CLASS = [
  "transition-[transform,background-color,border-color,color,box-shadow,opacity,filter]",
  "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
  "hover:delay-75 hover:-translate-y-0.5",
  "active:delay-0 active:translate-y-0 active:scale-[0.985] active:duration-150",
  "motion-reduce:transform-none motion-reduce:transition-none",
].join(" ");

export const FUNNEL_BUTTON_RAISE_CLASS = "hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)]";

export const FUNNEL_BUTTON_SUBTLE_RAISE_CLASS = "hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)]";

export const FUNNEL_BUTTON_TEXT_MOTION_CLASS = [
  "transition-[transform,background-color,color,opacity]",
  "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
  "hover:delay-75 hover:-translate-y-px",
  "active:delay-0 active:translate-y-0 active:scale-[0.99] active:duration-150",
  "motion-reduce:transform-none motion-reduce:transition-none",
].join(" ");