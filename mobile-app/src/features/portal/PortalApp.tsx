import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { portalLogoUrl } from "../../config/app";
import { Image } from "react-native";
import {
  createTask,
  getBillingSummary,
  getCredits,
  getInboxThreads,
  getServicesStatus,
  getTasks,
  type InboxThread,
  type PortalTask,
} from "./api";

type PortalTab = "dashboard" | "services" | "tasks" | "inbox" | "billing" | "profile";

const BRAND_MIST = "#f1f5f9";
const BRAND_INK = "#334155";
const ZINC_200 = "#e4e4e7";
const ZINC_600 = "#52525b";
const ZINC_900 = "#18181b";

export function PortalApp({
  me,
  onLogout,
}: {
  me: { email: string; name: string; role: string } | null;
  onLogout: () => Promise<void>;
}) {
  const [tab, setTab] = useState<PortalTab>("dashboard");

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <Image source={{ uri: portalLogoUrl }} style={styles.logo} />
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>Client Portal</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {me?.email || ""}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <DashboardScreen active={tab === "dashboard"} me={me} onNavigate={setTab} />
        <ServicesScreen active={tab === "services"} />
        <TasksScreen active={tab === "tasks"} />
        <InboxScreen active={tab === "inbox"} />
        <BillingScreen active={tab === "billing"} />
        <ProfileScreen active={tab === "profile"} me={me} onLogout={onLogout} />
      </View>

      <View style={styles.tabBar}>
        <TabButton label="Home" active={tab === "dashboard"} onPress={() => setTab("dashboard")} />
        <TabButton label="Services" active={tab === "services"} onPress={() => setTab("services")} />
        <TabButton label="Tasks" active={tab === "tasks"} onPress={() => setTab("tasks")} />
        <TabButton label="Inbox" active={tab === "inbox"} onPress={() => setTab("inbox")} />
        <TabButton label="Billing" active={tab === "billing"} onPress={() => setTab("billing")} />
        <TabButton label="Profile" active={tab === "profile"} onPress={() => setTab("profile")} />
      </View>
    </View>
  );
}

