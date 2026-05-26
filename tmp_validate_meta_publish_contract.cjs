require("ts-node/register/transpile-only");

const {
  inspectMetaInstagramFeedPublishDryRun,
  META_INSTAGRAM_FEED_REQUIRED_SCOPES,
} = require("./src/lib/portalMetaPublishingContract.ts");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function runCase(name, snapshot, assertion) {
  const result = inspectMetaInstagramFeedPublishDryRun(snapshot);
  assertion(result);
  return {
    name,
    state: result.state,
    blockerCodes: result.blockers.map((entry) => entry.code),
    summary: result.summary,
  };
}

const baseSnapshot = {
  connection: {
    state: "connected",
    connectedAccountLabel: "Meta Owner",
    connectedMetaUserId: "123",
    hasAccessToken: true,
    accessTokenExpiresAtIso: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    grantedScopes: Array.from(META_INSTAGRAM_FEED_REQUIRED_SCOPES),
    permissionGaps: [],
  },
  profile: {
    distributionProvider: "instagram_business",
    targetPlatform: "instagram_post",
    captionDraft: "Caption",
    providerDestinationType: "instagram_business",
    providerDestinationId: "17841400000000000",
    providerDestinationLabel: "IG Professional",
    providerScheduledForIso: new Date().toISOString(),
  },
  asset: {
    mediaItemId: "media-1",
    fileName: "asset.jpg",
    mimeType: "image/jpeg",
    fileSize: 1024,
    resolvedPublicUrl: "https://example.com/asset.jpg",
    format: "jpeg",
    width: 1080,
    height: 1350,
    probeError: null,
  },
  livePublishApproved: false,
};

const cases = [
  runCase(
    "missing connection",
    {
      ...baseSnapshot,
      connection: {
        ...baseSnapshot.connection,
        state: "not_connected",
        hasAccessToken: false,
      },
    },
    (result) => {
      expect(result.state === "blocked", "missing connection should block");
      expect(result.blockers.some((entry) => entry.code === "meta_connection_missing"), "missing connection blocker not returned");
    },
  ),
  runCase(
    "missing destination",
    {
      ...baseSnapshot,
      profile: {
        ...baseSnapshot.profile,
        providerDestinationId: null,
      },
    },
    (result) => {
      expect(result.state === "blocked", "missing destination should block");
      expect(result.blockers.some((entry) => entry.code === "meta_destination_missing"), "missing destination blocker not returned");
    },
  ),
  runCase(
    "png asset blocked",
    {
      ...baseSnapshot,
      asset: {
        ...baseSnapshot.asset,
        fileName: "asset.png",
        mimeType: "image/png",
        format: "png",
      },
    },
    (result) => {
      expect(result.state === "blocked", "png asset should block");
      expect(result.blockers.some((entry) => entry.code === "meta_asset_format_unsupported"), "png blocker not returned");
    },
  ),
  runCase(
    "ready but live disabled",
    baseSnapshot,
    (result) => {
      expect(result.state === "ready_but_live_disabled", "valid dry-run contract should return ready-but-disabled");
      expect(result.blockers.some((entry) => entry.code === "meta_live_publish_disabled"), "ready-but-disabled blocker not returned");
    },
  ),
];

process.stdout.write(`${JSON.stringify({ ok: true, cases }, null, 2)}\n`);