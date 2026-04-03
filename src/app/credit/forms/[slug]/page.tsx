import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { parseCreditFormContent, parseCreditFormFields, parseCreditFormStyle, parseCreditFormSuccessContent } from "@/lib/creditFormSchema";

import { CreditHostedFormClient } from "./CreditHostedFormClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreditHostedFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const s = String(slug || "").trim().toLowerCase();
  if (!s) notFound();

  const embedRaw = resolvedSearchParams?.embed;
  const embed = Array.isArray(embedRaw) ? embedRaw[0] === "1" : embedRaw === "1";

  const form = await prisma.creditForm
    .findUnique({ where: { slug: s }, select: { name: true, slug: true, status: true, schemaJson: true } })
    .catch(() => null);

  if (!form) notFound();

  const fields = parseCreditFormFields(form.schemaJson);
  const style = parseCreditFormStyle(form.schemaJson);
  const successContent = parseCreditFormSuccessContent(form.schemaJson);
  const content = parseCreditFormContent(form.schemaJson);
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
          successContent={successContent}
          content={content}
        />
      </main>
    </div>
  );
}
