import { notFound } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";
import { AI_FLOW_SIM_SLUG } from "@/lib/aiFlowSimSlug";

import { AiFlowSimClient } from "@/app/portal/app/debug/ai-flow/AiFlowSimClient";

export default async function AiFlowSimPage(props: { params: Promise<{ slug: string }> }) {
  await requirePortalUser();
  const { slug } = await props.params;

  if (slug !== AI_FLOW_SIM_SLUG) notFound();

  return <AiFlowSimClient slug={slug} />;
}
