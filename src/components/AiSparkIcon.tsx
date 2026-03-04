import * as React from "react";

export function AiSparkIcon({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 2l1.2 5.1L18 9l-4.8 1.9L12 16l-1.2-5.1L6 9l4.8-1.9L12 2Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M19 13l.7 2.7L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-1.3L19 13Z"
        fill="currentColor"
        opacity="0.75"
      />
    </svg>
  );
}
