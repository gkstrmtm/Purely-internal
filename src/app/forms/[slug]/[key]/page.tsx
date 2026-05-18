import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { parseCreditFormContent, parseCreditFormFields, parseCreditFormStyle, parseCreditFormSuccessContent } from "@/lib/creditFormSchema";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

import { CreditHostedFormClient } from "@/app/credit/forms/[slug]/CreditHostedFormClient";
import { publicKeyFromId } from "@/lib/publicHostedKeys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchHostedFormRoute(slug: string, key: string) {
  const s = String(slug || "").trim().toLowerCase();
  const k = String(key || "").trim();
  if (!s || !k) return null;

  const form = await prisma.creditForm
    .findFirst({ where: { slug: s, id: { endsWith: k } }, select: { id: true, name: true, slug: true, status: true, schemaJson: true } })
    .catch(() => null);

  if (!form || form.status === "ARCHIVED") return null;
  if (publicKeyFromId(form.id, k.length) !== k) return null;

  const fields = parseCreditFormFields(form.schemaJson);
  const style = parseCreditFormStyle(form.schemaJson);
  const successContent = parseCreditFormSuccessContent(form.schemaJson);
  const content = parseCreditFormContent(form.schemaJson);

  return { form, fields, style, successContent, content };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}): Promise<Metadata> {
  const { slug, key } = await params;
  const loaded = await fetchHostedFormRoute(slug, key);
  if (!loaded) return {};

  const title = loaded.content?.displayTitle?.trim() || loaded.form.name || "";
  const description = loaded.content?.description?.trim() || "";
  const canonicalUrl = toPurelyHostedUrl(`/forms/${encodeURIComponent(loaded.form.slug)}/${encodeURIComponent(key)}`);

  return {
    title: title || undefined,
    description: description || undefined,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: title || undefined,
      description: description || undefined,
      url: canonicalUrl,
    },
  };
}

export default async function HostedFormWithKeyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; key: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug, key } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const loaded = await fetchHostedFormRoute(slug, key);
  if (!loaded) notFound();

  const embedRaw = resolvedSearchParams?.embed;
  const embed = Array.isArray(embedRaw) ? embedRaw[0] === "1" : embedRaw === "1";

  const { form, fields, style, successContent, content } = loaded;
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
          submitBasePath="/portal"
          hostedKey={key}
        />
      </main>
    </div>
  );
}
