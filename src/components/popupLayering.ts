// Must sit above editor canvases and sticky headers throughout the portal.
export const BASE_POPUP_Z_INDEX = 2000;
export const OVERLAY_POPUP_Z_INDEX = 130060;

function readNumericZIndex(node: HTMLElement) {
  const raw = globalThis.getComputedStyle(node).zIndex;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasOverlayAncestor(node: HTMLElement | null) {
  let current = node?.parentElement || null;
  while (current) {
    if (
      current.getAttribute("aria-modal") === "true" ||
      current.getAttribute("role") === "dialog" ||
      current.dataset.overlayRoot === "true"
    ) {
      return true;
    }
    if (
      current.classList.contains("fixed") &&
      current.classList.contains("inset-0") &&
      Array.from(current.classList).some((token) => token.startsWith("z-"))
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function overlayZIndexForAnchor(node: HTMLElement | null) {
  let current = node?.parentElement || null;
  let maxZIndex: number | null = null;
  while (current) {
    const isOverlayLike =
      current.getAttribute("aria-modal") === "true" ||
      current.getAttribute("role") === "dialog" ||
      current.dataset.overlayRoot === "true" ||
      (current.classList.contains("fixed") &&
        current.classList.contains("inset-0") &&
        Array.from(current.classList).some((token) => token.startsWith("z-")));
    if (isOverlayLike) {
      const zIndex = readNumericZIndex(current);
      if (zIndex != null) {
        maxZIndex = maxZIndex == null ? zIndex : Math.max(maxZIndex, zIndex);
      }
    }
    current = current.parentElement;
  }
  return maxZIndex;
}

export function popupZIndexForAnchor(node: HTMLElement | null) {
  const overlayZIndex = overlayZIndexForAnchor(node);
  if (overlayZIndex != null) return overlayZIndex + 20;
  return hasOverlayAncestor(node) ? OVERLAY_POPUP_Z_INDEX : BASE_POPUP_Z_INDEX;
}