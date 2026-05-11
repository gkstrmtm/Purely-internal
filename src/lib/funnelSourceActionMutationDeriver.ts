import type { BlockStyle, CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import type { FunnelPageMutation } from "@/lib/funnelPageMutations";
import type { SourceActionPlan, SourceActionPlanMove } from "@/lib/funnelSourceActionPlan";

function findFirstBlock(items: CreditFunnelBlock[], predicate: (block: CreditFunnelBlock) => boolean): CreditFunnelBlock | null {
  for (const block of items) {
    if (!block || typeof block !== "object") continue;
    if (predicate(block)) return block;

    if (block.type === "section") {
      const props = (block.props || {}) as Record<string, unknown>;
      for (const key of ["children", "leftChildren", "rightChildren"] as const) {
        const nested = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : [];
        const found = findFirstBlock(nested, predicate);
        if (found) return found;
      }
    }

    if (block.type === "columns") {
      const columns = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as any[]) : [];
      for (const column of columns) {
        const nested = Array.isArray(column?.children) ? (column.children as CreditFunnelBlock[]) : [];
        const found = findFirstBlock(nested, predicate);
        if (found) return found;
      }
    }
  }
  return null;
}

function findBlocks(items: CreditFunnelBlock[], predicate: (block: CreditFunnelBlock) => boolean, out: CreditFunnelBlock[] = []): CreditFunnelBlock[] {
  for (const block of items) {
    if (!block || typeof block !== "object") continue;
    if (predicate(block)) out.push(block);

    if (block.type === "section") {
      const props = (block.props || {}) as Record<string, unknown>;
      for (const key of ["children", "leftChildren", "rightChildren"] as const) {
        const nested = Array.isArray(props[key]) ? (props[key] as CreditFunnelBlock[]) : [];
        findBlocks(nested, predicate, out);
      }
    }

    if (block.type === "columns") {
      const columns = Array.isArray((block.props as any)?.columns) ? ((block.props as any).columns as any[]) : [];
      for (const column of columns) {
        const nested = Array.isArray(column?.children) ? (column.children as CreditFunnelBlock[]) : [];
        findBlocks(nested, predicate, out);
      }
    }
  }
  return out;
}

