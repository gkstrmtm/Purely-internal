"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { IconFunnel, IconPeopleGlyph, IconProfileGlyph } from "@/app/portal/PortalIcons";
import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  PortalSidebarNavButton,
  portalSidebarBorderButtonActiveClass,
  portalSidebarBorderButtonBaseClass,
  portalSidebarBorderButtonInactiveClass,
  portalSidebarIconToneBlueClass,
  portalSidebarIconToneNeutralClass,
  portalSidebarIconTonePinkClass,
  portalSidebarSectionStackClass,
  portalSidebarSectionTitleClass,
} from "@/app/portal/PortalServiceSidebarIcons";

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function usePortalPeopleSidebar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const setSidebarOverride = useSetPortalSidebarOverride();
  const portalBase = pathname.startsWith("/credit") ? "/credit" : "/portal";

  const sidebar = useMemo(() => {
    const items = [
      {
        href: `${portalBase}/app/people/contacts`,
        label: "Contacts",
        tone: portalSidebarIconToneBlueClass,
        icon: <IconPeopleGlyph size={18} />,
        active: pathname.startsWith(`${portalBase}/app/people/contacts`) && !pathname.includes("/duplicates"),
      },
      {
        href: `${portalBase}/app/people/users`,
        label: "Users",
        tone: portalSidebarIconToneNeutralClass,
        icon: <IconProfileGlyph size={18} />,
        active: pathname.startsWith(`${portalBase}/app/people/users`),
      },
      {
        href: `${portalBase}/app/people/contacts/duplicates`,
        label: "Duplicates",
        tone: portalSidebarIconTonePinkClass,
        icon: <IconFunnel size={18} />,
        active: pathname.startsWith(`${portalBase}/app/people/contacts/duplicates`),
      },
    ] as const;

    return (
      <div>
        <div className={portalSidebarSectionTitleClass}>People</div>
        <div className={portalSidebarSectionStackClass}>
          {items.map((item) => (
            <PortalSidebarNavButton
              key={item.href}
              type="button"
              onClick={() => router.push(item.href, { scroll: false })}
              aria-current={item.active ? "page" : undefined}
              label={item.label}
              icon={item.icon}
              iconToneClassName={item.tone}
              className={classNames(
                portalSidebarBorderButtonBaseClass,
                item.active ? portalSidebarBorderButtonActiveClass : portalSidebarBorderButtonInactiveClass,
              )}
            >
              {item.label}
            </PortalSidebarNavButton>
          ))}
        </div>
      </div>
    );
  }, [pathname, portalBase, router]);

  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: sidebar,
      mobileSidebarContent: sidebar,
    });
    return () => setSidebarOverride(null);
  }, [setSidebarOverride, sidebar]);
}