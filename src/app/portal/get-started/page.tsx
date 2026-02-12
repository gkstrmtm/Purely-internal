"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  GET_STARTED_GOALS,
  goalLabelsFromIds,
  normalizeGoalIds,
  recommendPortalServiceSlugs,
  getSelectablePortalServices,
} from "@/lib/portalGetStartedRecommendations";

export default function PortalGetStartedPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [brandVoice, setBrandVoice] = useState("");

  const [goalIds, setGoalIds] = useState<string[]>([]);
  const normalizedGoals = normalizeGoalIds(goalIds);
  const recommendedServiceSlugs = recommendPortalServiceSlugs(normalizedGoals);

  const selectableServices = getSelectablePortalServices();
  const serviceBySlug = new Map(selectableServices.map((s) => [s.slug, s] as const));

  const [selectedServiceSlugs, setSelectedServiceSlugs] = useState<string[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (selectionTouched) return;
    setSelectedServiceSlugs(recommendedServiceSlugs);
  }, [recommendedServiceSlugs, selectionTouched]);

  function toggleGoal(id: string) {
    setGoalIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return Array.from(s);
    });
  }

  function toggleService(slug: string) {
    setSelectionTouched(true);
    setSelectedServiceSlugs((prev) => {
      const s = new Set(prev);
      if (s.has(slug)) s.delete(slug);
      else s.add(slug);
      return Array.from(s);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/client-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        password,
        businessName,
        websiteUrl,
        industry,
        businessModel,
        targetCustomer,
        brandVoice,
        goalIds: normalizedGoals,
        selectedServiceSlugs,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      setError(body?.error ?? "Unable to create account");
      return;
    }

    const loginRes = await fetch("/portal/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!loginRes.ok) {
      router.push("/login");
      return;
    }

    router.push("/portal/app/services");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-brand-mist text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex justify-center">
            <Image
              src="/brand/purity-5.png"
              alt="Purely Automation"
              width={520}
              height={160}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </div>

          <p className="mt-6 text-base text-zinc-600">Create your client portal account.</p>

          <form className="mt-6 space-y-6" onSubmit={onSubmit}>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Account</div>
              <div className="mt-1 text-sm text-zinc-600">This is how you sign in to your portal.</div>

              <div className="mt-4 grid grid-cols-1 gap-4">
            <div>
              <label className="text-base font-medium">Name</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-base font-medium">Email</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-base font-medium">Phone</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                required
              />
              <div className="mt-2 text-xs text-zinc-500">Used for notifications and service setup (optional in-app later).</div>
            </div>

            <div>
              <label className="text-base font-medium">Password</label>
              <input
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">Quick onboarding</div>
              <div className="mt-1 text-sm text-zinc-600">Answer a few questions so we can tailor recommendations.</div>

              <div className="mt-4 grid grid-cols-1 gap-4">
                <div>
                  <label className="text-base font-medium">Business name</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-base font-medium">Website (optional)</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://yourbusiness.com"
                  />
                </div>

                <div>
                  <label className="text-base font-medium">Industry (optional)</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. HVAC, dental, real estate"
                  />
                </div>

                <div>
                  <label className="text-base font-medium">Business model (optional)</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                    value={businessModel}
                    onChange={(e) => setBusinessModel(e.target.value)}
                    placeholder="e.g. Local service, agency, ecommerce"
                  />
                </div>

                <div>
                  <label className="text-base font-medium">Target customer (optional)</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                    value={targetCustomer}
                    onChange={(e) => setTargetCustomer(e.target.value)}
                    placeholder="Who do you primarily serve?"
                  />
                </div>

                <div>
                  <label className="text-base font-medium">Brand voice (optional)</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
                    value={brandVoice}
                    onChange={(e) => setBrandVoice(e.target.value)}
                    placeholder="e.g. friendly, professional, direct"
                  />
                </div>

                <div>
                  <div className="text-base font-medium">Top goals</div>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {GET_STARTED_GOALS.map((g) => {
                      const checked = normalizedGoals.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className="flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800"
                        >
                          <span>{g.label}</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={() => toggleGoal(g.id)}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Selected: {goalLabelsFromIds(normalizedGoals).join(", ") || "None yet"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">Recommended services</div>
              <div className="mt-1 text-sm text-zinc-600">Pick what you want to set up first. You can change this anytime.</div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                {(recommendedServiceSlugs.length ? recommendedServiceSlugs : ["inbox", "automations"]).map((slug) => {
                  const s = serviceBySlug.get(slug);
                  if (!s) return null;
                  const checked = selectedServiceSlugs.includes(slug);
                  return (
                    <label
                      key={slug}
                      className={
                        "flex cursor-pointer items-start justify-between gap-4 rounded-2xl border p-4 " +
                        (checked ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white")
                      }
                    >
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{s.title}</div>
                        <div className="mt-1 text-sm text-zinc-600">{s.description}</div>
                        {s.highlights?.length ? (
                          <div className="mt-2 text-xs text-zinc-500">{s.highlights.slice(0, 2).join(" · ")}</div>
                        ) : null}
                      </div>
                      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={() => toggleService(slug)} />
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 text-xs text-zinc-500">
                Tip: Inbox, Tasks, and Media Library are included by default.
              </div>
            </div>

            <button
              className="w-full rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>

          <div className="mt-6 text-base text-zinc-600">
            Already have an account?{" "}
            <a className="font-medium text-brand-ink hover:underline" href="/login">
              Sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