function humanize(value: string) {
  return String(value || "")
    .replace(/^#/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenize(value: string) {
  return humanize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function blockAnchorId(block: CreditFunnelBlock | null | undefined) {
  if (!block || block.type !== "section") return "";
  return typeof block.props?.anchorId === "string" ? block.props.anchorId.trim() : "";
}

function sectionHeadingText(block: Extract<CreditFunnelBlock, { type: "section" }> | null | undefined) {
  if (!block) return "";
  const heading = findFirstBlock([block], (candidate) => candidate.type === "heading") as Extract<CreditFunnelBlock, { type: "heading" }> | null;
  return typeof heading?.props?.text === "string" ? heading.props.text.trim() : "";
}

function sectionNeedle(block: Extract<CreditFunnelBlock, { type: "section" }> | null | undefined) {
  return [blockAnchorId(block), sectionHeadingText(block)].filter(Boolean).map(humanize).join(" ");
}

function findSectionByAnchor(rootBlocks: CreditFunnelBlock[], anchorId: string) {
  const normalizedAnchor = humanize(anchorId);
  return rootBlocks.find((block) => block.type === "section" && humanize(blockAnchorId(block)) === normalizedAnchor) as Extract<CreditFunnelBlock, { type: "section" }> | undefined;
}

function findSectionByNeedle(rootBlocks: CreditFunnelBlock[], needle: string) {
  const tokens = tokenize(needle);
  if (!tokens.length) return null;
  const sections = rootBlocks.filter((block) => block.type === "section") as Extract<CreditFunnelBlock, { type: "section" }>[];
  for (const section of sections) {
    const haystack = sectionNeedle(section);
    if (!haystack) continue;
    if (tokens.every((token) => haystack.includes(token))) return section;
  }
  for (const section of sections) {
    const haystack = sectionNeedle(section);
    if (!haystack) continue;
    if (tokens.some((token) => haystack.includes(token))) return section;
  }
  return null;
}

function moveText(move: SourceActionPlanMove) {
  return [move.key, move.target, move.change, move.why, move.selectorHint || "", ...(Array.isArray(move.diff) ? move.diff : [])].join(" ").toLowerCase();
}

function extractQuotedRewrite(move: SourceActionPlanMove) {
  const raw = [move.change, move.why, ...(Array.isArray(move.diff) ? move.diff : [])].join(" ");
  const fromToMatch = raw.match(/from ["']([^"']+)["'] to ["']([^"']+)["']/i);
  if (fromToMatch) {
    return {
      fromText: String(fromToMatch[1] || "").trim(),
      toText: String(fromToMatch[2] || "").trim(),
    };
  }
  const toOnlyMatch = raw.match(/to ["']([^"']+)["']/i);
  if (!toOnlyMatch) return null;
  return {
    fromText: "",
    toText: String(toOnlyMatch[1] || "").trim(),
  };
}

function hasMoveSignal(move: SourceActionPlanMove, pattern: RegExp) {
  return pattern.test(moveText(move));
}

function shouldAutoApplyMove(move: SourceActionPlanMove) {
  if (move.confidence === "low") return false;
  if (move.executionMode === "bounded-edit") return true;
  if (move.confidence === "high") return true;
  return hasMoveSignal(move, /background|surface|contrast|headline|body\/?support|cta|button|proof|testimonial|metric|calendar|booking|schedule/i);
}

function mergeStylePatch(store: Map<string, Partial<BlockStyle>>, blockId: string, patch: Partial<BlockStyle>) {
  if (!blockId || !Object.keys(patch).length) return;
  store.set(blockId, { ...(store.get(blockId) || {}), ...patch });
}

function mergeButtonPatch(store: Map<string, Extract<FunnelPageMutation, { type: "setButton" }>>, blockId: string, patch: Partial<Extract<FunnelPageMutation, { type: "setButton" }>>) {
  if (!blockId || !Object.keys(patch).length) return;
  const current = store.get(blockId) || { type: "setButton", blockId };
  store.set(blockId, { ...current, ...patch, type: "setButton", blockId });
}

function mergeSectionLayoutPatch(store: Map<string, Extract<FunnelPageMutation, { type: "setSectionLayout" }>>, blockId: string, patch: Partial<Extract<FunnelPageMutation, { type: "setSectionLayout" }>>) {
  if (!blockId || !Object.keys(patch).length) return;
  const current = store.get(blockId) || { type: "setSectionLayout", blockId, layout: "one" as const };
  store.set(blockId, { ...current, ...patch, type: "setSectionLayout", blockId });
}

function pickTargetSection(rootBlocks: CreditFunnelBlock[], move: SourceActionPlanMove, fallback: Extract<CreditFunnelBlock, { type: "section" }> | undefined) {
  const selectorHint = String(move.selectorHint || "").trim();
  if (selectorHint.startsWith("#")) {
    const selectorMatch = findSectionByAnchor(rootBlocks, selectorHint.slice(1));
    if (selectorMatch) return selectorMatch;
  }

  if (hasMoveSignal(move, /top page headline|top headline|main headline|first headline|page headline at the top|opening headline|hero heading|hero headline|first screen headline/i)) {
    return fallback || null;
  }

  const directMatch = findSectionByNeedle(rootBlocks, `${move.target} ${move.key}`);
  if (directMatch) return directMatch;

  if (hasMoveSignal(move, /hero|opening|first screen|first serious ask/i)) return fallback || directMatch || null;
  if (hasMoveSignal(move, /cta|action|button|handoff|book|schedule/i)) {
    const ctaSection = (rootBlocks.find((block) => block.type === "section" && /cta|book|schedule|calendar/.test(sectionNeedle(block as Extract<CreditFunnelBlock, { type: "section" }>)))
      || rootBlocks.find((block) => block.type === "section" && Boolean(findFirstBlock([block], (candidate) => candidate.type === "button")))) as Extract<CreditFunnelBlock, { type: "section" }> | undefined;
    if (ctaSection) return ctaSection;
  }
  if (hasMoveSignal(move, /proof|testimonial|review|metric|credibility|authority/i)) {
    const proofSection = rootBlocks.find((block) => block.type === "section" && /proof|testimonial|review|credibility/.test(sectionNeedle(block as Extract<CreditFunnelBlock, { type: "section" }>))) as Extract<CreditFunnelBlock, { type: "section" }> | undefined;
    if (proofSection) return proofSection;
  }
  return fallback || null;
}

function buildLegacyHeuristicMutations(rootBlocks: CreditFunnelBlock[], plan: SourceActionPlan): FunnelPageMutation[] {
  const firstSection = rootBlocks.find((block) => block.type === "section") as Extract<CreditFunnelBlock, { type: "section" }> | undefined;
  const secondSection = rootBlocks.filter((block) => block.type === "section")[1] as Extract<CreditFunnelBlock, { type: "section" }> | undefined;
  const firstHeading = findFirstBlock(firstSection ? [firstSection] : rootBlocks, (block) => block.type === "heading") as Extract<CreditFunnelBlock, { type: "heading" }> | null;
  const firstParagraph = findFirstBlock(firstSection ? [firstSection] : rootBlocks, (block) => block.type === "paragraph") as Extract<CreditFunnelBlock, { type: "paragraph" }> | null;
  const firstButton = findFirstBlock(firstSection ? [firstSection] : rootBlocks, (block) => block.type === "button") as Extract<CreditFunnelBlock, { type: "button" }> | null;
  const proofRoot = rootBlocks.find((block) => block.type === "testimonialGrid" || block.type === "syncedReviews") || null;
  const calendarRoot = rootBlocks.find((block) => block.type === "calendarEmbed") || null;

  const wantsHeroWork = hasSignal(plan, /hero|opening|first screen|first serious ask/i);
  const wantsProofWork = hasSignal(plan, /proof|trust|testimonial|review|credibility|authority/i);
  const wantsCtaWork = hasSignal(plan, /cta|action|button|convert|handoff/i);
  const wantsBookingWork = hasSignal(plan, /booking|calendar|schedule|handoff/i);
  const wantsRhythmWork = hasSignal(plan, /section|cadence|rhythm|flow|sequence/i);
  const wantsLightSurfaceWork = hasSignal(plan, /background|surface|palette|color|tone|light|lighter|white|bright|brighter|clean|cleaner|airy|airier/i);
  const wantsContrastWork = wantsLightSurfaceWork || hasSignal(plan, /contrast|readability|legible|clarity/i);

  const mutations: FunnelPageMutation[] = [];

  if (firstSection && proofRoot && (wantsHeroWork || wantsProofWork) && firstSection.props.layout !== "two") {
    mutations.push({ type: "setSectionLayout", blockId: firstSection.id, layout: "two", gapPx: 32, stackOnMobile: true });
  }

  const firstSectionStyle: Record<string, string | number> = {};
  if (wantsHeroWork) {
    firstSectionStyle.paddingPx = 32;
    firstSectionStyle.borderRadiusPx = 24;
  }
  if (wantsLightSurfaceWork) {
    firstSectionStyle.backgroundColor = "#ffffff";
  }

  if (firstSection && Object.keys(firstSectionStyle).length) {
    mutations.push({ type: "setStyle", blockId: firstSection.id, style: firstSectionStyle });
  }

  const firstHeadingStyle: Record<string, string | number> = {};
  if (wantsHeroWork) {
    firstHeadingStyle.maxWidthPx = 520;
    firstHeadingStyle.marginBottomPx = 12;
  }
  if (wantsContrastWork) {
    firstHeadingStyle.textColor = "#0f172a";
  }

  if (firstHeading && Object.keys(firstHeadingStyle).length) {
    mutations.push({ type: "setStyle", blockId: firstHeading.id, style: firstHeadingStyle });
  }

  const firstParagraphStyle: Record<string, string | number> = {};
  if (wantsHeroWork || wantsCtaWork) {
    firstParagraphStyle.maxWidthPx = 560;
    firstParagraphStyle.marginBottomPx = 18;
  }
  if (wantsContrastWork) {
    firstParagraphStyle.textColor = "#475569";
  }

  if (firstParagraph && Object.keys(firstParagraphStyle).length) {
    mutations.push({ type: "setStyle", blockId: firstParagraph.id, style: firstParagraphStyle });
  }

  if (firstButton && wantsCtaWork) {
    mutations.push({ type: "setButton", blockId: firstButton.id, variant: "primary" });
  }

  if (proofRoot && firstSection && wantsProofWork) {
    mutations.push({ type: "moveBlock", blockId: proofRoot.id, position: { placement: "end", parentBlockId: firstSection.id, slot: "rightChildren" } });
  }

  if (calendarRoot && firstSection && wantsBookingWork) {
    mutations.push({ type: "moveBlock", blockId: calendarRoot.id, position: { placement: "after", anchorBlockId: firstSection.id } });
  }

  const secondSectionStyle: Record<string, string | number> = {};
  if (wantsRhythmWork || wantsLightSurfaceWork) {
    secondSectionStyle.backgroundColor = "#f8fafc";
  }
  if (wantsRhythmWork) {
    secondSectionStyle.paddingPx = 28;
    secondSectionStyle.borderRadiusPx = 24;
  }

  if (secondSection && Object.keys(secondSectionStyle).length) {
    mutations.push({ type: "setStyle", blockId: secondSection.id, style: secondSectionStyle });
  }

  return mutations;
}

function hasSignal(plan: SourceActionPlan, pattern: RegExp) {
  const blob = [
    plan.summary,
    ...plan.moves.map((move) => `${move.key} ${move.target} ${move.change} ${move.why} ${move.selectorHint || ""}`),
  ].join(" ");
  return pattern.test(blob);
}

function dedupeMutations(mutations: FunnelPageMutation[]) {
  return mutations.filter((mutation, index, items) => {
    const key = JSON.stringify(mutation);
    return items.findIndex((candidate) => JSON.stringify(candidate) === key) === index;
  });
}

export function deriveFunnelPageMutationsFromSourceActionPlan(blocks: CreditFunnelBlock[], plan: SourceActionPlan | null): FunnelPageMutation[] {
  if (!plan || !Array.isArray(blocks) || !blocks.length) return [];

  const rootBlocks = blocks.filter((block) => block && typeof block === "object");
  const firstSection = rootBlocks.find((block) => block.type === "section") as Extract<CreditFunnelBlock, { type: "section" }> | undefined;
  const secondSection = rootBlocks.filter((block) => block.type === "section")[1] as Extract<CreditFunnelBlock, { type: "section" }> | undefined;
  const proofRoot = rootBlocks.find((block) => block.type === "testimonialGrid" || block.type === "syncedReviews") || null;
  const calendarRoot = rootBlocks.find((block) => block.type === "calendarEmbed") || null;

  const autoMoves = plan.moves.filter(shouldAutoApplyMove);
  if (!autoMoves.length) return dedupeMutations(buildLegacyHeuristicMutations(rootBlocks, plan));

  const styleByBlockId = new Map<string, Partial<BlockStyle>>();
  const buttonById = new Map<string, Extract<FunnelPageMutation, { type: "setButton" }>>();
  const layoutByBlockId = new Map<string, Extract<FunnelPageMutation, { type: "setSectionLayout" }>>();
  const moveMutations: FunnelPageMutation[] = [];

  for (const move of autoMoves) {
    const targetSection = pickTargetSection(rootBlocks, move, firstSection);
    const targetHeading = targetSection
      ? findFirstBlock([targetSection], (block) => block.type === "heading") as Extract<CreditFunnelBlock, { type: "heading" }> | null
      : null;
    const targetParagraph = targetSection
      ? findFirstBlock([targetSection], (block) => block.type === "paragraph") as Extract<CreditFunnelBlock, { type: "paragraph" }> | null
      : null;
    const targetButtons = targetSection
      ? findBlocks([targetSection], (block) => block.type === "button") as Array<Extract<CreditFunnelBlock, { type: "button" }>>
      : [];
    const targetButton = targetButtons[0] || null;

    const wantsHeroWork = hasMoveSignal(move, /hero|opening|first screen|first serious ask/i);
    const wantsProofWork = hasMoveSignal(move, /proof|trust|testimonial|review|credibility|authority|metric|portrait|logo cloud|iconography/i);
    const wantsCtaWork = hasMoveSignal(move, /cta|action|button|convert|handoff|book|schedule/i);
    const wantsBookingWork = hasMoveSignal(move, /booking|calendar|schedule|handoff/i);
    const wantsRhythmWork = hasMoveSignal(move, /section|cadence|rhythm|flow|sequence/i);
    const wantsLightSurfaceWork = hasMoveSignal(move, /background|surface|palette|color|tone|light|lighter|white|off-white|bright|brighter|clean|cleaner|airy|airier/i);
    const wantsContrastWork = wantsLightSurfaceWork || hasMoveSignal(move, /contrast|readability|legible|clarity|dark ink|mid-gray|low-contrast/i);
    const wantsLayeredSurface = hasMoveSignal(move, /layered surface|depth|shadow|soft shadow|radius|rounded|border|panel|card/i);
    const wantsPrimaryButton = hasMoveSignal(move, /filled primary button|primary button|designed conversion object|distinct radius|cta styling/i);
    const allowStructuralMoves = move.executionMode === "model-led" && move.confidence === "high";
    const allowAdjacentSurfaceWork = move.executionMode === "model-led" && move.confidence !== "low";
    const directRewrite = extractQuotedRewrite(move);

    if (targetHeading && directRewrite?.toText && hasMoveSignal(move, /headline|h1|hero heading|page headline/i)) {
      moveMutations.push({
        type: "setText",
        blockId: targetHeading.id,
        text: directRewrite.toText,
      });
      continue;
    }

    if (targetSection) {
      const sectionStyle: Partial<BlockStyle> = {};
      if (wantsHeroWork || wantsLayeredSurface) {
        sectionStyle.paddingPx = move.confidence === "high" ? 32 : 28;
        sectionStyle.borderRadiusPx = wantsLayeredSurface ? 24 : 20;
      }
      if (wantsLightSurfaceWork) {
        sectionStyle.backgroundColor = hasMoveSignal(move, /off-white|warm off-white|secondary surface band/i) ? "#f8fafc" : "#ffffff";
      }
      if (wantsLayeredSurface) {
        sectionStyle.borderColor = "#e2e8f0";
        sectionStyle.borderWidthPx = 1;
      }
      mergeStylePatch(styleByBlockId, targetSection.id, sectionStyle);
    }

    if (targetHeading) {
      const headingStyle: Partial<BlockStyle> = {};
      if (wantsHeroWork) {
        headingStyle.maxWidthPx = 520;
        headingStyle.marginBottomPx = 12;
      }
      if (wantsContrastWork) {
        headingStyle.textColor = "#0f172a";
      }
      mergeStylePatch(styleByBlockId, targetHeading.id, headingStyle);
    }

    if (targetParagraph) {
      const paragraphStyle: Partial<BlockStyle> = {};
      if (wantsHeroWork || wantsCtaWork) {
        paragraphStyle.maxWidthPx = 560;
        paragraphStyle.marginBottomPx = 18;
      }
      if (wantsContrastWork) {
        paragraphStyle.textColor = "#475569";
      }
      mergeStylePatch(styleByBlockId, targetParagraph.id, paragraphStyle);
    }

    if (targetButton && (wantsCtaWork || wantsPrimaryButton)) {
      mergeButtonPatch(buttonById, targetButton.id, { variant: "primary" });
    }

    if (targetSection && proofRoot && wantsProofWork && allowStructuralMoves && proofRoot.id !== targetSection.id) {
      moveMutations.push({
        type: "moveBlock",
        blockId: proofRoot.id,
        position: { placement: "end", parentBlockId: targetSection.id, slot: targetSection.props.layout === "two" ? "rightChildren" : "children" },
      });
      mergeSectionLayoutPatch(layoutByBlockId, targetSection.id, { layout: "two", gapPx: 32, stackOnMobile: true });
    }

    if (targetSection && calendarRoot && wantsBookingWork && allowStructuralMoves) {
      moveMutations.push({
        type: "moveBlock",
        blockId: calendarRoot.id,
        position: { placement: "after", anchorBlockId: targetSection.id },
      });
    }

    if (secondSection && targetSection && secondSection.id !== targetSection.id && allowAdjacentSurfaceWork && (wantsRhythmWork || wantsLightSurfaceWork)) {
      const secondSectionStyle: Partial<BlockStyle> = {};
      if (wantsRhythmWork) {
        secondSectionStyle.paddingPx = 28;
        secondSectionStyle.borderRadiusPx = 24;
      }
      if (wantsLightSurfaceWork) {
        secondSectionStyle.backgroundColor = "#f8fafc";
      }
      mergeStylePatch(styleByBlockId, secondSection.id, secondSectionStyle);
    }
  }

  const derivedMutations: FunnelPageMutation[] = [
    ...Array.from(layoutByBlockId.values()),
    ...Array.from(styleByBlockId.entries()).map(([blockId, style]) => ({ type: "setStyle" as const, blockId, style })),
    ...Array.from(buttonById.values()),
    ...moveMutations,
  ];

  if (!derivedMutations.length) return dedupeMutations(buildLegacyHeuristicMutations(rootBlocks, plan));

  return dedupeMutations(derivedMutations);
}