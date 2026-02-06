"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbox, type LightboxImage } from "@/components/Lightbox";

type Destination = { id: string; label: string; url: string };

type QuestionKind = "short" | "long" | "single_choice" | "multiple_choice";

type PublicQuestion = {
  id: string;
  label: string;
  required: boolean;
  kind: QuestionKind;
  options?: string[];
};

type PublicFormConfig = {
  version: 1;
  email: { enabled: boolean; required: boolean };
  phone: { enabled: boolean; required: boolean };
  questions: PublicQuestion[];
};

type Review = {
  id: string;
  rating: number;
  name: string;
  body: string | null;
  photoUrls: unknown;
  businessReply?: string | null;
  businessReplyAt?: string | null;
  createdAt: string;
};

type AnsweredQuestion = {
  id: string;
  name: string;
  question: string;
  answer: string;
  answeredAt: string | null;
};

const MAX_PHOTOS = 25;

export function PublicReviewsClient({
  siteHandle,
  businessName,
  brandPrimary,
  destinations,
  galleryEnabled,
  thankYouMessage,
  formConfig,
  initialReviews,
  initialQuestions,
}: {
  siteHandle: string;
  businessName: string;
  brandPrimary: string;
  destinations: Destination[];
  galleryEnabled: boolean;
  thankYouMessage: string;
  formConfig?: unknown;
  initialReviews: Review[];
  initialQuestions: AnsweredQuestion[];
}) {
  const router = useRouter();

  const fileInputId = useId();

  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [qName, setQName] = useState("");
  const [qText, setQText] = useState("");
  const [qBusy, setQBusy] = useState(false);
  const [qStatus, setQStatus] = useState<string | null>(null);
  const [qError, setQError] = useState<string | null>(null);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const photoPreviews = useMemo(() => photos.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [photos]);

  const parsedForm = useMemo((): PublicFormConfig => {
    const base: PublicFormConfig = {
      version: 1,
      email: { enabled: false, required: false },
      phone: { enabled: false, required: false },
      questions: [],
    };

    if (!formConfig || typeof formConfig !== "object" || Array.isArray(formConfig)) return base;
    const rec = formConfig as Record<string, unknown>;
    const emailRaw = rec.email && typeof rec.email === "object" && !Array.isArray(rec.email) ? (rec.email as any) : null;
    const phoneRaw = rec.phone && typeof rec.phone === "object" && !Array.isArray(rec.phone) ? (rec.phone as any) : null;
    const questionsRaw = Array.isArray(rec.questions) ? (rec.questions as unknown[]) : [];

    const questions: PublicQuestion[] = questionsRaw
      .flatMap((q) => {
        if (!q || typeof q !== "object" || Array.isArray(q)) return [] as PublicQuestion[];
        const r = q as Record<string, unknown>;
        const id = typeof r.id === "string" ? r.id.trim().slice(0, 50) : "";
        const label = typeof r.label === "string" ? r.label.trim().slice(0, 120) : "";
        if (!id || !label) return [] as PublicQuestion[];
        const required = typeof r.required === "boolean" ? r.required : false;
        const kind: QuestionKind =
          r.kind === "short" || r.kind === "long" || r.kind === "single_choice" || r.kind === "multiple_choice" ? (r.kind as any) : "short";
        const options = Array.isArray(r.options)
          ? (r.options as unknown[]).flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim().slice(0, 80)] : [])).slice(0, 12)
          : [];
        if ((kind === "single_choice" || kind === "multiple_choice") && options.length === 0) return [] as PublicQuestion[];
        return [{ id, label, required, kind, ...(options.length ? { options } : {}) }];
      })
      .slice(0, 25);

    return {
      version: 1,
      email: {
        enabled: typeof emailRaw?.enabled === "boolean" ? emailRaw.enabled : base.email.enabled,
        required: typeof emailRaw?.required === "boolean" ? emailRaw.required : base.email.required,
      },
      phone: {
        enabled: typeof phoneRaw?.enabled === "boolean" ? phoneRaw.enabled : base.phone.enabled,
        required: typeof phoneRaw?.required === "boolean" ? phoneRaw.required : base.phone.required,
      },
      questions,
    };
  }, [formConfig]);

  const normalizedQuestions = parsedForm.questions;

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function getAnswerString(questionId: string) {
    const v = answers[questionId];
    return typeof v === "string" ? v : "";
  }

  function getAnswerArray(questionId: string) {
    const v = answers[questionId];
    return Array.isArray(v) ? (v as string[]).filter((x) => typeof x === "string") : [];
  }

  const allReviewPhotoUrls = useMemo(() => {
    const out: string[] = [];
    for (const r of initialReviews) {
      const urls = Array.isArray(r.photoUrls) ? (r.photoUrls as string[]) : [];
      for (const u of urls) {
        if (typeof u !== "string") continue;
        const v = u.trim();
        if (!v) continue;
        if (!out.includes(v)) out.push(v);
        if (out.length >= 80) break;
      }
      if (out.length >= 80) break;
    }
    return out;
  }, [initialReviews]);

  function openLightbox(urls: string[], startIndex: number) {
    const images = urls
      .flatMap((u) => {
        const v = typeof u === "string" ? u.trim() : "";
        return v ? ([{ src: v }] as LightboxImage[]) : ([] as LightboxImage[]);
      })
      .slice(0, 200);
    if (!images.length) return;
    setLightboxImages(images);
    setLightboxIndex(Math.max(0, Math.min(images.length - 1, Math.floor(startIndex || 0))));
    setLightboxOpen(true);
  }

  useEffect(() => {
    return () => {
      for (const p of photoPreviews) URL.revokeObjectURL(p.url);
    };
  }, [photoPreviews]);

  async function submit() {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      if (parsedForm.email.enabled && parsedForm.email.required && !email.trim()) throw new Error("Email is required");
      if (parsedForm.phone.enabled && parsedForm.phone.required && !phone.trim()) throw new Error("Phone is required");

      for (const q of normalizedQuestions) {
        if (!q.required) continue;
        if (q.kind === "multiple_choice") {
          if (getAnswerArray(q.id).length === 0) throw new Error(`“${q.label}” is required`);
          continue;
        }
        const v = answers[q.id];
        const s = typeof v === "string" ? v.trim() : "";
        if (!s) throw new Error(`“${q.label}” is required`);
      }

      const form = new FormData();
      form.append("name", name);
      form.append("rating", String(rating));
      form.append("body", body);
      if (parsedForm.email.enabled) form.append("email", email);
      if (parsedForm.phone.enabled) form.append("phone", phone);
      if (normalizedQuestions.length) form.append("answers", JSON.stringify(answers));
      for (const f of photos.slice(0, MAX_PHOTOS)) form.append("photos", f);

      const res = await fetch(`/api/public/reviews/${siteHandle}/submit`, { method: "POST", body: form });
      const text = await res.text().catch(() => "");
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const rec = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
      if (!res.ok || !rec?.ok) throw new Error((typeof rec?.error === "string" ? rec.error : null) || `Failed to submit (HTTP ${res.status})`);

      setStatus((thankYouMessage || "Thanks — your review was submitted.").trim());
      setName("");
      setRating(5);
      setBody("");
      setEmail("");
      setPhone("");
      setAnswers({});
      setPhotos([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitQuestion() {
    setQBusy(true);
    setQStatus(null);
    setQError(null);
    try {
      const nameTrim = qName.trim();
      const questionTrim = qText.trim();
      if (!nameTrim) throw new Error("Name is required");
      if (!questionTrim) throw new Error("Question is required");

      const res = await fetch(`/api/public/reviews/${siteHandle}/questions/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameTrim, question: questionTrim }),
      });
      const text = await res.text().catch(() => "");
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const rec = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
      if (!res.ok || !rec?.ok) throw new Error((typeof rec?.error === "string" ? rec.error : null) || `Failed (HTTP ${res.status})`);

      setQStatus("Thanks — your question was sent.");
      setQName("");
      setQText("");
    } catch (err) {
      setQError(err instanceof Error ? err.message : String(err));
    } finally {
      setQBusy(false);
    }
  }

  return (
    <>
      <Lightbox
        open={lightboxOpen}
        images={lightboxImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />

      <div className="space-y-6">
        {galleryEnabled && allReviewPhotoUrls.length ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">Photos</div>
            <div className="mt-2 text-sm text-zinc-600">Real photos from customer reviews.</div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {allReviewPhotoUrls.slice(0, 30).map((u, i) => (
                <button
                  key={`${u}_${i}`}
                  type="button"
                  className="aspect-square overflow-hidden rounded-2xl bg-zinc-100"
                  onClick={() => openLightbox(allReviewPhotoUrls, i)}
                  aria-label="Open photo"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            {allReviewPhotoUrls.length > 30 ? (
              <button
                type="button"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                onClick={() => openLightbox(allReviewPhotoUrls, 0)}
              >
                View all photos
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
        <div className="font-brand text-2xl" style={{ color: "var(--client-text)" }}>
          leave a review
        </div>
        <div className="mt-2 text-sm text-zinc-600">Share your experience.</div>

        {error ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {status ? <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div> : null}

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-semibold text-zinc-600">Your name</label>
          <input
            className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300 focus:ring-2 focus:ring-[color:rgba(29,78,216,0.10)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane"
            disabled={busy}
          />

          {parsedForm.email.enabled ? (
            <>
              <label className="text-xs font-semibold text-zinc-600">
                Email{parsedForm.email.required ? " *" : ""}
              </label>
              <input
                className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300 focus:ring-2 focus:ring-[color:rgba(29,78,216,0.10)]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                disabled={busy}
                inputMode="email"
              />
            </>
          ) : null}

          {parsedForm.phone.enabled ? (
            <>
              <label className="text-xs font-semibold text-zinc-600">
                Phone{parsedForm.phone.required ? " *" : ""}
              </label>
              <input
                className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300 focus:ring-2 focus:ring-[color:rgba(29,78,216,0.10)]"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                disabled={busy}
                inputMode="tel"
              />
            </>
          ) : null}

          <div>
            <div className="text-xs font-semibold text-zinc-600">Rating</div>
            <div className="mt-2 flex items-center gap-2">
              {Array.from({ length: 5 }).map((_, i) => {
                const v = i + 1;
                const on = v <= rating;
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={busy}
                    className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 text-xl transition hover:bg-zinc-50"
                    onClick={() => setRating(v)}
                    aria-label={`${v} star`}
                    style={
                      on
                        ? { backgroundColor: brandPrimary, borderColor: "transparent", color: "white" }
                        : { backgroundColor: "white", color: "#52525b" }
                    }
                  >
                    ★
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-600">Review</label>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300 focus:ring-2 focus:ring-[color:rgba(29,78,216,0.10)]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did you like?"
              disabled={busy}
            />
          </div>

          {normalizedQuestions.length ? (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-zinc-600">Additional questions</div>
              {normalizedQuestions.map((q) => (
                <div key={q.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">
                    {q.label}{q.required ? " *" : ""}
                  </div>

                  {q.kind === "long" ? (
                    <textarea
                      className="mt-2 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300 focus:ring-2 focus:ring-[color:rgba(29,78,216,0.10)]"
                      disabled={busy}
                      value={getAnswerString(q.id)}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Write your answer…"
                    />
                  ) : q.kind === "single_choice" ? (
                    <div className="mt-3 grid gap-2">
                      {(q.options || []).map((opt) => {
                        const current = getAnswerString(q.id);
                        const selected = current === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={busy}
                            onClick={() => setAnswer(q.id, opt)}
                            className={
                              "w-full rounded-2xl border px-4 py-3 text-left text-sm transition " +
                              (selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50")
                            }
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : q.kind === "multiple_choice" ? (
                    <div className="mt-3 grid gap-2">
                      {(q.options || []).map((opt) => {
                        const current = getAnswerArray(q.id);
                        const selected = current.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const next = selected ? current.filter((x) => x !== opt) : [...current, opt];
                              setAnswer(q.id, next);
                            }}
                            className={
                              "w-full rounded-2xl border px-4 py-3 text-left text-sm transition " +
                              (selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50")
                            }
                          >
                            {selected ? "✓ " : ""}{opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      className="mt-2 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-zinc-300 focus:ring-2 focus:ring-[color:rgba(29,78,216,0.10)]"
                      disabled={busy}
                      value={getAnswerString(q.id)}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder="Type your answer…"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div>
            <div className="text-xs font-semibold text-zinc-600">Photos (optional)</div>
            <input
              id={fileInputId}
              type="file"
              multiple
              accept="image/*"
              disabled={busy}
              className="hidden"
              onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, MAX_PHOTOS))}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label
                htmlFor={fileInputId}
                className={
                  "inline-flex h-10 cursor-pointer items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 " +
                  (busy ? "pointer-events-none opacity-60" : "")
                }
              >
                Choose files
              </label>
              <div className="text-sm text-zinc-500">{photos.length ? `${photos.length} selected` : "No files chosen"}</div>
            </div>
            {photoPreviews.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {photoPreviews.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <button
                    key={p.url}
                    type="button"
                    className="h-20 w-20 overflow-hidden rounded-xl"
                    onClick={() => openLightbox(photoPreviews.map((x) => x.url), photoPreviews.findIndex((x) => x.url === p.url))}
                    aria-label="Open photo"
                  >
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
            className="mt-2 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: brandPrimary }}
          >
            {busy ? "Submitting…" : "Submit review"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Q&amp;A</div>
          <div className="mt-2 text-sm text-zinc-600">Ask a question and see answers from {businessName}.</div>

          {initialQuestions.length ? (
            <div className="mt-4 space-y-3">
              {initialQuestions.slice(0, 12).map((q) => (
                <div key={q.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-xs font-semibold text-zinc-700">Q: {q.question}</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{q.answer}</div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Answered by {businessName}
                    {q.answeredAt ? ` • ${new Date(q.answeredAt).toLocaleDateString()}` : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No answered questions yet.</div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-zinc-700">Your name</div>
                <input
                  className="mt-1 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm"
                  value={qName}
                  onChange={(e) => setQName(e.target.value)}
                  placeholder="Jane"
                />
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-700">Question</div>
              <textarea
                className="mt-1 min-h-[90px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm"
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder="Ask something about services, availability, pricing, etc."
              />
            </div>

            {qError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{qError}</div> : null}
            {qStatus ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{qStatus}</div> : null}

            <button
              type="button"
              disabled={qBusy}
              onClick={() => void submitQuestion()}
              className="inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              style={{ backgroundColor: brandPrimary }}
            >
              {qBusy ? "Sending…" : "Ask question"}
            </button>
          </div>
        </div>

        {destinations.length ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">Other review sites</div>
            <div className="mt-2 text-sm text-zinc-600">You can also leave a review on these platforms.</div>
            <div className="mt-4 grid grid-cols-1 gap-3">
              {destinations.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-4 hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">{d.label}</div>
                    <div className="truncate text-xs text-zinc-500">{d.url}</div>
                  </div>
                  <div className="text-sm font-semibold" style={{ color: brandPrimary }}>
                    Open
                  </div>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Recent reviews</div>
          <div className="mt-4 space-y-3">
            {initialReviews.length === 0 ? <div className="text-sm text-zinc-600">No reviews yet.</div> : null}
            {initialReviews.slice(0, 30).map((r) => {
              const rr = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
              const urls = Array.isArray(r.photoUrls) ? (r.photoUrls as string[]) : [];
              return (
                <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{r.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="text-sm" style={{ color: brandPrimary }}>
                      {"★".repeat(rr)}
                      <span className="text-zinc-300">{"★".repeat(5 - rr)}</span>
                    </div>
                  </div>
                  {r.body ? <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{r.body}</div> : null}

                  {r.businessReply ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-semibold text-zinc-700">Response from {businessName}</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{r.businessReply}</div>
                      {r.businessReplyAt ? (
                        <div className="mt-2 text-xs text-zinc-500">{new Date(r.businessReplyAt).toLocaleDateString()}</div>
                      ) : null}
                    </div>
                  ) : null}

                  {urls.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {urls.slice(0, 6).map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <button
                          key={u}
                          type="button"
                          className="h-20 w-20 overflow-hidden rounded-xl"
                          onClick={() => openLightbox(urls, urls.indexOf(u))}
                          aria-label="Open photo"
                        >
                          <img src={u} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
        </div>
      </div>
    </>
  );
}
