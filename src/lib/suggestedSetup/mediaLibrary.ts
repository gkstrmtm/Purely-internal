import type { SuggestedSetupAction } from "@/lib/suggestedSetup/shared";
import { actionIdFromParts } from "@/lib/suggestedSetup/actionIds";

type StarterFolder = {
  name: string;
  color: string | null;
};

export function proposeMediaLibraryCreateStarterFolders(opts: {
  hasAnyRootFolders: boolean;
}): SuggestedSetupAction | null {
  if (opts.hasAnyRootFolders) return null;

  const folders: StarterFolder[] = [
    { name: "Brand", color: "#2563EB" },
    { name: "Templates", color: "#7C3AED" },
    { name: "Uploads", color: null },
  ];

  const payload = { version: 1, folders };

  return {
    id: actionIdFromParts({ kind: "mediaLibrary.createStarterFolders", serviceSlug: "media-library", signature: payload }),
    serviceSlug: "media-library",
    kind: "mediaLibrary.createStarterFolders",
    title: "Set up Media Library folders",
    description: "Creates a simple folder structure for brand assets and templates.",
    payload,
  };
}
