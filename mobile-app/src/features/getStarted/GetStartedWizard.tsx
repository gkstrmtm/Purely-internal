import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { PortalSignupInput } from "../../api/portalSignup";
import { PortalMultiSelectField, PortalSingleSelectField } from "./SelectFields";
import {
  ACQUISITION_OPTIONS,
  BUSINESS_MODEL_OPTIONS,
  CALLS_RANGE_OPTIONS,
  formatUsd,
  GET_STARTED_GOALS,
  INDUSTRY_OPTIONS,
  type BillingPreference,
  bundlePlanIds,
  bundleTitle,
  moneyLabel,
  monthlyTotalUsd,
  normalizeGoalIds,
  oneTimeTotalUsd,
  ONBOARDING_UPFRONT_PAID_PLAN_IDS,
  planById,
  planQuantity,
  PORTAL_ONBOARDING_PLANS,
  recommendPortalServiceSlugs,
  STEPS,
  type CallsPerMonthRange,
  type PackagePreset,
} from "./catalog";

const BRAND_MIST = "#f1f5f9";
const BRAND_INK = "#334155";
const ZINC_200 = "#e4e4e7";
const ZINC_600 = "#52525b";
const ZINC_900 = "#18181b";

function requiredMark() {
  return <Text style={styles.required}>*</Text>;
}

