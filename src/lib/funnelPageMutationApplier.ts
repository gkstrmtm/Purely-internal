import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import type { FunnelPageInsertPosition, FunnelPageMutation } from "@/lib/funnelPageMutations";

type SectionBlock = Extract<CreditFunnelBlock, { type: "section" }>;
type ColumnsBlock = Extract<CreditFunnelBlock, { type: "columns" }>;

type BlockContainerRef =
  | { kind: "root"; blocks: CreditFunnelBlock[] }
  | { kind: "section"; block: SectionBlock; slot: "children" | "leftChildren" | "rightChildren"; blocks: CreditFunnelBlock[] }
  | { kind: "column"; block: ColumnsBlock; columnIndex: number; blocks: CreditFunnelBlock[] };

type BlockLocation = {
  block: CreditFunnelBlock;
  index: number;
  container: BlockContainerRef;
};

export type FunnelPageMutationApplyResult = {
  blocks: CreditFunnelBlock[];
  appliedMutations: FunnelPageMutation[];
  warnings: string[];
};

function cloneBlocks(blocks: CreditFunnelBlock[]): CreditFunnelBlock[] {
  return JSON.parse(JSON.stringify(blocks || [])) as CreditFunnelBlock[];
}

function getSectionChildren(block: SectionBlock, slot: "children" | "leftChildren" | "rightChildren"): CreditFunnelBlock[] {
  const next = Array.isArray(block.props?.[slot]) ? ([...(block.props?.[slot] as CreditFunnelBlock[])] as CreditFunnelBlock[]) : [];
  block.props = { ...block.props, [slot]: next };
  return next;
}

function getColumnChildren(block: ColumnsBlock, columnIndex: number): CreditFunnelBlock[] {
  const columns = Array.isArray(block.props?.columns) ? [...block.props.columns] : [];
  const row = columns[columnIndex] && typeof columns[columnIndex] === "object" ? { ...columns[columnIndex] } : { markdown: "", children: [] };
  const children = Array.isArray(row.children) ? [...row.children] : [];
  row.children = children;
  columns[columnIndex] = row;
  block.props = { ...block.props, columns };
  return children;
}

function findBlockLocation(blocks: CreditFunnelBlock[], blockId: string): BlockLocation | null {
  const walk = (items: CreditFunnelBlock[], container: BlockContainerRef): BlockLocation | null => {
    for (let index = 0; index < items.length; index += 1) {
      const block = items[index];
      if (!block || typeof block !== "object") continue;
      if (block.id === blockId) return { block, index, container };

      if (block.type === "section") {
        for (const slot of ["children", "leftChildren", "rightChildren"] as const) {
          const nested = Array.isArray(block.props?.[slot]) ? (block.props[slot] as CreditFunnelBlock[]) : [];
          const found = walk(nested, { kind: "section", block, slot, blocks: nested });
          if (found) return found;
        }
      }

      if (block.type === "columns") {
        const cols = Array.isArray(block.props?.columns) ? block.props.columns : [];
        for (let columnIndex = 0; columnIndex < cols.length; columnIndex += 1) {
          const children = Array.isArray(cols[columnIndex]?.children) ? (cols[columnIndex]?.children as CreditFunnelBlock[]) : [];
          const found = walk(children, { kind: "column", block, columnIndex, blocks: children });
          if (found) return found;
        }
      }
    }

    return null;
  };

  return walk(blocks, { kind: "root", blocks });
}

function updateBlock(blocks: CreditFunnelBlock[], blockId: string, updater: (block: CreditFunnelBlock) => CreditFunnelBlock | null): boolean {
  const location = findBlockLocation(blocks, blockId);
  if (!location) return false;
  const next = updater(location.block);
  if (!next) return false;
  location.container.blocks[location.index] = next;
  return true;
}

function removeBlock(blocks: CreditFunnelBlock[], blockId: string): CreditFunnelBlock | null {
  const location = findBlockLocation(blocks, blockId);
  if (!location) return null;
  const [removed] = location.container.blocks.splice(location.index, 1);
  return removed || null;
}

function insertAtPosition(blocks: CreditFunnelBlock[], block: CreditFunnelBlock, position: FunnelPageInsertPosition): boolean {
  if (position.placement === "before" || position.placement === "after") {
    const anchor = findBlockLocation(blocks, position.anchorBlockId);
    if (!anchor) return false;
    const insertIndex = position.placement === "before" ? anchor.index : anchor.index + 1;
    anchor.container.blocks.splice(insertIndex, 0, block);
    return true;
  }

  const target = position as Extract<FunnelPageInsertPosition, { placement: "start" | "end" }>;

  if (!target.parentBlockId) {
    if (target.placement === "start") blocks.unshift(block);
    else blocks.push(block);
    return true;
  }

  const parent = findBlockLocation(blocks, target.parentBlockId);
  if (!parent) return false;

  if (parent.block.type === "section") {
    const slot = target.slot && target.slot !== "columnChildren" ? target.slot : parent.block.props.layout === "two" ? "leftChildren" : "children";
    const items = getSectionChildren(parent.block, slot);
    if (target.placement === "start") items.unshift(block);
    else items.push(block);
    return true;
  }

  if (parent.block.type === "columns") {
    const columnIndex = typeof target.columnIndex === "number" ? target.columnIndex : 0;
    const items = getColumnChildren(parent.block, columnIndex);
    if (target.placement === "start") items.unshift(block);
    else items.push(block);
    return true;
  }

  return false;
}

