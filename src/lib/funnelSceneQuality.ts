export type FunnelSceneQualityTone = "good" | "warn" | "bad";

export type FunnelSceneQualityCheck = {
  key:
    | "opening-frame"
    | "hierarchy-contrast"
    | "section-rhythm"
    | "proof-staging"
    | "cta-placement"
    | "composition-system";
  title: string;
  state: string;
  tone: FunnelSceneQualityTone;
  detail: string;
};

export type FunnelSceneStructuralMove = {
  title: string;
  detail: string;
};

export type FunnelSceneAnatomy = {
  rootBlocks: number;
  totalBlocks: number;
  sections: number;
  layoutBlocks: number;
  textNodes: number;
  actions: number;
  forms: number;
  media: number;
  codeIslands: number;
  headers: number;
  onlyCodeIsland: boolean;
};

export type FunnelSceneQualityAssessment = {
  importedSlab: boolean;
  openingFrameResolved: boolean;
  hierarchyResolved: boolean;
  rhythmResolved: boolean;
  proofStagingResolved: boolean;
  actionPlacementResolved: boolean;
  compositionResolved: boolean;
  textHeavy: boolean;
  pageQualityChecks: FunnelSceneQualityCheck[];
  structuralPriorities: FunnelSceneStructuralMove[];
  dominantIssue: FunnelSceneStructuralMove;
};

function countPatternMatches(value: string, pattern: RegExp) {
  return (String(value || "").match(pattern) || []).length;
}