export function GetStartedWizard({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: PortalSignupInput) => void;
}) {
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [hasWebsite, setHasWebsite] = useState<"YES" | "NO" | "NOT_SURE">("YES");
  const [callsPerMonthRange, setCallsPerMonthRange] = useState<CallsPerMonthRange>("NOT_SURE");
  const [acquisitionMethods, setAcquisitionMethods] = useState<string[]>([]);
  const [industry, setIndustry] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [brandVoice, setBrandVoice] = useState("");

  const [billingPreference, setBillingPreference] = useState<BillingPreference>("credits");
  const [selectedBundleId, setSelectedBundleId] = useState<PackagePreset | null>(null);

  const [goalIds, setGoalIds] = useState<string[]>([]);
  const normalizedGoals = useMemo(() => normalizeGoalIds(goalIds), [goalIds]);
  const recommendedServiceSlugs = useMemo(() => recommendPortalServiceSlugs(normalizedGoals), [normalizedGoals]);

  const planIdsByRecommendedSlug = useMemo(
    () =>
      new Map<string, string>([
        ["booking", "booking"],
        ["reviews", "reviews"],
        ["blogs", "blogs"],
        ["automations", "automations"],
        ["ai-receptionist", "ai-receptionist"],
        ["ai-outbound-calls", "ai-outbound"],
        ["lead-scraping", "lead-scraping-b2b"],
      ]),
    [],
  );

  const recommendedPlanIds = useMemo(() => {
    return Array.from(
      new Set(
        recommendedServiceSlugs
          .map((slug) => planIdsByRecommendedSlug.get(slug) || "")
          .filter(Boolean),
      ),
    ).slice(0, 6);
  }, [recommendedServiceSlugs, planIdsByRecommendedSlug]);

  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>(["core"]);
  const [planQuantities, setPlanQuantities] = useState<Record<string, number>>({});
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);

  const [referralCode, setReferralCode] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const normalizedCoupon = couponCode.trim().toUpperCase();
  const couponIsRichard = normalizedCoupon === "RICHARD";
  const couponIsBuild = normalizedCoupon === "BUILD";

  useEffect(() => {
    if (selectionTouched) return;
    setSelectedPlanIds(Array.from(new Set(["core", ...recommendedPlanIds])));
  }, [recommendedPlanIds, selectionTouched]);

  useEffect(() => {
    // BUILD coupon: free bundle access for testing.
    if (!couponIsBuild) return;
    setSelectionTouched(true);
    setSelectedPlanIds((prev) => Array.from(new Set(["core", "ai-receptionist", "reviews", ...prev])));
  }, [couponIsBuild]);

  useEffect(() => {
    // Keep quantities in sync with selection.
    setPlanQuantities((prev) => {
      const next: Record<string, number> = {};
      for (const id of selectedPlanIds) {
        const p = planById(id);
        if (!p?.quantityConfig) continue;
        next[id] = typeof prev[id] === "number" ? prev[id] : p.quantityConfig.default;
      }
      return next;
    });
  }, [selectedPlanIds]);

  function toggleGoal(id: string) {
    setGoalIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return Array.from(s);
    });
  }

  function togglePlan(id: string) {
    setSelectionTouched(true);

    setSelectedPlanIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        // Can't remove core.
        if (id !== "core") s.delete(id);
      } else {
        s.add(id);
        const p = planById(id);
        for (const req of p?.requires ?? []) s.add(req);
      }

      // Prevent selecting both lead scraping plans.
      if (id === "lead-scraping-b2b" && s.has("lead-scraping-b2c")) s.delete("lead-scraping-b2c");
      if (id === "lead-scraping-b2c" && s.has("lead-scraping-b2b")) s.delete("lead-scraping-b2b");

      // Always keep core.
      s.add("core");
      return Array.from(s);
    });

    const p = planById(id);
    if (p?.quantityConfig) {
      setPlanQuantities((prev) => ({
        ...prev,
        [id]: typeof prev[id] === "number" ? prev[id] : p.quantityConfig!.default,
      }));
    }
  }

  const selectedPlans = useMemo(
    () =>
      selectedPlanIds
        .map((id) => planById(id))
        .filter((p): p is NonNullable<ReturnType<typeof planById>> => Boolean(p)),
    [selectedPlanIds],
  );

  const upfrontPaidPlanIds = useMemo(
    () => selectedPlanIds.filter((id) => (ONBOARDING_UPFRONT_PAID_PLAN_IDS as readonly string[]).includes(id)),
    [selectedPlanIds],
  );

  const billablePlanIds = useMemo(() => {
    if (couponIsRichard) return [];
    if (couponIsBuild) return upfrontPaidPlanIds.filter((id) => id !== "ai-receptionist" && id !== "reviews");
    return upfrontPaidPlanIds;
  }, [couponIsRichard, couponIsBuild, upfrontPaidPlanIds]);

  const monthlyTotal = useMemo(() => monthlyTotalUsd(billablePlanIds, planQuantities), [billablePlanIds, planQuantities]);
  const oneTimeTotal = useMemo(() => oneTimeTotalUsd(billablePlanIds, planQuantities), [billablePlanIds, planQuantities]);
  const dueToday = monthlyTotal + oneTimeTotal;

  const selectedServiceSlugs = useMemo(() => {
    return Array.from(new Set(selectedPlans.flatMap((p) => p.serviceSlugsToActivate)));
  }, [selectedPlans]);

  const recommendedBundleId: PackagePreset = useMemo(() => {
    const s = new Set(normalizedGoals);

    if (s.has("content") || s.has("reviews")) return "brand-builder";
    if (s.has("appointments") || s.has("leads") || s.has("outbound") || s.has("receptionist")) return "sales-loop";
    if (callsPerMonthRange === "31_60" || callsPerMonthRange === "61_120" || callsPerMonthRange === "120_PLUS") return "sales-loop";
    if (hasWebsite === "NO" || s.has("unsure")) return "launch-kit";
    return "sales-loop";
  }, [normalizedGoals, callsPerMonthRange, hasWebsite]);

  const canGoNext = useMemo(() => {
    if (step === 0) return businessName.trim().length >= 2 && city.trim().length >= 2 && state.trim().length >= 2;
    if (step === 1) return true;
    if (step === 2) return billingPreference === "credits" || billingPreference === "subscription";
    if (step === 3) return billingPreference === "credits" ? true : selectedPlanIds.includes("core");
    if (step === 4) {
      return name.trim().length >= 2 && email.trim().length >= 3 && password.trim().length >= 8 && phone.trim().length >= 7;
    }
    return false;
  }, [billingPreference, businessName, city, email, name, password, phone, selectedPlanIds, state, step]);

  function goNext() {
    if (step === 2 && billingPreference === "credits") {
      setStep(4);
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  }

  function goBack() {
    if (step === 4 && billingPreference === "credits") {
      setStep(2);
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  }

  function submit() {
    onSubmit({
      name,
      email,
      phone,
      password,
      referralCode,
      businessName,
      city,
      state,
      websiteUrl,
      hasWebsite,
      callsPerMonthRange,
      acquisitionMethods,
      industry,
      businessModel,
      targetCustomer,
      brandVoice,
      goalIds: normalizedGoals,
      selectedPlanIds,
      selectedPlanQuantities: planQuantities,
      selectedServiceSlugs,
      couponCode,
      billingPreference,
      selectedBundleId,
    });
  }

  return (
    <View style={styles.form}>
      <View style={styles.stepperPillsRow}>
        {STEPS.map((label, index) => {
          const isActive = index === step;
          const isComplete = index < step;
          const isFuture = index > step;
          return (
            <Pressable
              key={label}
              onPress={() => {
                if (index > step) return;
                setStep(index);
              }}
              style={[
                styles.stepperPill,
                isActive ? styles.stepperPillActive : null,
                isComplete ? styles.stepperPillComplete : null,
                isFuture ? styles.stepperPillFuture : null,
              ]}
            >
              <Text
                numberOfLines={1}
                style={
                  isActive
                    ? styles.stepperPillTextActive
                    : isComplete
                      ? styles.stepperPillTextComplete
                      : styles.stepperPillTextFuture
                }
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {step === 0 ? (
        <View style={styles.stepPanel}>
          <Text style={styles.panelTitle}>Business basics</Text>
          <Text style={styles.panelSubtitle}>We use this to personalize your portal and recommendations.</Text>

          <Field label="Business name" required>
            <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} editable={!busy} />
          </Field>

          <View style={styles.twoColRow}>
            <View style={styles.twoColItem}>
              <Field label="City" required>
                <TextInput style={styles.input} value={city} onChangeText={setCity} editable={!busy} />
              </Field>
            </View>
            <View style={styles.twoColItem}>
              <Field label="State" required>
                <TextInput style={styles.input} value={state} onChangeText={setState} editable={!busy} />
              </Field>
            </View>
          </View>

          <Field label="Do you already have a website?">
            <View style={styles.chipRow}>
              {(["YES", "NO", "NOT_SURE"] as const).map((v) => (
                <Pressable
                  key={v}
                  style={[styles.chip, hasWebsite === v ? styles.chipSelected : null]}
                  onPress={() => setHasWebsite(v)}
                >
                  <Text style={hasWebsite === v ? styles.chipTextSelected : styles.chipText}>{v}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          {hasWebsite === "YES" ? (
            <Field label="Website URL">
              <TextInput style={styles.input} value={websiteUrl} onChangeText={setWebsiteUrl} editable={!busy} />
            </Field>
          ) : null}

          <PortalSingleSelectField
            label="About how many calls do you get per month?"
            value={callsPerMonthRange}
            options={CALLS_RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => setCallsPerMonthRange(v as CallsPerMonthRange)}
            searchable={false}
          />

          <PortalMultiSelectField
            label="How do people find you?"
            values={acquisitionMethods}
            options={ACQUISITION_OPTIONS}
            onChange={setAcquisitionMethods}
            searchable
            placeholder="Select channels"
          />

          <PortalSingleSelectField
            label="Industry"
            value={industry}
            options={INDUSTRY_OPTIONS}
            onChange={setIndustry}
            searchable
            placeholder="Select industry"
          />

          <PortalSingleSelectField
            label="Business model"
            value={businessModel}
            options={BUSINESS_MODEL_OPTIONS}
            onChange={setBusinessModel}
            searchable
            placeholder="Select model"
          />

          <Field label="Target customer">
            <TextInput
              style={styles.input}
              value={targetCustomer}
              onChangeText={setTargetCustomer}
              editable={!busy}
              placeholder="e.g., local service businesses in Austin"
            />
          </Field>

          <Field label="Brand voice">
            <TextInput
              style={styles.input}
              value={brandVoice}
              onChangeText={setBrandVoice}
              editable={!busy}
              placeholder="Friendly, professional, casual, etc."
            />
          </Field>

          <Field label="Referral code (optional)">
            <TextInput style={styles.input} value={referralCode} onChangeText={setReferralCode} editable={!busy} />
          </Field>

          <Pressable
            style={[styles.primaryButton, (!canGoNext || busy) ? styles.buttonDisabled : null]}
            onPress={() => canGoNext && !busy && goNext()}
            disabled={!canGoNext || busy}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.stepPanel}>
          <Text style={styles.panelTitle}>Top goals</Text>
          <Text style={styles.panelSubtitle}>Pick a few. We’ll recommend services based on these.</Text>

          <View style={styles.chipRowWrap}>
            {GET_STARTED_GOALS.map((g) => (
              <Pressable
                key={g.id}
                style={[styles.chip, goalIds.includes(g.id) ? styles.chipSelected : null]}
                onPress={() => toggleGoal(g.id)}
              >
                <Text style={goalIds.includes(g.id) ? styles.chipTextSelected : styles.chipText}>{g.label}</Text>
              </Pressable>
            ))}
          </View>

          <StepButtons
            onBack={() => setStep(0)}
            onNext={goNext}
            nextDisabled={busy}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.stepPanel}>
          <Text style={styles.panelTitle}>Plan</Text>
          <Text style={styles.panelSubtitle}>Choose how you want to start.</Text>

          <Text style={styles.sectionTitle}>Billing preference</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, billingPreference === "credits" ? styles.chipSelected : null]}
              onPress={() => setBillingPreference("credits")}
            >
              <Text style={billingPreference === "credits" ? styles.chipTextSelected : styles.chipText}>Credits (start free)</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, billingPreference === "subscription" ? styles.chipSelected : null]}
              onPress={() => setBillingPreference("subscription")}
            >
              <Text style={billingPreference === "subscription" ? styles.chipTextSelected : styles.chipText}>Subscription</Text>
            </Pressable>
          </View>

          {billingPreference === "subscription" ? (
            <View style={styles.bundleBox}>
              <Text style={styles.bundleTitle}>Bundles</Text>
              <Text style={styles.bundleSubtitle}>
                Based on your answers, we recommend <Text style={styles.bold}>{bundleTitle(recommendedBundleId)}</Text>.
              </Text>

              <View style={{ gap: 10, marginTop: 10 }}>
                {(["launch-kit", "sales-loop", "brand-builder"] as const).map((id) => {
                  const checked = selectedBundleId === id;
                  const isRecommended = recommendedBundleId === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => {
                        setBillingPreference("subscription");
                        setSelectionTouched(true);
                        setSelectedBundleId(id);
                        setSelectedPlanIds(bundlePlanIds(id));
                      }}
                      style={[styles.bundleCard, checked ? styles.bundleCardChecked : null]}
                    >
                      <View style={styles.bundleCardTopRow}>
                        <Text style={styles.bundleCardTitle}>{bundleTitle(id)}</Text>
                        {isRecommended ? <Text style={styles.recommendedPill}>Recommended</Text> : null}
                      </View>
                      <Text style={styles.bundleCardDesc}>
                        Includes: {bundlePlanIds(id).map((pid) => planById(pid)?.title || pid).join(", ")}
                      </Text>
                      {checked ? <Text style={styles.bundleSelected}>Selected</Text> : null}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.tinyMuted}>You can fine-tune services on the next step.</Text>
            </View>
          ) : (
            <View style={styles.bundleBoxMuted}>
              <Text style={styles.bundleTitle}>We’ll start you free</Text>
              <Text style={styles.bundleSubtitle}>You can pick services anytime inside your portal.</Text>
            </View>
          )}

          <StepButtons onBack={() => setStep(1)} onNext={goNext} nextDisabled={busy} />
        </View>
      ) : null}

      {step === 3 ? (
        billingPreference === "subscription" ? (
          <View style={styles.stepPanel}>
            <Text style={styles.panelTitle}>Services</Text>
            <Text style={styles.panelSubtitle}>We recommend a starting set. You can change this anytime.</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Coupon code</Text>
              <Text style={styles.tinyMuted}>You can also enter a promo code at checkout.</Text>
              <TextInput
                style={styles.input}
                value={couponCode}
                onChangeText={setCouponCode}
                placeholder="Enter code"
                editable={!busy}
                autoCapitalize="characters"
              />
              {couponIsRichard ? <Text style={styles.goodText}>RICHARD applied; everything is free for testing.</Text> : null}
              {couponIsBuild ? <Text style={styles.goodText}>BUILD applied; free bundle enabled (Core + AI Receptionist + Reviews).</Text> : null}
            </View>

            <View style={[styles.card, { backgroundColor: "#fafafa" }]}>
              <View style={styles.planRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Core Portal</Text>
                  <Text style={styles.muted}>Includes Inbox/Outbox, Media Library, Tasks, and Reporting.</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.cardTitle}>{moneyLabel(39)}</Text>
                  <Text style={styles.tinyMuted}>Required</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Recommended</Text>
            <View style={{ gap: 10 }}>
              {(recommendedPlanIds.length ? recommendedPlanIds : ["automations"]).map((id) => {
                const p = planById(id);
                if (!p) return null;
                const checked = selectedPlanIds.includes(id);
                const qty = planQuantity(p, planQuantities);
                const buildFree = couponIsBuild && (id === "ai-receptionist" || id === "reviews");

                return (
                  <Pressable
                    key={id}
                    onPress={() => togglePlan(id)}
                    disabled={couponIsBuild && (id === "ai-receptionist" || id === "reviews")}
                    style={[styles.planCard, checked ? styles.planCardChecked : null]}
                  >
                    <View style={styles.planRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{p.title}</Text>
                        <Text style={styles.muted}>{p.description}</Text>
                        {checked && p.quantityConfig ? (
                          <View style={styles.qtyRow}>
                            <Text style={styles.qtyLabel}>{p.quantityConfig.label}</Text>
                            <TextInput
                              style={styles.qtyInput}
                              value={String(qty)}
                              onChangeText={(t) => {
                                const n = Number(t);
                                setSelectionTouched(true);
                                setPlanQuantities((prev) => ({ ...prev, [p.id]: Number.isFinite(n) ? n : prev[p.id] }));
                              }}
                              keyboardType={Platform.OS === "web" ? ("default" as any) : "number-pad"}
                            />
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.cardTitle}>{buildFree ? "$0/mo" : moneyLabel(p.monthlyUsd)}</Text>
                        {p.oneTimeUsd && !buildFree ? (
                          <Text style={styles.tinyMuted}>+{formatUsd(p.oneTimeUsd, { maximumFractionDigits: 0 })} setup</Text>
                        ) : null}
                        <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.outlineBtn, showAllServices ? styles.outlineBtnAlt : styles.outlineBtnPrimary]}
              onPress={() => setShowAllServices((v) => !v)}
            >
              <Text style={[styles.outlineBtnText, showAllServices ? styles.outlineBtnTextAlt : styles.outlineBtnTextPrimary]}>
                {showAllServices ? "Hide all services" : "See all services"}
              </Text>
              <Text style={[styles.outlineBtnText, showAllServices ? styles.outlineBtnTextAlt : styles.outlineBtnTextPrimary]}>
                {showAllServices ? "▴" : "▾"}
              </Text>
            </Pressable>

            {showAllServices ? (
              <View style={{ gap: 10 }}>
                {PORTAL_ONBOARDING_PLANS.filter((p) => p.id !== "core").map((p) => {
                  const checked = selectedPlanIds.includes(p.id);
                  const qty = planQuantity(p, planQuantities);
                  const buildFree = couponIsBuild && (p.id === "ai-receptionist" || p.id === "reviews");

                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => togglePlan(p.id)}
                      disabled={couponIsBuild && (p.id === "ai-receptionist" || p.id === "reviews")}
                      style={[styles.planCard, checked ? styles.planCardChecked : null]}
                    >
                      <View style={styles.planRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{p.title}</Text>
                          <Text style={styles.muted}>{p.description}</Text>
                          {checked && p.quantityConfig ? (
                            <View style={styles.qtyRow}>
                              <Text style={styles.qtyLabel}>{p.quantityConfig.label}</Text>
                              <TextInput
                                style={styles.qtyInput}
                                value={String(qty)}
                                onChangeText={(t) => {
                                  const n = Number(t);
                                  setSelectionTouched(true);
                                  setPlanQuantities((prev) => ({ ...prev, [p.id]: Number.isFinite(n) ? n : prev[p.id] }));
                                }}
                                keyboardType={Platform.OS === "web" ? ("default" as any) : "number-pad"}
                              />
                            </View>
                          ) : null}
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.cardTitle}>{buildFree ? "$0/mo" : moneyLabel(p.monthlyUsd)}</Text>
                          {p.oneTimeUsd && !buildFree ? (
                            <Text style={styles.tinyMuted}>+{formatUsd(p.oneTimeUsd, { maximumFractionDigits: 0 })} setup</Text>
                          ) : null}
                          <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]} />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: "#fafafa" }]}>
              <View style={styles.totalsRow}>
                <Text style={styles.cardTitle}>Due today</Text>
                <Text style={styles.cardTitle}>{formatUsd(dueToday, { maximumFractionDigits: 0 })}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.tinyMutedBold}>Monthly thereafter</Text>
                <Text style={styles.tinyMutedBold}>{formatUsd(monthlyTotal, { maximumFractionDigits: 0 })}/mo</Text>
              </View>
              {oneTimeTotal > 0 ? (
                <Text style={styles.tinyMuted}>
                  Includes {formatUsd(oneTimeTotal, { maximumFractionDigits: 0 })} in one-time setup fees.
                </Text>
              ) : null}
            </View>

            <StepButtons onBack={goBack} onNext={goNext} nextDisabled={busy || !canGoNext} />
          </View>
        ) : (
          <View style={styles.stepPanel}>
            <View style={styles.bundleBoxMuted}>
              <Text style={styles.bundleTitle}>No monthly services needed</Text>
              <Text style={styles.bundleSubtitle}>You’re starting free. You can pick services anytime inside your portal.</Text>
            </View>
            <StepButtons onBack={goBack} onNext={goNext} nextDisabled={busy} />
          </View>
        )
      ) : null}

      {step === 4 ? (
        <View style={styles.stepPanel}>
          <Text style={styles.panelTitle}>Create your account</Text>
          <Text style={styles.panelSubtitle}>
            {billingPreference === "subscription" ? "You’ll activate services after checkout." : "You’ll start free and activate services."}
          </Text>

          <Field label="Name" required>
            <TextInput style={styles.input} value={name} onChangeText={setName} editable={!busy} />
          </Field>

          <Field label="Email" required>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!busy}
            />
          </Field>

          <Field label="Phone" required>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              editable={!busy}
              placeholder="(555) 555-5555"
              keyboardType={Platform.OS === "web" ? ("default" as any) : "phone-pad"}
            />
          </Field>

          <Field label="Password" required>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={!busy}
            />
            <Text style={styles.tinyMuted}>Minimum 8 characters.</Text>
          </Field>

          <Pressable
            style={[styles.primaryButton, (busy || !canGoNext) ? styles.buttonDisabled : null]}
            onPress={submit}
            disabled={busy || !canGoNext}
          >
            <Text style={styles.primaryButtonText}>
              {busy
                ? "Continuing…"
                : billingPreference === "subscription"
                  ? "Create account and checkout"
                  : "Create account and start free"}
            </Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={goBack} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>
        {label}
        {required ? requiredMark() : null}
      </Text>
      {children}
    </View>
  );
}

function StepButtons({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <View style={styles.stepButtonsRow}>
      <Pressable style={styles.secondaryBtn} onPress={onBack}>
        <Text style={styles.secondaryBtnText}>Back</Text>
      </Pressable>
      <Pressable style={[styles.primaryBtn, nextDisabled ? styles.buttonDisabled : null]} onPress={onNext} disabled={nextDisabled}>
        <Text style={styles.primaryBtnText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 24, gap: 16 },

  label: { fontSize: 16, fontWeight: "600", color: ZINC_900 },
  required: { color: "#ec4899", fontWeight: "800" },
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
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },

  primaryButton: {
    width: "100%",
    backgroundColor: BRAND_INK,
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  primaryButtonText: { fontSize: 16, fontWeight: "800", color: "#ffffff" },
  buttonDisabled: { opacity: 0.6 },

  stepperPillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  stepperPill: {
    flexGrow: 1,
    flexBasis: "48%",
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  stepperPillActive: { backgroundColor: BRAND_INK, borderColor: BRAND_INK },
  stepperPillComplete: { backgroundColor: "#fafafa", borderColor: ZINC_200 },
  stepperPillFuture: { backgroundColor: "#ffffff", borderColor: ZINC_200 },
  stepperPillTextActive: { fontSize: 12, fontWeight: "800", color: "#ffffff" },
  stepperPillTextComplete: { fontSize: 12, fontWeight: "800", color: "#3f3f46" },
  stepperPillTextFuture: { fontSize: 12, fontWeight: "800", color: "#a1a1aa" },

  stepPanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ZINC_200,
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 14,
  },
  panelTitle: { fontSize: 14, fontWeight: "800", color: ZINC_900 },
  panelSubtitle: { fontSize: 14, color: ZINC_600, marginTop: -8 },

  twoColRow: { flexDirection: "row", gap: 12 },
  twoColItem: { flex: 1 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
  },
  chipSelected: {
    backgroundColor: BRAND_INK,
    borderColor: BRAND_INK,
  },
  chipText: { color: ZINC_600, fontSize: 14, fontWeight: "700" },
  chipTextSelected: { color: "#ffffff", fontSize: 14, fontWeight: "700" },

  stepButtonsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 12 },
  secondaryBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  secondaryBtnText: { fontSize: 16, fontWeight: "700", color: ZINC_900 },
  primaryBtn: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: BRAND_INK,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { fontSize: 16, fontWeight: "800", color: "#ffffff" },

  secondaryButton: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ZINC_200,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#ffffff",
    marginTop: 12,
  },
  secondaryButtonText: { fontSize: 16, fontWeight: "700", color: ZINC_900 },

  sectionTitle: { fontSize: 12, fontWeight: "800", color: ZINC_600, marginTop: 6 },

  bundleBox: { borderRadius: 20, borderWidth: 1, borderColor: ZINC_200, padding: 14, backgroundColor: "#fff", gap: 6 },
  bundleBoxMuted: { borderRadius: 20, borderWidth: 1, borderColor: ZINC_200, padding: 14, backgroundColor: "#fafafa", gap: 6 },
  bundleTitle: { fontSize: 14, fontWeight: "800", color: ZINC_900 },
  bundleSubtitle: { fontSize: 14, color: ZINC_600 },
  bold: { fontWeight: "800", color: ZINC_900 },
  bundleCard: { borderRadius: 16, borderWidth: 1, borderColor: ZINC_200, padding: 12, backgroundColor: "#fff", gap: 6 },
  bundleCardChecked: { borderColor: BRAND_INK, backgroundColor: "#fafafa" },
  bundleCardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  bundleCardTitle: { fontSize: 14, fontWeight: "800", color: ZINC_900 },
  recommendedPill: { backgroundColor: "#059669", color: "#fff", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: "800" },
  bundleCardDesc: { fontSize: 12, color: ZINC_600 },
  bundleSelected: { fontSize: 12, fontWeight: "800", color: ZINC_600 },
  tinyMuted: { fontSize: 12, color: ZINC_600, marginTop: 8 },

  card: { borderRadius: 16, borderWidth: 1, borderColor: ZINC_200, padding: 14, backgroundColor: "#fff", gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: ZINC_900 },
  muted: { fontSize: 13, color: ZINC_600 },
  goodText: { fontSize: 12, fontWeight: "800", color: "#047857" },

  planCard: { borderRadius: 16, borderWidth: 1, borderColor: ZINC_200, padding: 14, backgroundColor: "#fff" },
  planCardChecked: { borderColor: "#bbf7d0", backgroundColor: "#ecfdf5" },
  planRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  checkbox: { height: 16, width: 16, borderRadius: 4, borderWidth: 1, borderColor: "#d4d4d8", backgroundColor: "#fff", marginTop: 10 },
  checkboxChecked: { borderColor: "#10b981", backgroundColor: "#10b981" },

  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  qtyLabel: { fontSize: 12, fontWeight: "800", color: ZINC_600, flex: 1 },
  qtyInput: { width: 90, borderRadius: 12, borderWidth: 1, borderColor: ZINC_200, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: "#fff" },

  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  outlineBtnPrimary: { borderColor: "#3b82f6", backgroundColor: "#3b82f6" },
  outlineBtnAlt: { borderColor: ZINC_200, backgroundColor: "#fff" },
  outlineBtnText: { fontSize: 14, fontWeight: "900" },
  outlineBtnTextPrimary: { color: "#fff" },
  outlineBtnTextAlt: { color: BRAND_INK },

  totalsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tinyMutedBold: { fontSize: 12, fontWeight: "900", color: ZINC_600 },
});
