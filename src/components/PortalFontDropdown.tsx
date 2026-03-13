"use client";

import type { CSSProperties } from "react";

import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { FONT_PRESETS } from "@/lib/fontPresets";

export type PortalFontDropdownOption = {
  value: string;
  label: string;
  hint?: string;
  fontFamily?: string;
};

export function PortalFontDropdown(props: {
  value: string;
  onChange: (v: string) => void;
  includeCustom?: boolean;
  customLabel?: string;
  customFontFamily?: string;
  extraOptions?: PortalFontDropdownOption[];
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const {
    value,
    onChange,
    includeCustom = false,
    customLabel = "Custom…",
    customFontFamily,
    extraOptions,
    className,
    buttonClassName,
    disabled,
    placeholder,
  } = props;

  const baseOptions: PortalFontDropdownOption[] = Array.isArray(extraOptions) ? extraOptions : [];
  const presetOptions: PortalFontDropdownOption[] = FONT_PRESETS.filter((p) => !baseOptions.some((b) => b.value === p.key)).map(
    (p) => ({
      value: p.key,
      label: p.label,
      hint: p.googleFamily ? "Google font" : p.fontFamily ? "System font" : undefined,
      fontFamily: p.fontFamily,
    }),
  );

  const options: PortalListboxOption<string>[] = [
    ...baseOptions.map((o) => ({ value: o.value, label: o.label, hint: o.hint })),
    ...presetOptions.map((o) => ({ value: o.value, label: o.label, hint: o.hint })),
    ...(includeCustom ? [{ value: "custom", label: customLabel }] : []),
  ];

  const resolveFontFamily = (opt: PortalListboxOption<string> | null): string | undefined => {
    if (!opt) return undefined;
    if (opt.value === "custom") {
      const fam = String(customFontFamily || "").trim();
      return fam || undefined;
    }
    const extra = baseOptions.find((o) => o.value === opt.value);
    if (extra?.fontFamily) return extra.fontFamily;
    const preset = FONT_PRESETS.find((p) => p.key === opt.value);
    return preset?.fontFamily || undefined;
  };

  const getOptionStyle = (opt: PortalListboxOption<string>): CSSProperties | undefined => {
    const fam = resolveFontFamily(opt);
    return fam ? { fontFamily: fam } : undefined;
  };

  const getButtonLabelStyle = (opt: PortalListboxOption<string> | null): CSSProperties | undefined => {
    const fam = resolveFontFamily(opt);
    return fam ? { fontFamily: fam } : undefined;
  };

  return (
    <PortalListboxDropdown
      value={String(value || "")}
      onChange={(v) => onChange(String(v || ""))}
      options={options as any}
      className={className}
      buttonClassName={buttonClassName}
      disabled={disabled}
      placeholder={placeholder}
      getOptionStyle={getOptionStyle}
      getButtonLabelStyle={getButtonLabelStyle}
    />
  );
}
