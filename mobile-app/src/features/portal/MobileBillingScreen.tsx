import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getBillingSummary, getCredits, getServicesStatus, type ServicesCatalogGroup } from "./api";

const BRAND_MIST = "#f1f5f9";
const ZINC_100 = "#f4f4f5";
const ZINC_200 = "#e4e4e7";
const ZINC_500 = "#71717a";
const ZINC_600 = "#52525b";
const ZINC_900 = "#18181b";
const BRAND_BLUE = "#1d4ed8";

function formatMoney(cents: number, currency: string) {
  const value = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const curr = String(currency || "usd").toUpperCase();
  const amount = (value / 100).toFixed(2);
  return `${curr} ${amount}`;
}

export function MobileBillingScreen({
  catalog,
  statuses,
}: {
  catalog: ServicesCatalogGroup[] | null;
  statuses: Record<string, { state: string; label: string }> | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [billingModel, setBillingModel] = useState<string | null>(null);
  const [credits, setCredits] = useState<{ ok: true; credits: number; autoTopUp: boolean; creditUsdValue?: number } | null>(
    null,
  );
  const [summary, setSummary] = useState<
    | {
        ok: true;
        configured: boolean;
        monthlyCents?: number;
        currency?: string;
        spentThisMonthCents?: number;
        spentThisMonthCurrency?: string;
        monthlyBreakdown?: Array<{ subscriptionId: string; title: string; monthlyCents: number; currency: string }>;
        subscription?: { id: string; status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: number | null };
      }
    | { ok: false; configured: boolean; error: string; details?: string }
    | null
  >(null);

  const creditsOnly = String(billingModel || "").toLowerCase() === "credits";

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const [c, s, svc] = await Promise.all([getCredits().catch(() => null), getBillingSummary().catch(() => null), getServicesStatus().catch(() => null)]);

      if (c && (c as any)?.ok === true) {
        setCredits({
          ok: true,
          credits: Number((c as any).credits ?? 0) || 0,
          autoTopUp: Boolean((c as any).autoTopUp),
          creditUsdValue: typeof (c as any).creditUsdValue === "number" ? (c as any).creditUsdValue : undefined,
        });
      } else {
        setCredits(null);
      }

      if (s) {
        setSummary(s as any);
      } else {
        setSummary(null);
      }

      if (svc && (svc as any)?.ok === true) {
        setBillingModel(typeof (svc as any).billingModel === "string" ? (svc as any).billingModel : null);
      } else {
        setBillingModel(null);
      }
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Unable to load billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const monthlyPaymentText = useMemo(() => {
    if (creditsOnly) return "No subscription";
    if (!summary) return "N/A";
    if (summary.ok !== true) return "N/A";
    if (!summary.configured) return "Not configured";
    const cents = typeof summary.monthlyCents === "number" ? summary.monthlyCents : 0;
    const currency = summary.currency || "usd";
    return formatMoney(cents, currency);
  }, [creditsOnly, summary]);

  const spentThisMonthText = useMemo(() => {
    if (!summary || summary.ok !== true || !summary.configured) return "N/A";
    const cents = typeof summary.spentThisMonthCents === "number" ? summary.spentThisMonthCents : 0;
    const currency = summary.spentThisMonthCurrency || summary.currency || "usd";
    return formatMoney(cents, currency);
  }, [summary]);

  const monthlyBreakdown = useMemo(() => {
    if (!summary || summary.ok !== true || !summary.configured) return [];
    const rows = Array.isArray(summary.monthlyBreakdown) ? summary.monthlyBreakdown : [];
    return rows.filter((r) => r && typeof r.title === "string");
  }, [summary]);

  const servicesList = useMemo(() => {
    const all = (catalog || []).flatMap((g) => g.services || []);
    const visible = all.filter((s) => !s.hidden);
    visible.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    return visible;
  }, [catalog]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <Text style={styles.h1}>Billing</Text>
          <Pressable style={styles.refreshBtn} onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="Refresh billing">
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={[styles.card, styles.cardError]}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        ) : null}

        {/* 1) Credits at the top */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Credits</Text>
              <Text style={styles.cardSub}>Usage-based actions spend credits.</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.metaLabel}>Balance</Text>
              <Text style={styles.bigNumber}>{credits?.credits ?? "—"}</Text>
            </View>
          </View>
          {typeof credits?.creditUsdValue === "number" ? (
            <Text style={styles.mutedSmall}>1 credit = ${credits.creditUsdValue.toFixed(2)}.</Text>
          ) : null}
          {loading ? (
            <View style={{ marginTop: 10 }}>
              <ActivityIndicator />
            </View>
          ) : null}
        </View>

        {/* 2) Subscription/spent this month under credits */}
        <View style={styles.grid2}>
          <View style={styles.pillCard}>
            <Text style={styles.metaLabel}>Monthly payment</Text>
            <Text style={styles.pillValue}>{monthlyPaymentText}</Text>
            <Text style={styles.mutedSmall}>
              {creditsOnly ? "Credits-only billing." : "Subscriptions + enabled services."}
            </Text>
          </View>

          <View style={styles.pillCard}>
            <Text style={styles.metaLabel}>Spent this month</Text>
            <Text style={styles.pillValue}>{spentThisMonthText}</Text>
            <Text style={styles.mutedSmall}>Paid invoices + one-time charges.</Text>
          </View>
        </View>

        {/* 3) Services & status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Services & status</Text>
          <Text style={styles.cardSub}>Live status from your account.</Text>

          {!catalog ? (
            <View style={{ marginTop: 12 }}>
              <ActivityIndicator />
            </View>
          ) : servicesList.length ? (
            <View style={{ marginTop: 10 }}>
              {servicesList.map((s) => {
                const st = statuses?.[s.slug];
                const label = typeof st?.label === "string" && st.label ? st.label : "";
                const state = typeof st?.state === "string" ? st.state : "";
                const showLock = state && ["locked", "paused", "canceled", "coming_soon"].includes(state);

                return (
                  <View key={s.slug} style={styles.serviceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceTitle} numberOfLines={1}>
                        {s.title}
                      </Text>
                      <Text style={styles.serviceSub} numberOfLines={1}>
                        {s.description}
                      </Text>
                    </View>
                    {showLock ? (
                      <View style={styles.lockPill}>
                        <Text style={styles.lockPillText} numberOfLines={1}>
                          {label || "Locked"}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.serviceOk}>{label || "Ready"}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.mutedSmall, { marginTop: 10 }]}>No services found.</Text>
          )}
        </View>

        {/* 4) Monthly breakdown at the bottom (right under services & status) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monthly breakdown</Text>
          <Text style={styles.cardSub}>Everything you currently have access to.</Text>

          {loading && !summary ? (
            <View style={{ marginTop: 12 }}>
              <ActivityIndicator />
            </View>
          ) : monthlyBreakdown.length ? (
            <View style={{ marginTop: 10 }}>
              {monthlyBreakdown.map((x) => (
                <View key={x.subscriptionId} style={styles.breakdownRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceTitle} numberOfLines={1}>
                      {x.title}
                    </Text>
                    <Text style={styles.serviceSub} numberOfLines={1}>
                      {creditsOnly ? "Credit-based" : `${formatMoney(x.monthlyCents, x.currency)}/mo`}
                    </Text>
                  </View>
                  <Text style={styles.breakdownValue} numberOfLines={1}>
                    {creditsOnly ? "—" : formatMoney(x.monthlyCents, x.currency)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.mutedSmall, { marginTop: 10 }]}>No breakdown available.</Text>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_MIST },
  scroll: { padding: 14, paddingBottom: 24 },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  h1: { fontSize: 18, fontWeight: "800", color: ZINC_900 },
  refreshBtn: {
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "white",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  refreshText: { fontSize: 13, fontWeight: "800", color: BRAND_BLUE },

  card: {
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 14,
    marginTop: 10,
  },
  cardError: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  errorTitle: { fontSize: 14, fontWeight: "800", color: "#991b1b" },
  errorBody: { marginTop: 6, fontSize: 13, color: "#7f1d1d" },

  cardRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: ZINC_900 },
  cardSub: { marginTop: 4, fontSize: 12, color: ZINC_600 },

  metaLabel: { fontSize: 11, fontWeight: "700", color: ZINC_500 },
  bigNumber: { marginTop: 2, fontSize: 22, fontWeight: "900", color: ZINC_900 },

  mutedSmall: { marginTop: 10, fontSize: 12, color: ZINC_600 },

  grid2: { flexDirection: "row", gap: 10, marginTop: 10 },
  pillCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: ZINC_100,
    borderRadius: 18,
    padding: 12,
  },
  pillValue: { marginTop: 6, fontSize: 16, fontWeight: "900", color: ZINC_900 },

  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: ZINC_200,
  },
  serviceTitle: { fontSize: 13, fontWeight: "800", color: ZINC_900 },
  serviceSub: { marginTop: 2, fontSize: 12, color: ZINC_600 },
  serviceOk: { fontSize: 12, fontWeight: "800", color: "#065f46" },

  lockPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#f4f4f5",
    borderWidth: 1,
    borderColor: ZINC_200,
  },
  lockPillText: { fontSize: 11, fontWeight: "800", color: ZINC_600 },

  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: ZINC_200,
  },
  breakdownValue: { fontSize: 12, fontWeight: "900", color: ZINC_900 },
});
