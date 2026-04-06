import { notFound } from "next/navigation";

import { requirePortalUser } from "@/lib/portalAuth";
import { AI_FLOW_SIM_SLUG } from "@/lib/aiFlowSimSlug";

import { AiFlowSimClient } from "@/app/portal/app/debug/ai-flow/AiFlowSimClient";

function getAutorunLimitsForSimulator() {
  const maxAutoRoundsEnv = Number(process.env.PORTAL_AI_AUTORUN_MAX_ROUNDS);
  const maxRoundsDefault =
    Number.isFinite(maxAutoRoundsEnv) && maxAutoRoundsEnv > 0
      ? Math.min(40, Math.max(2, Math.floor(maxAutoRoundsEnv)))
      : 12;

  const maxAutoMsEnv = Number(process.env.PORTAL_AI_AUTORUN_MAX_MS);
  const maxMsDefault =
    Number.isFinite(maxAutoMsEnv) && maxAutoMsEnv > 0
      ? Math.min(60_000, Math.max(2_000, Math.floor(maxAutoMsEnv)))
      : 20_000;

  return {
    maxRoundsDefault,
    maxRoundsMax: 40,
    maxMsDefault,
    maxMsMax: 60_000,
    maxTotalStepsDefault: 18,
  };
}

export default async function AiFlowSimPage(props: { params: Promise<{ slug: string }> }) {
  await requirePortalUser();
  const { slug } = await props.params;

  if (slug !== AI_FLOW_SIM_SLUG) notFound();

  const autorunLimits = getAutorunLimitsForSimulator();
  return <AiFlowSimClient slug={slug} autorunLimits={autorunLimits as any} />;
}
