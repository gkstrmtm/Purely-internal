import { apiFetch } from "../../api/client";
import { AppConfig } from "../../config/app";

function portalHeaders() {
  return {
    [AppConfig.portalVariantHeaderName]: AppConfig.portalVariant,
    [AppConfig.appHeaderName]: AppConfig.appHeaderValue,
  } as Record<string, string>;
}

export type ServicesStatusResponse = {
  ok: true;
  ownerId: string;
  billingModel?: string;
  entitlements?: any;
  statuses?: any;
};

export async function getServicesStatus() {
  return apiFetch<ServicesStatusResponse | { ok: false; error: string }>("/api/portal/services/status", {
    method: "GET",
    headers: portalHeaders(),
  });
}

export type PortalTask = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "DONE" | "CANCELED" | string;
  dueAtIso: string | null;
  updatedAtIso: string | null;
  viewerDoneAtIso?: string | null;
  assignedTo?: { userId: string; email: string; name: string } | null;
};

export type TasksResponse = { ok: true; viewerUserId: string; tasks: PortalTask[] } | { ok: false; error: string };

export async function getTasks(params?: { status?: "OPEN" | "DONE" | "CANCELED" | "ALL"; assigned?: "all" | "me" }) {
  const url = new URL("/api/portal/tasks", "http://local");
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.assigned) url.searchParams.set("assigned", params.assigned);

  return apiFetch<TasksResponse>(url.pathname + url.search, {
    method: "GET",
    headers: portalHeaders(),
  });
}

export async function createTask(input: { title: string; description?: string }) {
  return apiFetch<{ ok: true; taskId: string } | { ok: false; error: string }>("/api/portal/tasks", {
    method: "POST",
    headers: portalHeaders(),
    body: JSON.stringify({ title: input.title, description: input.description }),
  });
}

export type InboxThread = {
  id: string;
  channel: "EMAIL" | "SMS" | string;
  peerAddress: string;
  subject: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  contact?: { id: string; name: string; email: string | null; phone: string | null } | null;
  contactTags?: Array<{ id: string; name: string; color: string | null }>;
};

export async function getInboxThreads(channel: "email" | "sms") {
  return apiFetch<{ ok: true; threads: InboxThread[] } | { ok: false; error: string; code?: string }>(
    `/api/portal/inbox/threads?channel=${encodeURIComponent(channel)}`,
    {
      method: "GET",
      headers: portalHeaders(),
    },
  );
}

export type CreditsResponse =
  | { ok: true; credits: number; autoTopUp: boolean; creditUsdValue?: number; creditsPerPackage?: number; purchaseAvailable?: boolean }
  | { error: string };

export async function getCredits() {
  return apiFetch<CreditsResponse>("/api/portal/credits", {
    method: "GET",
    headers: portalHeaders(),
  });
}

export type BillingSummaryResponse =
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
  | { ok: false; configured: boolean; error: string; details?: string };

export async function getBillingSummary() {
  return apiFetch<BillingSummaryResponse>("/api/portal/billing/summary", {
    method: "GET",
    headers: portalHeaders(),
  });
}
