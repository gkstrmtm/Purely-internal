import React, { useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";

import { getPortalBearerToken } from "../../auth/portalToken";
import { portalBaseUrl } from "../../config/app";

function toPathWithEmbed(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p.includes("embed=1") || p.includes("pa_embed=1")) return p;
  return p.includes("?") ? `${p}&embed=1` : `${p}?embed=1`;
}

export function PortalWebSurface({ path }: { path: string }) {
  const embeddedPath = useMemo(() => toPathWithEmbed(path), [path]);

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        {/* eslint-disable-next-line jsx-a11y/iframe-has-title */}
        <iframe
          src={embeddedPath}
          style={{ border: 0, width: "100%", height: "100%" }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
        />
      </View>
    );
  }

  return <NativePortalWebView path={embeddedPath} />;
}

function NativePortalWebView({ path }: { path: string }) {
  const tokenPromiseRef = useRef<Promise<string | null> | null>(null);
  if (!tokenPromiseRef.current) tokenPromiseRef.current = getPortalBearerToken();

  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      const t = await tokenPromiseRef.current;
      if (!mounted) return;
      setToken(t);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const absoluteNext = useMemo(() => {
    const nextPath = path.startsWith("/") ? path : `/${path}`;
    return `${portalBaseUrl}${nextPath}`;
  }, [path]);

  const sessionUrl = useMemo(() => {
    const nextPath = path.startsWith("/") ? path : `/${path}`;
    const encoded = encodeURIComponent(nextPath);
    return `${portalBaseUrl}/api/portal/auth/webview-session?next=${encoded}`;
  }, [path]);

  const source = useMemo(() => {
    if (!token) return { uri: absoluteNext };
    return {
      uri: sessionUrl,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }, [absoluteNext, sessionUrl, token]);

  return (
    <WebView
      source={source}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={["*"]}
      style={{ flex: 1, backgroundColor: "transparent" }}
    />
  );
}
