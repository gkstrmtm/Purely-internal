type PublishingTargetPlatform = "instagram_post" | "instagram_story" | "facebook_post" | "youtube_video" | "manual";

export type PublishingEducationTone = "ready" | "setup" | "soon";

export type PublishingEducationSection = {
  key: string;
  title: string;
  tone: PublishingEducationTone;
  items: string[];
};

export type PublishingEducationNote = {
  title: string;
  detail: string;
};

export type PublishingEducationModel = {
  sections: PublishingEducationSection[];
  platformNote: PublishingEducationNote;
  automaticPostingIntro: string;
  automaticPostingSteps: string[];
  blockedIntro: string;
  blockedReasons: string[];
};

export type ProviderEducationCard = {
  key: string;
  title: string;
  detail: string;
};

function normalizeTargetPlatform(targetPlatform: string | null | undefined): PublishingTargetPlatform {
  switch (targetPlatform) {
    case "instagram_post":
    case "instagram_story":
    case "facebook_post":
    case "youtube_video":
      return targetPlatform;
    default:
      return "manual";
  }
}

export function publishingEducationToneClasses(tone: PublishingEducationTone) {
  switch (tone) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "setup":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "soon":
      return "border-sky-200 bg-sky-50 text-sky-900";
  }
}

export function buildPublishingEducationModel(args: {
  targetPlatform?: string | null;
  distributionProvider?: string | null;
  isCreditWorkspace: boolean;
  metaSetupMessage?: string | null;
}): PublishingEducationModel {
  const targetPlatform = normalizeTargetPlatform(args.targetPlatform);
  const liveLinkLabel = args.isCreditWorkspace ? "consultation, intake, or report link" : "booking or follow-up link";

  const sections: PublishingEducationSection[] = [
    {
      key: "works-now",
      title: "What works now",
      tone: "ready",
      items: [
        "Uploading media works now.",
        "Caption and post preparation work now.",
        "Manual posting works now.",
        "Tracking a manually posted URL works now.",
        "Local planning and scheduling inside Purely work now.",
      ],
    },
    {
      key: "needs-setup",
      title: "What needs setup",
      tone: "setup",
      items: [
        "Automatic provider posting needs a connected provider account, destination selection, permissions, token validity, and provider approval before it should run.",
        "Instagram and Facebook automatic posting require Meta account sync, the right Page or Instagram selection, valid permissions, valid tokens, and approved app posture.",
        `Queue or schedule only after the provider shows ready. A planned post in Purely is not live, and Purely does not detect manual posts automatically.`,
      ],
    },
    {
      key: "coming-soon",
      title: "Coming soon",
      tone: "soon",
      items: [
        "Instagram story automatic posting stays provider-dependent until the provider lane is actually live.",
        "YouTube upload and scheduling stay manual-only until Google OAuth, upload scopes, quota handling, and approval are implemented.",
      ],
    },
  ];

  const platformNote = (() => {
    switch (targetPlatform) {
      case "instagram_post":
        return {
          title: "Instagram feed posts",
          detail: "Caption links are not reliable clickable CTAs. Use link in bio, DM, the profile button, or keep a reference link here for planning.",
        };
      case "instagram_story":
        return {
          title: "Instagram stories",
          detail: "Use this lane for story planning now. Automatic story posting should stay provider-dependent until the provider path is actually ready.",
        };
      case "facebook_post":
        return {
          title: "Facebook posts",
          detail: `Facebook can use a direct ${liveLinkLabel} more naturally, so the link can be part of the post instead of only a planning note.`,
        };
      case "youtube_video":
        return {
          title: "YouTube videos",
          detail: "Plan the title, description, and upload notes here now. Uploading, publishing, and scheduling stay manual until the YouTube provider lane exists for real.",
        };
      default:
        return {
          title: "Manual / other posts",
          detail: "Copy the caption, post in the real channel yourself, then paste the live URL back into Purely. Purely stores the record, but does not detect manual posts automatically.",
        };
    }
  })();

  const automaticPostingIntro = "Automatic posting only belongs in the provider lane after setup is complete and the provider is truly ready.";
  const automaticPostingSteps = [
    "Connect the provider account you want Purely to use.",
    "Choose the destination account, Page, Instagram account, or channel.",
    "Confirm permissions and token validity before you trust the provider lane.",
    "Confirm provider approval or app review where the platform requires it.",
    "Queue or schedule only after Purely shows the provider as ready.",
  ];

  const blockedIntro = (() => {
    if (args.distributionProvider === "manual") {
      return "Purely is not trying to auto-post this item because manual posting is selected, and manual posting is the working path right now.";
    }
    if (targetPlatform === "youtube_video" || args.distributionProvider === "future_youtube") {
      return "Purely can prepare the YouTube post here, but it should not imply live upload or scheduling yet.";
    }
    if (targetPlatform === "instagram_story") {
      return "Stories stay in a provider-dependent lane. Planning is available now, but live story publishing should stay blocked until the provider path is actually ready.";
    }
    return "A connected-looking provider surface is not enough on its own. Purely should only auto-post after the whole provider path is ready.";
  })();

  const blockedReasons = (() => {
    if (args.distributionProvider === "manual") {
      return [
        "Open or download the asset, post it in the real channel, then save the live URL back here.",
        "Purely stores the manual post record you enter. It does not discover manual posts on its own.",
      ];
    }
    if (targetPlatform === "youtube_video" || args.distributionProvider === "future_youtube") {
      return [
        "YouTube stays title-and-description planning now, upload and publish later.",
        "Direct YouTube upload needs Google OAuth, upload scopes, quota handling, and approval before it should appear live in Purely.",
      ];
    }
    const reasons = [
      args.metaSetupMessage || "Purely does not have a fully ready Meta publishing path for this workspace yet.",
      "Instagram and Facebook automatic posting require Meta account sync, destination selection, permissions, valid tokens, and approved app posture.",
    ];
    if (targetPlatform === "instagram_post") {
      reasons.push("Instagram feed posts should still use link in bio, DM, the profile button, or a saved reference link instead of promising a clickable caption CTA.");
    } else if (targetPlatform === "facebook_post") {
      reasons.push("Facebook can still use a direct link more naturally when you post manually while the provider lane finishes setup.");
    } else if (targetPlatform === "instagram_story") {
      reasons.push("Instagram story publishing should stay provider-dependent until the provider path is actually live.");
    }
    reasons.push("Use manual posting now, then save the live URL back into Purely if you want the posted result recorded here.");
    return reasons;
  })();

  return {
    sections,
    platformNote,
    automaticPostingIntro,
    automaticPostingSteps,
    blockedIntro,
    blockedReasons,
  };
}

export function buildProviderEducationCards(args: { isCreditWorkspace: boolean }): ProviderEducationCard[] {
  const directLinkLabel = args.isCreditWorkspace ? "consultation or report link" : "booking or follow-up link";

  return [
    {
      key: "manual",
      title: "Manual posting is live now",
      detail: "Upload media, prepare the caption, post it in the real channel, then paste the live URL back into Purely. Purely does not detect manual posts automatically.",
    },
    {
      key: "meta",
      title: "Meta, Instagram, and Facebook need setup",
      detail: "Automatic posting needs Meta account sync, destination selection, permissions, token validity, and approved app posture before it should run.",
    },
    {
      key: "platform-clarity",
      title: "Instagram and Facebook behave differently",
      detail: `Instagram feed captions should use link in bio, DM, or the profile button. Facebook can carry a direct ${directLinkLabel} more naturally.`,
    },
    {
      key: "youtube",
      title: "YouTube stays planning-first",
      detail: "Plan title, description, and upload notes now. Upload, scheduling, and live publishing stay manual until Google OAuth, scopes, quota, and approval are implemented.",
    },
  ];
}