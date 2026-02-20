"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ContactLite = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type CreditPullLite = {
  id: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  provider: string;
  requestedAt: string;
  completedAt: string | null;
  error: string | null;
  contactId: string;
};

type LetterLite = {
  id: string;
  status: "DRAFT" | "GENERATED" | "SENT";
  subject: string;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  sentAt: string | null;
  lastSentTo: string | null;
  contactId: string;
  creditPullId: string | null;
  contact: ContactLite;
};

type LetterFull = LetterLite & {
  bodyText: string;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !json) {
    const msg = (json as any)?.error ? String((json as any).error) : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export default function DisputeLettersClient() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const [pulls, setPulls] = useState<CreditPullLite[]>([]);
  const [selectedPullId, setSelectedPullId] = useState<string>("");

  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [disputesText, setDisputesText] = useState<string>("");

  const [letters, setLetters] = useState<LetterLite[]>([]);
  const [selectedLetterId, setSelectedLetterId] = useState<string>("");
  const [letterDraftSubject, setLetterDraftSubject] = useState<string>("");
  const [letterDraftBody, setLetterDraftBody] = useState<string>("");

  const selectedLetter = useMemo(() => letters.find((l) => l.id === selectedLetterId) || null, [letters, selectedLetterId]);

  const loadContacts = useCallback(async (q: string) => {
    const url = `/credit/api/contacts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
    const json = await fetchJson<{ ok: true; contacts: Array<any> }>(url);
    const next: ContactLite[] = (json.contacts || []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name || ""),
      email: c.email ? String(c.email) : null,
      phone: c.phone ? String(c.phone) : null,
    }));
    setContacts(next);
    setSelectedContactId((prev) => prev || next[0]?.id || "");
  }, []);

  const loadLetters = useCallback(async (contactId: string) => {
    const url = `/credit/api/disputes${contactId ? `?contactId=${encodeURIComponent(contactId)}` : ""}`;
    const json = await fetchJson<{ ok: true; letters: LetterLite[] }>(url);
    setLetters(json.letters || []);
  }, []);

  const loadPulls = useCallback(async (contactId: string) => {
    const url = `/credit/api/credit-pulls${contactId ? `?contactId=${encodeURIComponent(contactId)}` : ""}`;
    const json = await fetchJson<{ ok: true; pulls: CreditPullLite[] }>(url);
    setPulls(json.pulls || []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setError(null);
    void (async () => {
      try {
        await loadContacts("");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load contacts");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadContacts]);

  useEffect(() => {
    if (!selectedContactId) return;
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        await Promise.all([loadLetters(selectedContactId), loadPulls(selectedContactId)]);
        if (cancelled) return;
        setSelectedLetterId("");
        setSelectedPullId("");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load" );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadLetters, loadPulls, selectedContactId]);

  useEffect(() => {
    if (!selectedLetterId) return;
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const json = await fetchJson<{ ok: true; letter: LetterFull }>(`/credit/api/disputes/${encodeURIComponent(selectedLetterId)}`);
        if (cancelled) return;
        setLetterDraftSubject(json.letter.subject || "");
        setLetterDraftBody(json.letter.bodyText || "");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load letter" );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedLetterId]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId],
  );

  const generateLetter = async () => {
    if (!selectedContactId) return;
    setBusy(true);
    setError(null);
    try {
      const json = await fetchJson<{ ok: true; letter: LetterFull }>("/credit/api/disputes", {
        method: "POST",
        body: JSON.stringify({
          contactId: selectedContactId,
          recipientName: recipientName.trim() || undefined,
          recipientAddress: recipientAddress.trim() || undefined,
          disputesText: disputesText.trim(),
          creditPullId: selectedPullId || undefined,
        }),
      });
      await loadLetters(selectedContactId);
      setSelectedLetterId(json.letter.id);
      setLetterDraftSubject(json.letter.subject || "");
      setLetterDraftBody(json.letter.bodyText || "");
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to generate");
    } finally {
      setBusy(false);
    }
  };

  const pullCredit = async () => {
    if (!selectedContactId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson<{ ok: true }>("/credit/api/credit-pulls", {
        method: "POST",
        body: JSON.stringify({ contactId: selectedContactId }),
      });
      await loadPulls(selectedContactId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to pull credit");
    } finally {
      setBusy(false);
    }
  };

  const saveLetter = async () => {
    if (!selectedLetterId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson<{ ok: true; letter: LetterFull }>(`/credit/api/disputes/${encodeURIComponent(selectedLetterId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          subject: letterDraftSubject.trim(),
          bodyText: letterDraftBody,
        }),
      });
      await loadLetters(selectedContactId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const sendLetter = async () => {
    if (!selectedLetterId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson<{ ok: true }>(`/credit/api/disputes/${encodeURIComponent(selectedLetterId)}/send`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadLetters(selectedContactId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credit</div>
            <h1 className="text-2xl font-bold">Dispute letter generator</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Select a contact, generate a dispute letter with AI, edit it, then email it to the contact.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-3xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold">Contact</div>
            <div className="mt-2 flex gap-2">
              <input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Search contacts…"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => loadContacts(contactQuery)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              >
                Search
              </button>
            </div>

            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              disabled={busy || contacts.length === 0}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.email ? ` — ${c.email}` : ""}
                </option>
              ))}
            </select>

            {selectedContact ? (
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="font-semibold text-zinc-900">{selectedContact.name}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {selectedContact.email ? `Email: ${selectedContact.email}` : "No email"}
                  {selectedContact.phone ? ` • Phone: ${selectedContact.phone}` : ""}
                </div>
              </div>
            ) : null}

            <div className="mt-5 border-t border-zinc-200 pt-4">
              <div className="text-sm font-semibold">Credit pulls</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !selectedContactId}
                  onClick={pullCredit}
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  Pull credit (stub)
                </button>
                <select
                  value={selectedPullId}
                  onChange={(e) => setSelectedPullId(e.target.value)}
                  disabled={busy || pulls.length === 0}
                  className="min-w-[160px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">No pull selected</option>
                  {pulls.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.status} • {p.provider} • {new Date(p.requestedAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              {pulls.length ? (
                <div className="mt-2 space-y-1 text-xs text-zinc-600">
                  {pulls.slice(0, 3).map((p) => (
                    <div key={p.id}>
                      <span className={classNames(
                        "inline-block rounded-lg px-2 py-0.5 font-semibold",
                        p.status === "SUCCESS" ? "bg-emerald-50 text-emerald-800" : p.status === "FAILED" ? "bg-red-50 text-red-800" : "bg-zinc-100 text-zinc-800",
                      )}>
                        {p.status}
                      </span>
                      <span className="ml-2">{p.error ? p.error : ""}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-zinc-500">No pulls yet.</div>
              )}
            </div>

            <div className="mt-5 border-t border-zinc-200 pt-4">
              <div className="text-sm font-semibold">Letters</div>
              {letters.length === 0 ? (
                <div className="mt-2 text-sm text-zinc-600">No letters yet.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {letters.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setSelectedLetterId(l.id)}
                      className={classNames(
                        "w-full rounded-2xl border px-3 py-2 text-left",
                        selectedLetterId === l.id ? "border-blue-300 bg-blue-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold">{l.subject}</div>
                        <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          {l.status}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">{new Date(l.createdAt).toLocaleString()}</div>
                      {l.lastSentTo ? <div className="mt-1 text-xs text-zinc-600">Sent to: {l.lastSentTo}</div> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="rounded-3xl border border-zinc-200 bg-white p-5">
            <div className="text-sm font-semibold">Generate</div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient name</div>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="e.g., Experian"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient address</div>
                <input
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Mailing address (optional)"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">What are you disputing?</div>
              <textarea
                value={disputesText}
                onChange={(e) => setDisputesText(e.target.value)}
                className="min-h-[140px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Example:\n- Account XXXX reported 60 days late in Jan 2025, but payment was on time\n- Inquiry from ABC Bank on 02/10/2025 is not mine"
              />
              <div className="mt-1 text-xs text-zinc-500">Tip: paste bullet points; we’ll turn it into a letter.</div>
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !selectedContactId || disputesText.trim().length < 3}
                onClick={generateLetter}
                className="rounded-xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Working…" : "Generate letter"}
              </button>
            </div>

            <div className="mt-6 border-t border-zinc-200 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Editor</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !selectedLetterId}
                    onClick={saveLetter}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy || !selectedLetterId || !selectedContact?.email}
                    onClick={sendLetter}
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                    title={selectedContact?.email ? "" : "Contact needs an email"}
                  >
                    Send to contact
                  </button>
                </div>
              </div>

              {!selectedLetter ? (
                <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
                  Generate a letter, then select it from the left.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Subject</div>
                    <input
                      value={letterDraftSubject}
                      onChange={(e) => setLetterDraftSubject(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Letter body</div>
                    <textarea
                      value={letterDraftBody}
                      onChange={(e) => setLetterDraftBody(e.target.value)}
                      className="min-h-[420px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                    />
                    <div className="mt-1 text-xs text-zinc-500">
                      Status: {selectedLetter.status}
                      {selectedLetter.sentAt ? ` • Sent: ${new Date(selectedLetter.sentAt).toLocaleString()}` : ""}
                    </div>
                  </label>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