function countLayoutWrappers(html: string) {
  return countPatternMatches(
    html,
    /<(div|article|aside|header|footer|nav)\b[^>]*class=["'][^"']*(shell|band|card|panel|frame|stack|cluster|grid|split|wrap|container|layout|row|column)[^"']*["'][^>]*>/gi,
  );
}

export function buildFragmentSceneAnatomy(currentHtml: string, currentCss?: string): FunnelSceneAnatomy {
  const html = String(currentHtml || "");
  const css = String(currentCss || "");
  const hasScene = Boolean(html.trim() || css.trim());
  const sections = countPatternMatches(html, /<section\b/gi);
  const wrappers = countLayoutWrappers(html);
  const headers = countPatternMatches(html, /<h[1-6]\b/gi);
  const textNodes = countPatternMatches(html, /<(p|li|blockquote)\b/gi);
  const actions = countPatternMatches(html, /<(a|button)\b/gi);
  const forms = countPatternMatches(html, /<(form|input|textarea|select)\b/gi);
  const media = countPatternMatches(html, /<(img|picture|video|svg)\b/gi);
  const codeIslands = countPatternMatches(html, /<(iframe|script)\b/gi);
  const rootBlocks = sections > 0 ? sections : hasScene ? 1 : 0;
  const layoutBlocks = sections + wrappers;
  const totalBlocks = sections + wrappers + headers + textNodes + actions + forms + media + codeIslands;

  return {
    rootBlocks,
    totalBlocks,
    sections,
    layoutBlocks,
    textNodes,
    actions,
    forms,
    media,
    codeIslands,
    headers,
    onlyCodeIsland: false,
  };
}

export function assessFunnelSceneQuality(input: {
  pageAnatomy: FunnelSceneAnatomy;
  proofResolved: boolean;
  ctaResolved: boolean;
  sectionPlanItems: string[];
  proofModel?: string | null;
  designIntentLoose?: boolean;
}): FunnelSceneQualityAssessment {
  const { pageAnatomy, proofResolved, ctaResolved, sectionPlanItems, proofModel, designIntentLoose = false } = input;
  const importedSlab = pageAnatomy.onlyCodeIsland;
  const openingFrameResolved = !importedSlab && pageAnatomy.rootBlocks >= 1 && (pageAnatomy.actions + pageAnatomy.forms >= 1 || pageAnatomy.media >= 1);
  const hierarchyResolved = !importedSlab && (pageAnatomy.sections >= 2 || pageAnatomy.layoutBlocks >= 2 || pageAnatomy.headers >= 1);
  const rhythmResolved = !importedSlab && (pageAnatomy.sections >= 3 || pageAnatomy.layoutBlocks >= 3 || sectionPlanItems.length >= 4);
  const proofStagingResolved = proofResolved && !importedSlab && (pageAnatomy.sections >= 2 || pageAnatomy.media >= 1);
  const actionPlacementResolved =
    ctaResolved &&
    !importedSlab &&
    (pageAnatomy.actions + pageAnatomy.forms >= 2 || (pageAnatomy.actions + pageAnatomy.forms >= 1 && pageAnatomy.sections >= 3));
  const compositionResolved = !importedSlab && (pageAnatomy.sections > 0 || pageAnatomy.layoutBlocks > 0 || pageAnatomy.totalBlocks >= 6);
  const textHeavy =
    !importedSlab &&
    pageAnatomy.textNodes >= Math.max(6, (pageAnatomy.actions + pageAnatomy.forms) * 4) &&
    pageAnatomy.media === 0 &&
    pageAnatomy.layoutBlocks <= 1;

  const pageQualityChecks: FunnelSceneQualityCheck[] = [
    {
      key: "opening-frame",
      title: "Opening frame",
      state: importedSlab ? "Opaque" : openingFrameResolved ? "Present" : "Weak",
      tone: importedSlab ? "bad" : openingFrameResolved ? "good" : "warn",
      detail: importedSlab
        ? "The first screen is trapped inside one imported code slab, so Direction cannot tell whether the opening is actually framed well or just visually accidental."
        : openingFrameResolved
          ? "The page has enough structure to form a real opening moment instead of starting as loose content."
          : designIntentLoose
            ? "The page still lacks a deliberate opening frame. That usually happens when the design goal is not tight enough yet, so the hero becomes generic."
            : "The page needs a clearer first-screen composition with a stronger anchor and immediate action path.",
    },
    {
      key: "hierarchy-contrast",
      title: "Hierarchy and contrast",
      state: importedSlab ? "Hidden" : hierarchyResolved ? "Readable" : textHeavy ? "Text-heavy" : "Flat",
      tone: importedSlab ? "bad" : hierarchyResolved ? "good" : "warn",
      detail: importedSlab
        ? "Because the page is still one imported block, the editor cannot reason about actual hierarchy or contrast changes across the page."
        : hierarchyResolved
          ? `The page has ${pageAnatomy.sections} sections and ${pageAnatomy.layoutBlocks} layout blocks to create visible hierarchy.`
          : textHeavy
            ? "The structure is carrying too much text without enough layout contrast, media, or grouped proof moments."
            : "The page needs stronger containers, contrast shifts, and layout breaks so the eye can understand priority at a glance.",
    },
    {
      key: "section-rhythm",
      title: "Section rhythm",
      state: importedSlab ? "Collapsed" : rhythmResolved ? "Sequenced" : "Monotone",
      tone: importedSlab ? "bad" : rhythmResolved ? "good" : "warn",
      detail: importedSlab
        ? "Right now the page reads more like one continuous import than a top-to-bottom sequence of designed sections."
        : rhythmResolved
          ? `The page has enough section cadence to build a real scroll rhythm across ${pageAnatomy.sections} sections.`
          : "The page needs clearer top-to-bottom pacing. Visitors should feel transitions between hero, proof, detail, and action instead of one continuous content run.",
    },
    {
      key: "proof-staging",
      title: "Proof staging",
      state: importedSlab ? "Buried" : proofStagingResolved ? "Staged" : "Underdesigned",
      tone: importedSlab ? "bad" : proofStagingResolved ? "good" : "warn",
      detail: importedSlab
        ? "Any proof on the page is likely buried inside imported markup rather than surfaced as a designed proof moment."
        : proofStagingResolved
          ? proofModel || "The page has a defined proof model with room to stage it visually."
          : "The page needs designed proof surfaces, not just proof ideas. Give trust its own visual bands or modules.",
    },
    {
      key: "cta-placement",
      title: "CTA placement",
      state: importedSlab ? "Unclear" : actionPlacementResolved ? "Anchored" : "Under-supported",
      tone: importedSlab ? "bad" : actionPlacementResolved ? "good" : "warn",
      detail: importedSlab
        ? "The action path is hard to trust while the page remains one imported block with no explicit placement logic."
        : actionPlacementResolved
          ? `${pageAnatomy.actions + pageAnatomy.forms} visible action points give the page a usable conversion spine.`
          : "The page needs better CTA repetition and placement so the ask appears at the right structural moments, not just once and then disappears.",
    },
    {
      key: "composition-system",
      title: "Composition system",
      state: importedSlab ? "Imported slab" : compositionResolved ? "Composable" : "Thin",
      tone: importedSlab ? "bad" : compositionResolved ? "good" : "warn",
      detail: importedSlab
        ? "This is the root design problem: one custom code block means the page is not composed as real editable elements yet."
        : compositionResolved
          ? `${pageAnatomy.totalBlocks} editable blocks give the page enough structure to improve layout intentionally.`
          : `Only ${pageAnatomy.totalBlocks} editable blocks are carrying the page, which is too thin for strong visual pacing and modular design control.`,
    },
  ];

  const structuralPriorities = [
    importedSlab
      ? {
          title: "Decompose the page into real sections",
          detail: "Break the imported markup into editable hero, proof, detail, and CTA sections before judging polish.",
        }
      : null,
    !openingFrameResolved
      ? {
          title: "Rebuild the first screen",
          detail: "Give the page a stronger opening frame with clearer containment, spacing, and an immediate action path.",
        }
      : null,
    !hierarchyResolved
      ? {
          title: "Strengthen hierarchy",
          detail: "Use stronger containers, contrast shifts, grouped modules, and fewer uninterrupted text runs.",
        }
      : null,
    !rhythmResolved
      ? {
          title: "Create section cadence",
          detail: "Alternate dense and light sections so the page has real scroll rhythm instead of one continuous slab.",
        }
      : null,
    !proofStagingResolved
      ? {
          title: "Stage proof visually",
          detail: "Give credibility its own designed surfaces near the first serious ask and before the close.",
        }
      : null,
    !actionPlacementResolved
      ? {
          title: "Re-anchor the CTA",
          detail: "Place the ask at the right structural beats instead of relying on one isolated action point.",
        }
      : null,
    !compositionResolved && !importedSlab
      ? {
          title: "Add composable structure",
          detail: "Increase the number of real layout blocks so hierarchy and pacing can be tuned intentionally.",
        }
      : null,
  ].filter(Boolean) as FunnelSceneStructuralMove[];

  while (structuralPriorities.length < 3) {
    structuralPriorities.push(
      structuralPriorities.length === 0
        ? {
            title: "Refine the strongest section",
            detail: "Tighten the section carrying the most weight instead of restyling the whole page at once.",
          }
        : structuralPriorities.length === 1
          ? {
              title: "Preserve what is already working",
              detail: "Keep the current structural strengths stable while you improve the weaker beats.",
            }
          : {
              title: "Save polish for later",
              detail: "Finish the structural pass before typography and copy refinements take over the iteration.",
            },
    );
  }

  const dominantIssue = importedSlab
    ? {
        title: "This page is not structurally legible yet",
        detail: "The system is still looking at one imported code slab, so hierarchy, pacing, proof, and CTA placement are only partially visible.",
      }
    : !hierarchyResolved && textHeavy
      ? {
          title: "This page feels flat because it is carrying too much text without enough structure",
          detail: "The visual system is weak. There are not enough layout breaks, contrast shifts, grouped modules, or proof moments to create a readable top-to-bottom experience.",
        }
      : !rhythmResolved
        ? {
            title: "This page feels monotonous because the section rhythm is weak",
            detail: "The scroll experience is not expanding and contracting with intent. Visitors are moving through one continuous content run instead of distinct designed beats.",
          }
        : !actionPlacementResolved
          ? {
              title: "This page asks without enough structural support",
              detail: "The action path is present, but it is not anchored at enough moments in the layout to feel earned and usable as the visitor moves down the page.",
            }
          : !proofStagingResolved
            ? {
                title: "This page has claims, but not enough designed proof",
                detail: "Trust is not being staged visually. Proof needs dedicated surfaces so the page feels credible before it asks for action.",
              }
            : {
                title: "This page is structurally viable for refinement",
                detail: "The page has enough layout logic to support focused design iteration, so the next passes can tighten hierarchy, proof moments, and copy instead of rebuilding from scratch.",
              };

  return {
    importedSlab,
    openingFrameResolved,
    hierarchyResolved,
    rhythmResolved,
    proofStagingResolved,
    actionPlacementResolved,
    compositionResolved,
    textHeavy,
    pageQualityChecks,
    structuralPriorities: structuralPriorities.slice(0, 3),
    dominantIssue,
  };
}