function DashboardScreen({
  active,
  me,
  onNavigate,
}: {
  active: boolean;
  me: { email: string; name: string; role: string } | null;
  onNavigate: (t: PortalTab) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<any | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [services, setServices] = useState<any | null>(null);
  const [openTasksCount, setOpenTasksCount] = useState<number | null>(null);
  const [emailThreadsCount, setEmailThreadsCount] = useState<number | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [c, s, svc, t, inbox] = await Promise.all([
        getCredits(),
        getBillingSummary(),
        getServicesStatus(),
        getTasks({ status: "OPEN" }),
        getInboxThreads("email"),
      ]);
      setCredits(c);
      setSummary(s);
      setServices(svc);
      setOpenTasksCount((t as any)?.ok ? ((t as any).tasks || []).length : null);
      setEmailThreadsCount((inbox as any)?.ok ? ((inbox as any).threads || []).length : null);
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const creditsLine = useMemo(() => {
    if ((credits as any)?.ok !== true) return null;
    const n = (credits as any)?.credits;
    if (typeof n !== "number") return null;
    return `${n} credits`;
  }, [credits]);

  const spendLine = useMemo(() => {
    if ((summary as any)?.ok !== true) return null;
    const spent = (summary as any)?.spentThisMonthCents;
    const monthly = (summary as any)?.monthlyCents;
    if (typeof spent !== "number" && typeof monthly !== "number") return null;
    const spentUsd = typeof spent === "number" ? spent / 100 : null;
    const monthlyUsd = typeof monthly === "number" ? monthly / 100 : null;
    if (spentUsd != null && monthlyUsd != null) return `Spent $${spentUsd.toFixed(0)} / $${monthlyUsd.toFixed(0)} this month`;
    if (monthlyUsd != null) return `Monthly $${monthlyUsd.toFixed(0)}`;
    return spentUsd != null ? `Spent $${spentUsd.toFixed(0)} this month` : null;
  }, [summary]);

  const serviceCounts = useMemo(() => {
    const statuses = (services as any)?.statuses;
    if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) return null;
    const values = Object.values(statuses as Record<string, any>);
    const counts: Record<string, number> = {};
    for (const v of values) {
      const state = typeof (v as any)?.state === "string" ? String((v as any).state) : "unknown";
      counts[state] = (counts[state] || 0) + 1;
    }
    return counts;
  }, [services]);

  return (
    <ScreenShell
      active={active}
      title="Home"
    >
      {error ? <ErrorBox text={error} /> : null}

      <Card>
        <Text style={styles.cardTitle}>Welcome{me?.name ? `, ${me.name}` : ""}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {me?.email || ""}
        </Text>
      </Card>

      <View style={styles.grid2}>
        <Pressable style={styles.tile} onPress={() => onNavigate("billing")}>
          <Text style={styles.tileLabel}>Credits</Text>
          <Text style={styles.tileValue}>{creditsLine || "—"}</Text>
          <Text style={styles.tileMeta}>{(credits as any)?.ok === true && (credits as any)?.autoTopUp ? "Auto top-up on" : ""}</Text>
        </Pressable>
        <Pressable style={styles.tile} onPress={() => onNavigate("billing")}>
          <Text style={styles.tileLabel}>Billing</Text>
          <Text style={styles.tileValue}>{spendLine || "—"}</Text>
          <Text style={styles.tileMeta}>{(summary as any)?.ok === true && (summary as any)?.configured ? "Configured" : "Not configured"}</Text>
        </Pressable>
      </View>

      <View style={styles.grid2}>
        <Pressable style={styles.tile} onPress={() => onNavigate("tasks")}>
          <Text style={styles.tileLabel}>Open tasks</Text>
          <Text style={styles.tileValue}>{typeof openTasksCount === "number" ? String(openTasksCount) : "—"}</Text>
          <Text style={styles.tileMeta}>Tap to view tasks</Text>
        </Pressable>
        <Pressable style={styles.tile} onPress={() => onNavigate("inbox")}>
          <Text style={styles.tileLabel}>Email threads</Text>
          <Text style={styles.tileValue}>{typeof emailThreadsCount === "number" ? String(emailThreadsCount) : "—"}</Text>
          <Text style={styles.tileMeta}>Tap to view inbox</Text>
        </Pressable>
      </View>

      <Card>
        <View style={styles.rowSpaceBetween}>
          <Text style={styles.cardTitle}>Services</Text>
          <Pressable onPress={() => onNavigate("services")}>
            <Text style={styles.linkLike}>View all</Text>
          </Pressable>
        </View>
        {serviceCounts ? (
          <Text style={styles.meta}>
            Active: {serviceCounts.active || 0} • Needs setup: {serviceCounts.needs_setup || 0} • Locked: {serviceCounts.locked || 0}
          </Text>
        ) : (
          <Text style={styles.muted}>Loading…</Text>
        )}
      </Card>
    </ScreenShell>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.tabBtn, active ? styles.tabBtnActive : null]} onPress={onPress}>
      <Text style={[styles.tabBtnText, active ? styles.tabBtnTextActive : null]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ScreenShell({
  active,
  title,
  children,
  right,
}: {
  active: boolean;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  if (!active) return null;
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.screenHeaderRow}>
        <Text style={styles.screenTitle}>{title}</Text>
        {right ? <View style={styles.screenHeaderRight}>{right}</View> : null}
      </View>
      {children}
    </ScrollView>
  );
}

function ServicesScreen({ active }: { active: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await getServicesStatus();
      if ((res as any)?.ok) setData(res);
      else setError((res as any)?.error || "Failed to load services");
    } catch (e: any) {
      setError(e?.message || "Failed to load services");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <ScreenShell
      active={active}
      title="Services"
    >
      {error ? <ErrorBox text={error} /> : null}
      {!data && busy ? <ActivityIndicator size="large" color={BRAND_INK} /> : null}
      {data ? <ServicesListCard data={data} /> : null}
    </ScreenShell>
  );
}

