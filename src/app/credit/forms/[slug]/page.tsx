import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";

import { CreditHostedFormClient, type CreditFormStyle, type Field } from "./CreditHostedFormClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getDefaultFields(): Field[] {
  return [
    { name: "fullName", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "message", label: "Message", type: "textarea" },
  ];
}

function parseFields(schemaJson: unknown): Field[] {
  if (!schemaJson || typeof schemaJson !== "object") return getDefaultFields();
  const fields = (schemaJson as any).fields;
  if (!Array.isArray(fields)) return getDefaultFields();

  const out: Field[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const name = typeof (f as any).name === "string" ? (f as any).name.trim() : "";
    const label = typeof (f as any).label === "string" ? (f as any).label.trim() : "";
    const type = (f as any).type;
    const required = (f as any).required === true;

    if (!name || !label) continue;
    if (type !== "text" && type !== "email" && type !== "tel" && type !== "textarea") continue;
    out.push({ name, label, type, required });
  }

  return out.length ? out.slice(0, 25) : getDefaultFields();
}

function parseHexColor(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s === "transparent") return "transparent";
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  return s;
}

function parseStyle(schemaJson: unknown): CreditFormStyle {
  if (!schemaJson || typeof schemaJson !== "object") return {};
  const raw = (schemaJson as any).style;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: CreditFormStyle = {};
  const pageBg = parseHexColor((raw as any).pageBg);
  const cardBg = parseHexColor((raw as any).cardBg);
  const buttonBg = parseHexColor((raw as any).buttonBg);
  const buttonText = parseHexColor((raw as any).buttonText);
  const inputBg = parseHexColor((raw as any).inputBg);
  const inputBorder = parseHexColor((raw as any).inputBorder);
  const textColor = parseHexColor((raw as any).textColor);

  if (pageBg) out.pageBg = pageBg;
  if (cardBg) out.cardBg = cardBg;
  if (buttonBg) out.buttonBg = buttonBg;
  if (buttonText) out.buttonText = buttonText;
  if (inputBg) out.inputBg = inputBg;
  if (inputBorder) out.inputBorder = inputBorder;
  if (textColor) out.textColor = textColor;

  const radiusPx = (raw as any).radiusPx;
  if (typeof radiusPx === "number" && Number.isFinite(radiusPx)) {
    out.radiusPx = Math.max(0, Math.min(40, Math.round(radiusPx)));
  }

  return out;
}

export default async function CreditHostedFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const { slug } = await params;
  const s = String(slug || "").trim().toLowerCase();
  if (!s) notFound();

  const embedRaw = searchParams?.embed;
  const embed = Array.isArray(embedRaw) ? embedRaw[0] === "1" : embedRaw === "1";

  const form = await prisma.creditForm
    .findUnique({ where: { slug: s }, select: { name: true, slug: true, status: true, schemaJson: true } })
    .catch(() => null);

  if (!form) notFound();

  const fields = parseFields(form.schemaJson);
  const style = parseStyle(form.schemaJson);
  const pageBg = style.pageBg ?? (embed ? "transparent" : "#f4f4f5");

  return (
    <div className={embed ? "w-full" : "min-h-dvh w-full"} style={{ backgroundColor: pageBg }}>
      <main className={embed ? "mx-auto w-full max-w-3xl p-0" : "mx-auto w-full max-w-3xl p-8"}>
        <CreditHostedFormClient
          slug={form.slug}
          formName={form.name}
          fields={fields}
          embedded={embed}
          style={style}
        />
      </main>
    </div>
  );
}
