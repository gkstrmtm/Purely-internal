import type { FunnelExhibitArchetype } from "@/lib/funnelExhibitArchetypes";
import type { FunnelShellFrame } from "@/lib/funnelShellFrames";

type FunnelVisualWhyPrinciple = {
  id: string;
  title: string;
  why: string;
  evidence: string;
  moves: string[];
  references: string[];
};

const VISUAL_WHY_PRINCIPLES = {
  decisionCluster: {
    id: "decision-cluster",
    title: "Build one dominant decision cluster first",
    why: "Users should be able to understand the promise, the audience fit, the first action, and the trust cue in one controlled visual sweep instead of hunting across the hero.",
    evidence:
      "Baymard's checkout research found that split-attention layouts pull the eye in multiple directions and increase misreads, while a single directional scan reduces skipped information and friction.",
    moves: [
      "Group the headline, qualifier, CTA, and one trust cue inside the same visual container or tightly related stack.",
      "Keep one dominant CTA in the first screen and avoid multiple equal-weight actions competing for attention.",
      "Use one accent family for the ask and let typography plus spacing do most of the emotional work.",
    ],
    references: ["Stripe Atlas", "Ramp"],
  },
  adjacentProof: {
    id: "adjacent-proof",
    title: "Place proof next to the first serious ask",
    why: "High-trust pages feel credible when reassurance and evidence are visible before or immediately after the first conversion moment, not buried in a later testimonial graveyard.",
    evidence:
      "Baymard's product-page research shows users actively seek reassurance in main content near purchase moments, and visible support or trust cues reduce abandonment anxiety on consequential decisions.",
    moves: [
      "Put a proof strip, named logo cluster, outcome stat, or authority quote immediately under the hero or inside the hero support zone.",
      "Differentiate staff or authority responses visually so trust content reads as deliberate, not like body copy.",
      "Treat proof as a designed surface with contrast and containment, not a loose paragraph.",
    ],
    references: ["Ramp", "Stripe Atlas"],
  },
  contextualVisuals: {
    id: "contextual-visuals",
    title: "Use context-rich visuals instead of abstract decoration",
    why: "People understand value faster when visuals show the offer in real use, with recognizable scale, workflow, or environment, rather than isolated abstract shapes.",
    evidence:
      "Baymard found 42% of users try to judge scale from images and respond more positively when visuals show real context rather than cut-out assets; contextual visuals reduce misinterpretation and help users imagine fit.",
    moves: [
      "Prefer proof mockups, process frames, dashboard excerpts, call previews, or environment-led imagery over decorative gradient blobs.",
      "Show one visual that implies real use context or outcome scale, not just brand atmosphere.",
      "If media is absent, create context through labeled process cards or proof frames with concrete referents.",
    ],
    references: ["Stripe Atlas", "Linear"],
  },
  singlePath: {
    id: "single-path",
    title: "Preserve a single reading path through the form or booking moment",
    why: "Calm premium funnels feel easier when the user can scan top-to-bottom without resolving multiple competing columns, tracks, or interaction branches.",
    evidence:
      "Baymard's multicolumn-form testing repeatedly found that users misread and skip fields when layouts pull attention sideways; single-column flow improves completion and review accuracy.",
    moves: [
      "Keep booking or qualification content in one primary column unless two items are conceptually one unit.",
      "Use side-by-side layout only for tightly related micro-elements, not whole decision branches.",
      "Make the CTA, proof, and reassurance stack feel like one downward progression.",
    ],
    references: ["Stripe Atlas", "Ramp"],
  },
  restrainedCharacter: {
    id: "restrained-character",
    title: "Create character through restraint and contrast, not noise",
    why: "Premium surfaces feel intentional when contrast, pacing, and containment carry the mood; loud color floods and random cards read as generic template energy.",
    evidence:
      "Baymard's product-page findings repeatedly show that attention-grabbing clutter can bury important controls and increase effort; clearer emphasis beats louder decoration.",
    moves: [
      "Alternate calm neutrals with a small number of deliberate high-contrast proof or CTA surfaces.",
      "Use borders, shadows, and tonal shifts to separate beats before introducing stronger color.",
      "Make one or two sections feel special rather than styling every block the same way.",
    ],
    references: ["Linear", "Ramp"],
  },
} satisfies Record<string, FunnelVisualWhyPrinciple>;

function hasPremiumToneRequest(prompt: string, shellFrame: FunnelShellFrame | null, archetypes: FunnelExhibitArchetype[]) {
  const blob = [prompt, shellFrame?.visualTone || "", ...archetypes.map((item) => `${item.designTone} ${item.label}`)].join(" ");
  return /premium|character|intentional|editorial|refined|elevated|calm|high-trust|luxury|distinct/i.test(blob);
}

export function buildFunnelVisualWhyBlock(input: {
  pageType?: string | null;
  prompt?: string | null;
  shellFrame: FunnelShellFrame | null;
  archetypes: FunnelExhibitArchetype[];
}) {
  const prompt = String(input.prompt || "");
  const pageType = String(input.pageType || "").toLowerCase();
  const premiumTone = hasPremiumToneRequest(prompt, input.shellFrame, input.archetypes);

  const selected: FunnelVisualWhyPrinciple[] = [VISUAL_WHY_PRINCIPLES.decisionCluster, VISUAL_WHY_PRINCIPLES.adjacentProof];

  if (["booking", "application", "lead-capture"].includes(pageType)) {
    selected.push(VISUAL_WHY_PRINCIPLES.singlePath);
  }
  selected.push(VISUAL_WHY_PRINCIPLES.contextualVisuals);
  if (premiumTone) {
    selected.push(VISUAL_WHY_PRINCIPLES.restrainedCharacter);
  }

  const unique = Array.from(new Map(selected.map((item) => [item.id, item])).values()).slice(0, 4);
  if (!unique.length) return "";

  const lines = ["VISUAL_WHY_FOUNDATION:"];
  for (const principle of unique) {
    lines.push(`- Principle: ${principle.title}`);
    lines.push(`- Why: ${principle.why}`);
    lines.push(`- Evidence: ${principle.evidence}`);
    lines.push(`- Moves: ${principle.moves.join(" | ")}`);
    lines.push(`- Reference motifs: ${principle.references.join(" | ")}`);
  }
  return lines.join("\n");
}