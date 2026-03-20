import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "react-native";

import { portalLogoUrl } from "../../config/app";
import { PortalWebSurface } from "./PortalWebSurface";
import { getServicesCatalog, getServicesStatus, type ServicesCatalogGroup } from "./api";
import { MobileBillingScreen } from "./MobileBillingScreen";

type RootTab = "home" | "inbox" | "tasks" | "people" | "settings";

type ViewState =
  | { kind: "tab"; tab: RootTab }
  | { kind: "service"; slug: string; title: string };

const BRAND_MIST = "#f1f5f9";
const ZINC_200 = "#e4e4e7";
const ZINC_500 = "#71717a";
const ZINC_600 = "#52525b";
const ZINC_900 = "#18181b";
const BRAND_BLUE = "#1d4ed8";
const BRAND_PINK = "#fb7185";

const BOOK_A_CALL_URL = "https://purelyautomation.com/book-a-call";
const HELP_URL = "https://purelyautomation.com/portal/tutorials/getting-started?embed=1";

function openExternalUrl(url: string) {
  const next = String(url || "").trim();
  if (!next) return;
  if (Platform.OS === "web") {
    try {
      (window as any)?.open?.(next, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
    return;
  }

  void Linking.openURL(next).catch(() => null);
}

function accentColor(accent?: string) {
  const a = String(accent || "").toLowerCase();
  if (a === "blue") return BRAND_BLUE;
  if (a === "coral" || a === "pink" || a === "orange") return BRAND_PINK;
  return ZINC_900;
}

function iconForServiceSlug(slug: string): keyof typeof Ionicons.glyphMap {
  switch (slug) {
    case "inbox":
    case "outbox":
      return "mail-outline";
    case "tasks":
      return "checkbox-outline";
    case "people":
      return "people-outline";
    case "media-library":
      return "images-outline";
    case "booking":
      return "calendar-outline";
    case "review-requests":
      return "star-outline";
    case "newsletter":
      return "newspaper-outline";
    case "nurture-campaigns":
      return "send-outline";
    case "blogs":
      return "document-text-outline";
    case "automations":
      return "git-branch-outline";
    case "funnel-builder":
      return "shapes-outline";
    case "ai-receptionist":
    case "ai-outbound-calls":
      return "call-outline";
    case "lead-scraping":
      return "search-outline";
    case "missed-call-textback":
      return "chatbubble-ellipses-outline";
    case "follow-up":
      return "repeat-outline";
    default:
      return "apps-outline";
  }
}

function pathForView(view: ViewState): string {
  switch (view.kind) {
    case "tab": {
      switch (view.tab) {
        case "home":
          return "/portal/app";
        case "inbox":
          return "/portal/app/services/inbox";
        case "tasks":
          return "/portal/app/services/tasks";
        case "people":
          return "/portal/app/people";
        case "settings":
          return "/portal/app/profile";
        default:
          return "/portal/app";
      }
    }
    case "service":
      return `/portal/app/services/${encodeURIComponent(view.slug)}`;
    default:
      return "/portal/app";
  }
}

export function PortalAppShell({
  me,
  deepLinkPath,
  onDeepLinkHandled,
  onLogout,
}: {
  me: { email: string; name: string; role: string } | null;
  deepLinkPath?: string | null;
  onDeepLinkHandled?: () => void;
  onLogout: () => Promise<void>;
}) {
  const [view, setView] = useState<ViewState>({ kind: "tab", tab: "home" });
  const [settingsSection, setSettingsSection] = useState<"profile" | "billing">("profile");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catalog, setCatalog] = useState<ServicesCatalogGroup[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, { state: string; label: string }> | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const showChrome = !!me;

  const targetPath = useMemo(() => {
    if (view.kind === "tab" && view.tab === "settings") {
      return settingsSection === "billing" ? "/portal/app/billing" : "/portal/app/profile";
    }
    return pathForView(view);
  }, [settingsSection, view]);

  const drawerWidth = useMemo(() => {
    const w = Dimensions.get("window").width;
    const half = Math.round(w * 0.5);
    return Math.max(280, Math.min(360, half));
  }, []);

  const translateX = useRef(new Animated.Value(-drawerWidth)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: drawerOpen ? 0 : -drawerWidth,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, drawerWidth, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gesture) => {
        const dx = gesture.dx;
        const dy = gesture.dy;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx < 12) return false;
        if (absDy > absDx * 0.7) return false;

        const x = (evt.nativeEvent as any)?.pageX;
        if (drawerOpen) return true;
        return typeof x === "number" ? x <= 20 && dx > 0 : false;
      },
      onPanResponderMove: (_evt, gesture) => {
        const dx = gesture.dx;
        if (!drawerOpen && dx < 0) return;
        if (drawerOpen && dx > 0) return;

        const base = drawerOpen ? 0 : -drawerWidth;
        const next = Math.max(-drawerWidth, Math.min(0, base + dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const dx = gesture.dx;
        const shouldOpen = drawerOpen ? !(dx < -drawerWidth * 0.25) : dx > drawerWidth * 0.25;
        setDrawerOpen(shouldOpen);
      },
    }),
  ).current;

  async function loadCatalog() {
    setLoadingCatalog(true);
    try {
      const [cat, stat] = await Promise.all([getServicesCatalog(), getServicesStatus()]);
      if ((cat as any)?.ok === true) setCatalog((cat as any).groups || []);
      if ((stat as any)?.ok === true && (stat as any).statuses) setStatuses((stat as any).statuses);
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (!deepLinkPath) return;

    const p = deepLinkPath;
    setDrawerOpen(false);

    if (p.startsWith("/portal/app/services/inbox") || p.startsWith("/portal/app/inbox")) {
      setView({ kind: "tab", tab: "inbox" });
      onDeepLinkHandled?.();
      return;
    }
    if (p.startsWith("/portal/app/services/tasks")) {
      setView({ kind: "tab", tab: "tasks" });
      onDeepLinkHandled?.();
      return;
    }
    if (p.startsWith("/portal/app/people")) {
      setView({ kind: "tab", tab: "people" });
      onDeepLinkHandled?.();
      return;
    }
    if (p.startsWith("/portal/app/billing")) {
      setSettingsSection("billing");
      setView({ kind: "tab", tab: "settings" });
      onDeepLinkHandled?.();
      return;
    }
    if (p.startsWith("/portal/app/profile")) {
      setSettingsSection("profile");
      setView({ kind: "tab", tab: "settings" });
      onDeepLinkHandled?.();
      return;
    }
    if (p.startsWith("/portal/app/services/")) {
      const slug = p.replace("/portal/app/services/", "").split("?")[0].split("#")[0];
      const decodedSlug = decodeURIComponent(slug);
      const allServices = (catalog || []).flatMap((g) => g.services);
      const match = allServices.find((s) => s.slug === decodedSlug);
      setView({ kind: "service", slug: decodedSlug, title: match?.title || "Service" });
      onDeepLinkHandled?.();
      return;
    }

    setView({ kind: "tab", tab: "home" });
    onDeepLinkHandled?.();
  }, [catalog, deepLinkPath, onDeepLinkHandled]);

  const tabs: Array<{ key: RootTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: "home", label: "Home", icon: "home-outline" },
    { key: "inbox", label: "Inbox", icon: "mail-outline" },
    { key: "tasks", label: "Tasks", icon: "checkbox-outline" },
    { key: "people", label: "People", icon: "people-outline" },
    { key: "settings", label: "Settings", icon: "settings-outline" },
  ];

  return (
    <SafeAreaView style={styles.safe} {...(showChrome ? panResponder.panHandlers : {})}>
      {showChrome ? (
        <View style={styles.header}>
          <Pressable
            style={styles.headerIconBtn}
            onPress={() => setDrawerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <Ionicons name="menu" size={24} color={ZINC_900} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Image source={{ uri: portalLogoUrl }} style={styles.logo} />
          </View>

          <View style={styles.headerRight}>
            <Pressable
              style={styles.headerIconBtn}
              onPress={() => openExternalUrl(BOOK_A_CALL_URL)}
              accessibilityRole="button"
              accessibilityLabel="Book a call"
            >
              <Ionicons name="calendar-outline" size={22} color={ZINC_600} />
            </Pressable>

            <Pressable
              style={styles.headerIconBtn}
              onPress={() => openExternalUrl(HELP_URL)}
              accessibilityRole="button"
              accessibilityLabel="Help"
            >
              <Ionicons name="help-circle-outline" size={24} color={ZINC_600} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.body}>
        {showChrome && view.kind === "tab" && view.tab === "settings" ? (
          <View style={styles.settingsHeaderRow}>
            <Pressable
              style={[
                styles.segmentBtn,
                settingsSection === "profile" ? styles.segmentBtnActive : null,
              ]}
              onPress={() => setSettingsSection("profile")}
            >
              <Text
                style={[
                  styles.segmentText,
                  settingsSection === "profile" ? styles.segmentTextActive : null,
                ]}
              >
                Profile
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.segmentBtn,
                settingsSection === "billing" ? styles.segmentBtnActive : null,
              ]}
              onPress={() => setSettingsSection("billing")}
            >
              <Text
                style={[
                  styles.segmentText,
                  settingsSection === "billing" ? styles.segmentTextActive : null,
                ]}
              >
                Billing
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.webSurfaceWrap}>
          {showChrome && view.kind === "tab" && view.tab === "settings" && settingsSection === "billing" ? (
            <MobileBillingScreen catalog={catalog} statuses={statuses} />
          ) : (
            <PortalWebSurface path={targetPath} />
          )}
        </View>
      </View>

      {showChrome ? (
        <>
          <View style={styles.tabBar}>
            {tabs.map((t) => {
              const active = view.kind === "tab" && view.tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  style={styles.tabBtn}
                  onPress={() => setView({ kind: "tab", tab: t.key })}
                  accessibilityRole="button"
                  accessibilityLabel={t.label}
                >
                  <Ionicons name={t.icon} size={22} color={active ? BRAND_BLUE : ZINC_500} />
                  <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]} numberOfLines={1}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            pointerEvents={drawerOpen ? "auto" : "none"}
            style={[styles.drawerOverlay, { opacity: drawerOpen ? 1 : 0 }]}
          >
            <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
          </View>

          <Animated.View
            style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }] }]}
            pointerEvents={drawerOpen ? "auto" : "none"}
          >
            <View style={styles.drawerTop}>
              <Text style={styles.drawerTitle}>Services</Text>
              <Pressable style={styles.drawerCloseBtn} onPress={() => setDrawerOpen(false)}>
                <Ionicons name="close" size={20} color={ZINC_600} />
              </Pressable>
            </View>

            {loadingCatalog && !catalog ? (
              <View style={styles.drawerLoading}>
                <ActivityIndicator color={ZINC_900} />
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.drawerScroll}>
                {(catalog || []).map((g) => (
                  <View key={g.key} style={styles.drawerGroup}>
                    <Text style={styles.drawerGroupTitle}>{g.title}</Text>
                    {g.services.map((s) => {
                      const st = statuses?.[s.slug];
                      const state = typeof st?.state === "string" ? st.state : "";
                      const lockLabel = typeof st?.label === "string" ? st.label : "";
                      const showLock = state && ["locked", "paused", "canceled", "coming_soon"].includes(state);
                      const tone = accentColor(s.accent);
                      const glyph = iconForServiceSlug(s.slug);

                      return (
                        <Pressable
                          key={s.slug}
                          style={styles.drawerItem}
                          onPress={() => {
                            setDrawerOpen(false);
                            setView({ kind: "service", slug: s.slug, title: s.title });
                          }}
                        >
                          <View style={styles.drawerItemIconChip}>
                            <Ionicons name={glyph} size={18} color={tone} />
                          </View>

                          <View style={styles.drawerItemLeft}>
                            <Text style={styles.drawerItemTitle} numberOfLines={1}>
                              {s.title}
                            </Text>
                            <Text style={styles.drawerItemDesc} numberOfLines={1}>
                              {s.description}
                            </Text>
                          </View>
                          {showLock ? (
                            <View style={styles.lockPill}>
                              <Ionicons name="lock-closed" size={12} color={ZINC_600} />
                              <Text style={styles.lockPillText} numberOfLines={1}>
                                {lockLabel || "Locked"}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.drawerFooter}>
              <View style={styles.drawerFooterRow}>
                <Text style={styles.drawerFooterMeta} numberOfLines={1}>
                  {me?.name ? me.name : ""}
                </Text>

                <Pressable
                  style={styles.drawerFooterBtn}
                  onPress={() => void onLogout()}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                >
                  <Ionicons name="log-out-outline" size={18} color={ZINC_600} />
                  <Text style={styles.drawerFooterBtnText}>Sign out</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND_MIST },
  header: {
    height: 64,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: ZINC_200,
  },
  headerIconBtn: {
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  headerRight: { flexDirection: "row", alignItems: "center" },
  logo: { width: 150, height: 32, resizeMode: "contain", flexShrink: 1 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: ZINC_900, maxWidth: 200 },

  body: { flex: 1 },
  settingsHeaderRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: BRAND_MIST,
    borderBottomWidth: 1,
    borderBottomColor: ZINC_200,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "white",
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentBtnActive: {
    backgroundColor: "rgba(29,78,216,0.10)",
    borderColor: "rgba(29,78,216,0.25)",
  },
  segmentText: { fontSize: 14, fontWeight: "700", color: ZINC_600 },
  segmentTextActive: { color: BRAND_BLUE },

  webSurfaceWrap: { flex: 1, backgroundColor: BRAND_MIST },

  tabBar: {
    height: 78,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: ZINC_200,
    flexDirection: "row",
    paddingBottom: Platform.OS === "ios" ? 10 : 6,
    paddingTop: 10,
  },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  tabLabel: { fontSize: 11, color: ZINC_500, fontWeight: "700" },
  tabLabelActive: { color: BRAND_BLUE },

  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.30)",
    zIndex: 20,
  },
  drawerBackdrop: { flex: 1 },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "white",
    borderRightWidth: 1,
    borderRightColor: ZINC_200,
    zIndex: 30,
  },
  drawerTop: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: ZINC_200,
    justifyContent: "space-between",
  },
  drawerTitle: { fontSize: 16, fontWeight: "800", color: ZINC_900 },
  drawerCloseBtn: { height: 36, width: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  drawerLoading: { padding: 16 },
  drawerScroll: { padding: 12, paddingBottom: 24 },
  drawerGroup: { marginBottom: 14 },
  drawerGroupTitle: { fontSize: 12, fontWeight: "800", color: ZINC_600, marginBottom: 8 },
  drawerItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "white",
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
  },
  drawerItemIconChip: {
    width: 36,
    height: 36,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: ZINC_200,
  },
  drawerItemLeft: { flex: 1, minWidth: 0 },
  drawerItemTitle: { fontSize: 14, fontWeight: "800", color: ZINC_900 },
  drawerItemDesc: { fontSize: 12, color: ZINC_600, marginTop: 2 },
  lockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "#fafafa",
    maxWidth: 120,
  },
  lockPillText: { fontSize: 11, fontWeight: "800", color: ZINC_600 },
  drawerFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: ZINC_200,
    backgroundColor: "white",
  },
  drawerFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  drawerFooterMeta: { fontSize: 12, color: ZINC_600, fontWeight: "700", flex: 1 },
  drawerFooterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "white",
  },
  drawerFooterBtnText: { fontSize: 12, fontWeight: "800", color: ZINC_600 },
});