function ServicesListCard({ data }: { data: any }) {
  const statuses = data?.statuses;
  const entries = useMemo(() => {
    if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) return [] as Array<{ slug: string; state: string; label: string }>;
    return Object.entries(statuses as Record<string, any>)
      .map(([slug, v]) => ({
        slug,
        state: typeof v?.state === "string" ? v.state : "unknown",
        label: typeof v?.label === "string" ? v.label : "",
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }, [statuses]);

  if (!entries.length) {
    return (
      <Card>
        <Text style={styles.muted}>No services found.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.cardTitle}>Your services</Text>
      {entries.map((e) => (
        <View key={e.slug} style={styles.serviceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.serviceName}>{titleFromSlug(e.slug)}</Text>
            <Text style={styles.meta}>{e.slug}</Text>
          </View>
          <StatusPill state={e.state} label={e.label || e.state} />
        </View>
      ))}
    </Card>
  );
}

function StatusPill({ state, label }: { state: string; label: string }) {
  const tone = (() => {
    const s = state.toLowerCase();
    if (s === "active") return "good";
    if (s === "needs_setup") return "warn";
    if (s === "locked") return "muted";
    if (s === "paused") return "warn";
    if (s === "canceled") return "muted";
    if (s === "coming_soon") return "muted";
    return "muted";
  })();

  return (
    <View style={[styles.pill, tone === "good" ? styles.pillGood : tone === "warn" ? styles.pillWarn : styles.pillMuted]}>
      <Text style={[styles.pillText, tone === "good" ? styles.pillTextGood : tone === "warn" ? styles.pillTextWarn : styles.pillTextMuted]}>
        {label}
      </Text>
    </View>
  );
}

function TasksScreen({ active }: { active: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PortalTask[]>([]);
  const [title, setTitle] = useState("");

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await getTasks({ status: "OPEN" });
      if ((res as any)?.ok) setTasks((res as any).tasks || []);
      else setError((res as any)?.error || "Failed to load tasks");
    } catch (e: any) {
      setError(e?.message || "Failed to load tasks");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function onCreate() {
    const t = title.trim();
    if (!t || busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await createTask({ title: t });
      if (!(res as any)?.ok) {
        setError((res as any)?.error || "Failed to create task");
      } else {
        setTitle("");
        await load();
      }
    } catch (e: any) {
      setError(e?.message || "Failed to create task");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      active={active}
      title="Tasks"
    >
      {error ? <ErrorBox text={error} /> : null}

      <Card>
        <Text style={styles.cardTitle}>Create task</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Task title"
          editable={!busy}
        />
        <Pressable
          style={[styles.primaryButton, busy || !title.trim() ? styles.buttonDisabled : null]}
          onPress={onCreate}
          disabled={busy || !title.trim()}
        >
          <Text style={styles.primaryButtonText}>{busy ? "Saving…" : "Add task"}</Text>
        </Pressable>
      </Card>

      {!tasks.length && !busy ? (
        <Card>
          <Text style={styles.muted}>No open tasks yet.</Text>
        </Card>
      ) : null}

      {tasks.map((t) => (
        <Card key={t.id}>
          <Text style={styles.cardTitle}>{t.title}</Text>
          {t.description ? <Text style={styles.muted}>{t.description}</Text> : null}
          <Text style={styles.meta}>
            Status: {t.status}
            {t.dueAtIso ? ` • Due ${formatIsoDate(t.dueAtIso)}` : ""}
          </Text>
        </Card>
      ))}
    </ScreenShell>
  );
}

function InboxScreen({ active }: { active: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [threads, setThreads] = useState<InboxThread[]>([]);

  async function load(nextChannel = channel) {
    setBusy(true);
    setError(null);
    try {
      const res = await getInboxThreads(nextChannel);
      if ((res as any)?.ok) setThreads((res as any).threads || []);
      else setError((res as any)?.error || "Failed to load inbox");
    } catch (e: any) {
      setError(e?.message || "Failed to load inbox");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, channel]);

  return (
    <ScreenShell
      active={active}
      title="Inbox"
    >
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, channel === "email" ? styles.chipSelected : null]}
          onPress={() => setChannel("email")}
        >
          <Text style={channel === "email" ? styles.chipTextSelected : styles.chipText}>Email</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, channel === "sms" ? styles.chipSelected : null]}
          onPress={() => setChannel("sms")}
        >
          <Text style={channel === "sms" ? styles.chipTextSelected : styles.chipText}>SMS</Text>
        </Pressable>
      </View>

      {error ? <ErrorBox text={error} /> : null}

      {!threads.length && !busy && !error ? (
        <Card>
          <Text style={styles.muted}>No threads yet.</Text>
        </Card>
      ) : null}

      {threads.map((t) => (
        <Card key={t.id}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {t.contact?.name || t.peerAddress}
          </Text>
          {t.subject ? <Text style={styles.meta}>Subject: {t.subject}</Text> : null}
          {t.lastMessagePreview ? <Text style={styles.muted}>{t.lastMessagePreview}</Text> : null}
          <Text style={styles.meta}>
            {t.lastMessageAt ? formatIsoDateTime(t.lastMessageAt) : ""}
          </Text>
        </Card>
      ))}
    </ScreenShell>
  );
}

function BillingScreen({ active }: { active: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<any | null>(null);
  const [summary, setSummary] = useState<any | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [c, s] = await Promise.all([getCredits(), getBillingSummary()]);
      setCredits(c);
      setSummary(s);
    } catch (e: any) {
      setError(e?.message || "Failed to load billing");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const topLine = useMemo(() => {
    const ok = (credits as any)?.ok;
    if (!ok) return null;
    const v = (credits as any)?.credits;
    if (typeof v !== "number") return null;
    return `${v} credits`;
  }, [credits]);

  return (
    <ScreenShell
      active={active}
      title="Billing"
    >
      {error ? <ErrorBox text={error} /> : null}
      {topLine ? (
        <Card>
          <Text style={styles.cardTitle}>{topLine}</Text>
          {(credits as any)?.creditUsdValue ? (
            <Text style={styles.meta}>Value: ${(credits as any).creditUsdValue.toFixed(2)} / credit</Text>
          ) : null}
        </Card>
      ) : null}

      <BillingDetails credits={credits} summary={summary} />
    </ScreenShell>
  );
}

function BillingDetails({ credits, summary }: { credits: any; summary: any }) {
  const creditsOk = (credits as any)?.ok === true;
  const summaryOk = (summary as any)?.ok === true;

  const creditsValue = creditsOk && typeof (credits as any)?.credits === "number" ? (credits as any).credits : null;
  const usdPerCredit = creditsOk && typeof (credits as any)?.creditUsdValue === "number" ? (credits as any).creditUsdValue : null;
  const autoTopUp = creditsOk ? Boolean((credits as any)?.autoTopUp) : null;

  const monthlyUsd = summaryOk && typeof (summary as any)?.monthlyCents === "number" ? (summary as any).monthlyCents / 100 : null;
  const spentUsd = summaryOk && typeof (summary as any)?.spentThisMonthCents === "number" ? (summary as any).spentThisMonthCents / 100 : null;
  const breakdown = summaryOk && Array.isArray((summary as any)?.monthlyBreakdown) ? (summary as any).monthlyBreakdown : [];
  const subscription = summaryOk ? (summary as any)?.subscription : null;

  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>Credits</Text>
        <Text style={styles.bigValue}>{typeof creditsValue === "number" ? creditsValue : "—"}</Text>
        {typeof usdPerCredit === "number" ? <Text style={styles.meta}>${usdPerCredit.toFixed(2)} per credit</Text> : null}
        {autoTopUp != null ? <Text style={styles.meta}>Auto top-up: {autoTopUp ? "On" : "Off"}</Text> : null}
        {!creditsOk && (credits as any)?.error ? <Text style={styles.meta}>Error: {(credits as any).error}</Text> : null}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Subscription</Text>
        <Text style={styles.meta}>Monthly: {typeof monthlyUsd === "number" ? `$${monthlyUsd.toFixed(0)}/mo` : "—"}</Text>
        <Text style={styles.meta}>Spent this month: {typeof spentUsd === "number" ? `$${spentUsd.toFixed(0)}` : "—"}</Text>
        {subscription ? (
          <Text style={styles.meta}>
            Status: {String(subscription.status || "")} {subscription.cancelAtPeriodEnd ? "(canceling)" : ""}
          </Text>
        ) : null}
        {(summary as any)?.ok === false && (summary as any)?.error ? <Text style={styles.meta}>Error: {(summary as any).error}</Text> : null}
      </Card>

      {breakdown.length ? (
        <Card>
          <Text style={styles.cardTitle}>Plan breakdown</Text>
          {breakdown.map((b: any) => (
            <View key={String(b.subscriptionId)} style={styles.rowSpaceBetween}>
              <Text style={styles.muted}>{String(b.title || "")}</Text>
              <Text style={styles.meta}>${(Number(b.monthlyCents || 0) / 100).toFixed(0)}/mo</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

function ProfileScreen({
  active,
  me,
  onLogout,
}: {
  active: boolean;
  me: { email: string; name: string; role: string } | null;
  onLogout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <ScreenShell active={active} title="Profile">
      <Card>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.meta}>Email: {me?.email || ""}</Text>
        <Text style={styles.meta}>Role: {me?.role || ""}</Text>
      </Card>

      <Pressable
        style={[styles.primaryButton, busy ? styles.buttonDisabled : null]}
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await onLogout();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={styles.primaryButtonText}>{busy ? "Logging out…" : "Log out"}</Text>
      </Pressable>
    </ScreenShell>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function ErrorBox({ text }: { text: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

function prettyJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function titleFromSlug(slug: string) {
  return String(slug)
    .trim()
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
    .join(" ");
}

function formatIsoDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatIsoDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND_MIST },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: ZINC_200,
    backgroundColor: "#fff",
  },
  logo: { height: 26, width: 120, resizeMode: "contain" },
  headerTextCol: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: ZINC_900 },
  headerSubtitle: { fontSize: 12, color: ZINC_600, marginTop: 2 },
  body: { flex: 1 },
  screen: { padding: 16, gap: 12 },
  screenHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  screenHeaderRight: { flexDirection: "row" },
  screenTitle: { fontSize: 18, fontWeight: "700", color: ZINC_900 },

  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: ZINC_200,
    backgroundColor: "#fff",
  },
  tabBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" },
  tabBtnActive: { borderTopWidth: 2, borderTopColor: BRAND_INK },
  tabBtnText: { fontSize: 12, color: ZINC_600, fontWeight: "600" },
  tabBtnTextActive: { color: BRAND_INK },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "#fff",
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: ZINC_900 },
  bigValue: { fontSize: 28, fontWeight: "800", color: ZINC_900 },
  muted: { color: ZINC_600 },
  meta: { fontSize: 12, color: ZINC_600 },
  mono: { fontFamily: "Menlo", fontSize: 12, color: ZINC_900 },

  grid2: { flexDirection: "row", gap: 12 },
  tile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "#fff",
    padding: 14,
    gap: 8,
  },
  tileLabel: { fontSize: 12, fontWeight: "800", color: ZINC_600 },
  tileValue: { fontSize: 14, fontWeight: "800", color: ZINC_900 },
  tileMeta: { fontSize: 12, color: ZINC_600 },

  rowSpaceBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  linkLike: { fontSize: 12, fontWeight: "800", color: BRAND_INK },

  serviceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 6 },
  serviceName: { fontSize: 14, fontWeight: "800", color: ZINC_900 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  pillText: { fontSize: 12, fontWeight: "800" },
  pillGood: { backgroundColor: "#ecfdf5", borderColor: "#bbf7d0" },
  pillTextGood: { color: "#047857" },
  pillWarn: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  pillTextWarn: { color: "#92400e" },
  pillMuted: { backgroundColor: "#fafafa", borderColor: ZINC_200 },
  pillTextMuted: { color: ZINC_600 },

  errorBox: {
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    padding: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: { color: "#991b1b", fontSize: 14 },

  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  chipSelected: { backgroundColor: BRAND_INK, borderColor: BRAND_INK },
  chipText: { color: ZINC_600, fontSize: 14, fontWeight: "600" },
  chipTextSelected: { color: "#fff", fontSize: 14, fontWeight: "600" },

  input: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: ZINC_900,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: BRAND_INK,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  primaryButtonText: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  buttonDisabled: { opacity: 0.6 },

  smallBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  smallBtnText: { fontSize: 12, fontWeight: "700", color: BRAND_INK },
});
