import type { ReactNode } from "react";

function IconWrap({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
      {children}
    </span>
  );
}

export function IconHamburger() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 11V8a5 5 0 0110 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 11h12v10H6V11z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconDashboard() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 13h7V4H4v9zM13 20h7v-7h-7v7zM13 11h7V4h-7v7zM4 20h7v-5H4v5z" fill="currentColor" />
      </svg>
    </IconWrap>
  );
}

export function IconService() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 3l9 4.5-9 4.5-9-4.5L12 3z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M21 7.5V16.5L12 21l-9-4.5V7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </IconWrap>
  );
}

export function IconBilling() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3 7h18v10H3V7z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M3 11h18" stroke="currentColor" strokeWidth="2" />
      </svg>
    </IconWrap>
  );
}

export function IconProfile() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M20 21a8 8 0 10-16 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M12 12a4 4 0 100-8 4 4 0 000 8z"
          fill="currentColor"
        />
      </svg>
    </IconWrap>
  );
}

export function IconDot({ tone }: { tone: "blue" | "coral" | "ink" }) {
  const c =
    tone === "blue"
      ? "bg-[color:var(--color-brand-blue)]"
      : tone === "coral"
        ? "bg-[color:var(--color-brand-pink)]"
        : "bg-zinc-700";
  return <span className={`h-2.5 w-2.5 rounded-full ${c}`} />;
}

export function IconServiceGlyph({ slug }: { slug: string }) {
  // Small, simple glyphs used inside the service list icon chip.
  switch (slug) {
    case "blogs":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 7h10M7 11h10M7 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3z" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "booking":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 3v3M17 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 8h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 5h12a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "follow-up":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4v8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 8h8M8 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "ai-receptionist":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 2h12v6H6V2z" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 8v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "missed-call-textback":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 6l7 6 7-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 6h14v12H5V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "appointment-reminders":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22a2 2 0 002-2h-4a2 2 0 002 2z" fill="currentColor" />
          <path d="M18 16V11a6 6 0 10-12 0v5l-2 2h16l-2-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "reviews":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3l3 6 6 .8-4.4 4.3 1 6-5.6-3-5.6 3 1-6L3 9.8 9 9l3-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "lead-scraping":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 18a8 8 0 115.3-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M11 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "reporting":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 16v-6M12 16V8M16 16v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M21 7.5V16.5L12 21l-9-4.5V7.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
  }
}
