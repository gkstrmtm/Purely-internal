import type { ReactNode } from "react";

type Align = "left" | "center";
type Pad = "sm" | "md" | "lg";

type ShellProps = {
  children: ReactNode;
  className?: string;
};

type SectionShellProps = ShellProps & {
  id?: string;
  align?: Align;
  pad?: Pad;
  eyebrow?: string;
  title?: string;
  description?: string;
};

type PlaceholderButtonProps = {
  label: string;
  href?: string;
  variant?: "primary" | "secondary";
};

function joinClasses(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

function padClasses(pad: Pad): string {
  switch (pad) {
    case "sm":
      return "py-10";
    case "lg":
      return "py-20";
    case "md":
    default:
      return "py-14";
  }
}

export function StencilPageShell({ children, className }: ShellProps) {
  return (
    <div
      className={joinClasses(
        "min-h-screen bg-white text-slate-900",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StencilContainer({ children, className }: ShellProps) {
  return (
    <div className={joinClasses("mx-auto w-full max-w-6xl px-6", className)}>
      {children}
    </div>
  );
}

export function StencilSectionShell({
  children,
  className,
  id,
  align = "left",
  pad = "md",
  eyebrow,
  title,
  description,
}: SectionShellProps) {
  const textAlign = align === "center" ? "text-center" : "text-left";

  return (
    <section id={id} className={joinClasses(padClasses(pad), className)}>
      <StencilContainer>
        <div className={joinClasses("space-y-5", textAlign)}>
          {eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h2 className="max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
              {description}
            </p>
          ) : null}
          {children}
        </div>
      </StencilContainer>
    </section>
  );
}

export function StencilCard({ children, className }: ShellProps) {
  return (
    <div className={joinClasses("rounded-3xl border border-slate-200 bg-slate-50 p-6", className)}>
      {children}
    </div>
  );
}

export function StencilPlaceholderButton({
  label,
  href = "#",
  variant = "primary",
}: PlaceholderButtonProps) {
  const palette =
    variant === "primary"
      ? "bg-slate-900 text-white"
      : "border border-slate-300 bg-white text-slate-900";

  return (
    <a
      className={joinClasses(
        "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold",
        palette,
      )}
      href={href}
    >
      {label}
    </a>
  );
}

export function StencilBulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3 text-sm leading-6 text-slate-700 sm:text-base">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-2 h-2 w-2 rounded-full bg-slate-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}