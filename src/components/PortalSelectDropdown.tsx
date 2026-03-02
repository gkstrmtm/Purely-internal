"use client";

import { useMemo } from "react";

import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";

export type PortalSelectOption<V extends string | number> = {
  value: V;
  label: string;
  disabled?: boolean;
  hint?: string;
};

export function PortalSelectDropdown<V extends string | number>(props: {
  value: V | null | undefined;
  options: Array<PortalSelectOption<V>>;
  onChange: (v: V) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
}) {
  const { value, options, onChange, name, id, disabled, className, buttonClassName, placeholder } = props;

  const valueStr = value === null || typeof value === "undefined" ? "" : String(value);

  const listboxOptions: Array<PortalListboxOption<string>> = useMemo(() => {
    return options.map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled, hint: o.hint }));
  }, [options]);

  return (
    <div className={className || ""}>
      {name ? <input type="hidden" name={name} value={valueStr} /> : null}
      <PortalListboxDropdown<string>
        value={valueStr}
        options={listboxOptions}
        buttonId={id}
        onChange={(vStr) => {
          const match = options.find((o) => String(o.value) === vStr);
          if (match) onChange(match.value);
        }}
        disabled={disabled}
        placeholder={placeholder}
        buttonClassName={buttonClassName}
      />
    </div>
  );
}
