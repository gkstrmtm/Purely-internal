// Must sit above editor canvases and sticky headers throughout the portal.
export const BASE_POPUP_Z_INDEX = 2000;
export const OVERLAY_POPUP_Z_INDEX = 130060;

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

export function popupZIndexForAnchor(node: HTMLElement | null) {
  return hasOverlayAncestor(node) ? OVERLAY_POPUP_Z_INDEX : BASE_POPUP_Z_INDEX;
}