function applySingleMutation(blocks: CreditFunnelBlock[], mutation: FunnelPageMutation): { next: CreditFunnelBlock[]; applied: boolean; warning?: string } {
  const next = cloneBlocks(blocks);

  switch (mutation.type) {
    case "setText": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type === "heading" || block.type === "paragraph") {
          return {
            ...block,
            props: {
              ...block.props,
              text: mutation.text,
              ...(mutation.html !== undefined ? { html: mutation.html || undefined } : null),
            },
          } as CreditFunnelBlock;
        }

        if (
          block.type === "button" ||
          block.type === "formLink" ||
          block.type === "salesCheckoutButton" ||
          block.type === "addToCartButton" ||
          block.type === "cartButton"
        ) {
          return {
            ...block,
            props: {
              ...block.props,
              text: mutation.text,
            },
          } as CreditFunnelBlock;
        }

        return null;
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not set text for block ${mutation.blockId}.` };
    }
    case "setStyle": {
      const applied = updateBlock(next, mutation.blockId, (block) => ({
        ...block,
        props: {
          ...(block.props as any),
          style: {
            ...((block.props as any)?.style || {}),
            ...mutation.style,
          },
        },
      }));
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update style for block ${mutation.blockId}.` };
    }
    case "setSectionLayout": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "section") return null;
        const currentChildren = Array.isArray(block.props.children) ? [...block.props.children] : [];
        const currentLeft = Array.isArray(block.props.leftChildren) ? [...block.props.leftChildren] : [];
        const currentRight = Array.isArray(block.props.rightChildren) ? [...block.props.rightChildren] : [];
        if (mutation.layout === "two") {
          return {
            ...block,
            props: {
              ...block.props,
              layout: "two",
              leftChildren: currentLeft.length ? currentLeft : currentChildren,
              rightChildren: currentRight,
              children: [],
              ...(mutation.gapPx !== undefined ? { gapPx: mutation.gapPx } : null),
              ...(mutation.stackOnMobile !== undefined ? { stackOnMobile: mutation.stackOnMobile } : null),
            },
          };
        }
        return {
          ...block,
          props: {
            ...block.props,
            layout: "one",
            children: [...currentChildren, ...currentLeft, ...currentRight],
            leftChildren: [],
            rightChildren: [],
            ...(mutation.gapPx !== undefined ? { gapPx: mutation.gapPx } : null),
            ...(mutation.stackOnMobile !== undefined ? { stackOnMobile: mutation.stackOnMobile } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update section layout for block ${mutation.blockId}.` };
    }
    case "setColumnsLayout": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "columns") return null;
        return {
          ...block,
          props: {
            ...block.props,
            ...(mutation.gapPx !== undefined ? { gapPx: mutation.gapPx } : null),
            ...(mutation.stackOnMobile !== undefined ? { stackOnMobile: mutation.stackOnMobile } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update columns layout for block ${mutation.blockId}.` };
    }
    case "setButton": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "button") return null;
        return {
          ...block,
          props: {
            ...block.props,
            ...(mutation.text !== undefined ? { text: mutation.text } : null),
            ...(mutation.href !== undefined ? { href: mutation.href } : null),
            ...(mutation.variant !== undefined ? { variant: mutation.variant } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update button ${mutation.blockId}.` };
    }
    case "setImage": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "image") return null;
        return {
          ...block,
          props: {
            ...block.props,
            ...(mutation.src !== undefined ? { src: mutation.src } : null),
            ...(mutation.alt !== undefined ? { alt: mutation.alt } : null),
            ...(mutation.showFrame !== undefined ? { showFrame: mutation.showFrame } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update image ${mutation.blockId}.` };
    }
    case "setVideo": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "video") return null;
        return {
          ...block,
          props: {
            ...block.props,
            ...(mutation.src !== undefined ? { src: mutation.src } : null),
            ...(mutation.name !== undefined ? { name: mutation.name } : null),
            ...(mutation.posterUrl !== undefined ? { posterUrl: mutation.posterUrl } : null),
            ...(mutation.controls !== undefined ? { controls: mutation.controls, showControls: mutation.controls } : null),
            ...(mutation.autoplay !== undefined ? { autoplay: mutation.autoplay } : null),
            ...(mutation.loop !== undefined ? { loop: mutation.loop } : null),
            ...(mutation.muted !== undefined ? { muted: mutation.muted } : null),
            ...(mutation.aspectRatio !== undefined ? { aspectRatio: mutation.aspectRatio } : null),
            ...(mutation.fit !== undefined ? { fit: mutation.fit } : null),
            ...(mutation.showFrame !== undefined ? { showFrame: mutation.showFrame } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update video ${mutation.blockId}.` };
    }
    case "setForm": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type === "formLink") {
          return {
            ...block,
            props: {
              ...block.props,
              ...(mutation.formSlug !== undefined ? { formSlug: mutation.formSlug } : null),
              ...(mutation.text !== undefined ? { text: mutation.text } : null),
            },
          };
        }
        if (block.type === "formEmbed") {
          return {
            ...block,
            props: {
              ...block.props,
              ...(mutation.formSlug !== undefined ? { formSlug: mutation.formSlug } : null),
              ...(mutation.height !== undefined ? { height: mutation.height } : null),
            },
          };
        }
        return null;
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update form block ${mutation.blockId}.` };
    }
    case "setCalendar": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "calendarEmbed") return null;
        return {
          ...block,
          props: {
            ...block.props,
            ...(mutation.calendarId !== undefined ? { calendarId: mutation.calendarId } : null),
            ...(mutation.height !== undefined ? { height: mutation.height } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update calendar block ${mutation.blockId}.` };
    }
    case "setCommerce": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "salesCheckoutButton" && block.type !== "addToCartButton") {
          if (block.type === "cartButton") {
            return {
              ...block,
              props: {
                ...block.props,
                ...(mutation.text !== undefined ? { text: mutation.text } : null),
              },
            };
          }
          return null;
        }
        return {
          ...block,
          props: {
            ...block.props,
            ...(mutation.priceId !== undefined ? { priceId: mutation.priceId } : null),
            ...(mutation.quantity !== undefined ? { quantity: mutation.quantity } : null),
            ...(mutation.productName !== undefined ? { productName: mutation.productName } : null),
            ...(mutation.productDescription !== undefined ? { productDescription: mutation.productDescription } : null),
            ...(mutation.text !== undefined ? { text: mutation.text } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update commerce block ${mutation.blockId}.` };
    }
    case "setHeader": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "headerNav") return null;
        return {
          ...block,
          props: {
            ...block.props,
            ...(mutation.logoUrl !== undefined ? { logoUrl: mutation.logoUrl } : null),
            ...(mutation.logoAlt !== undefined ? { logoAlt: mutation.logoAlt } : null),
            ...(mutation.logoHref !== undefined ? { logoHref: mutation.logoHref } : null),
            ...(mutation.items !== undefined ? { items: mutation.items } : null),
            ...(mutation.sticky !== undefined ? { sticky: mutation.sticky } : null),
            ...(mutation.transparent !== undefined ? { transparent: mutation.transparent } : null),
            ...(mutation.mobileMode !== undefined ? { mobileMode: mutation.mobileMode } : null),
            ...(mutation.desktopMode !== undefined ? { desktopMode: mutation.desktopMode } : null),
            ...(mutation.size !== undefined ? { size: mutation.size } : null),
            ...(mutation.sizeScale !== undefined ? { sizeScale: mutation.sizeScale } : null),
            ...(mutation.mobileTrigger !== undefined ? { mobileTrigger: mutation.mobileTrigger } : null),
            ...(mutation.mobileTriggerLabel !== undefined ? { mobileTriggerLabel: mutation.mobileTriggerLabel } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update header block ${mutation.blockId}.` };
    }
    case "setCustomCode": {
      const applied = updateBlock(next, mutation.blockId, (block) => {
        if (block.type !== "customCode") return null;
        return {
          ...block,
          props: {
            ...block.props,
            ...(mutation.html !== undefined ? { html: mutation.html } : null),
            ...(mutation.css !== undefined ? { css: mutation.css } : null),
            ...(mutation.heightPx !== undefined ? { heightPx: mutation.heightPx } : null),
          },
        };
      });
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not update code island ${mutation.blockId}.` };
    }
    case "insertBlock": {
      const applied = insertAtPosition(next, mutation.block, mutation.position);
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: "Could not insert block at the requested position." };
    }
    case "deleteBlock": {
      const removed = removeBlock(next, mutation.blockId);
      return removed ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not delete block ${mutation.blockId}.` };
    }
    case "moveBlock": {
      const moved = removeBlock(next, mutation.blockId);
      if (!moved) return { next: blocks, applied: false, warning: `Could not move block ${mutation.blockId}.` };
      const applied = insertAtPosition(next, moved, mutation.position);
      return applied ? { next, applied: true } : { next: blocks, applied: false, warning: `Could not move block ${mutation.blockId} to the requested position.` };
    }
    default:
      return { next: blocks, applied: false, warning: "Unsupported mutation." };
  }
}

export function applyFunnelPageMutations(blocks: CreditFunnelBlock[], mutations: FunnelPageMutation[]): FunnelPageMutationApplyResult {
  let next = cloneBlocks(blocks || []);
  const appliedMutations: FunnelPageMutation[] = [];
  const warnings: string[] = [];

  for (const mutation of mutations) {
    const result = applySingleMutation(next, mutation);
    next = result.next;
    if (result.applied) appliedMutations.push(mutation);
    else if (result.warning) warnings.push(result.warning);
  }

  return {
    blocks: next,
    appliedMutations,
    warnings,
  };
}