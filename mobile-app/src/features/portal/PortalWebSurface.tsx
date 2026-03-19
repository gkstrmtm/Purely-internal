import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
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
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    if (!isWeb) return;
    if (typeof window === "undefined") return;

    try {
      const current =
        window.location.pathname + window.location.search + window.location.hash;
      if (current !== embeddedPath) window.location.assign(embeddedPath);
    } catch {
      // ignore
    }
  }, [embeddedPath, isWeb]);

  if (isWeb) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
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
