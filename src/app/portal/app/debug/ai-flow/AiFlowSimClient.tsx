"use client";

import { useEffect, useMemo, useState } from "react";

type SimResponse = any;

function Panel(props: { title: string; children: any; right?: any }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "white" }}>
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontWeight: 700 }}>{props.title}</div>
        {props.right ? <div>{props.right}</div> : null}
      </div>
      <div style={{ padding: 12 }}>{props.children}</div>
    </div>
  );
}

function CopyButton(props: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      // ignore
    }
  }
  return (
    <button
      onClick={copy}
      type="button"
      style={{
        padding: "6px 10px",
        border: "1px solid #e5e7eb",
        background: "white",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      {copied ? "Copied" : props.label || "Copy"}
    </button>
  );
}

function PreBlock(props: { text: string; minHeight?: number }) {
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "#0b1020",
        color: "#e5e7eb",
        padding: 12,
        borderRadius: 10,
        fontSize: 12,
        lineHeight: 1.4,
        minHeight: props.minHeight ?? 80,
        margin: 0,
      }}
    >
      {props.text}
    </pre>
  );
}

export function AiFlowSimClient(props: { slug: string }) {
  const [text, setText] = useState(
    "Go ahead and create the whole appointment booking funnel. Make the Booking page and Thank You page, and generate real HTML layout.",
  );
  const [sendContextUrl, setSendContextUrl] = useState<boolean>(true);
  const [urlMode, setUrlMode] = useState<"auto" | "manual">("auto");
  const [url, setUrl] = useState<string>("/");
  const [execute, setExecute] = useState<boolean>(false);
  const [maxRounds, setMaxRounds] = useState<number>(3);
  const [threadContextText, setThreadContextText] = useState<string>("{}\n");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<SimResponse | null>(null);
  const [err, setErr] = useState<string>("");
  const [explainLoading, setExplainLoading] = useState<Record<string, boolean>>({});
  const [explainText, setExplainText] = useState<Record<string, string>>({});

  useEffect(() => {
    if (urlMode !== "auto") return;
    if (typeof window === "undefined") return;
    setUrl(window.location.href);
  }, [urlMode]);

  const toolsPretty = useMemo(() => {
    const keys = resp?.tools?.availableActionKeys;
    if (!Array.isArray(keys)) return "";
    return keys.join("\n");
  }, [resp]);

  const rounds = useMemo(() => {
    return Array.isArray(resp?.rounds) ? resp.rounds : [];
  }, [resp]);

  const allSentCombined = useMemo(() => {
    if (!rounds.length) return "";
    const lines: string[] = [];
    for (let i = 0; i < rounds.length; i += 1) {
      const r: any = rounds[i];
      const roundLabel = `ROUND ${Number(r?.round ?? i) + 1}`;

      function pushSentBlock(label: string, sent: any) {
        if (!sent) return;
        const system = String(sent?.system || "").trim();
        const user = String(sent?.user || "").trim();
        const cheat = String(sent?.toolCheatSheet || "").trim();
        if (!system && !user && !cheat) return;
        lines.push("=".repeat(70));
        lines.push(`${roundLabel} - ${label}`);
        lines.push("");
        lines.push("[SYSTEM]");
        lines.push(system || "(empty)");
        lines.push("");
        lines.push("[USER]");
        lines.push(user || "(empty)");
        lines.push("");
        lines.push("[TOOL CHEAT SHEET]");
        lines.push(cheat || "(empty)");
        lines.push("");
      }

      pushSentBlock("Sent to model", r?.sentToModel);
      pushSentBlock("Retry 1", r?.sentToModelRetry);
      pushSentBlock("Retry 2", r?.sentToModelRetry2);
      pushSentBlock("Retry 3", r?.sentToModelRetry3);
    }
    return lines.join("\n").trim();
  }, [rounds]);

  const allReturnedCombined = useMemo(() => {
    if (!rounds.length) return "";
    const lines: string[] = [];
    for (let i = 0; i < rounds.length; i += 1) {
      const r: any = rounds[i];
      const roundLabel = `ROUND ${Number(r?.round ?? i) + 1}`;

      function pushReturnedBlock(label: string, returned: any) {
        if (!returned) return;
        const rawText = String(returned?.rawText || "").trim();
        const parsedDecision = returned?.parsedDecision;
        const parsedPretty = parsedDecision ? JSON.stringify(parsedDecision, null, 2) : "";
        if (!rawText && !parsedPretty) return;
        lines.push("=".repeat(70));
        lines.push(`${roundLabel} - ${label}`);
        if (returned?.retryUsed) {
          lines.push(`Retry used: ${String(returned.retryUsed)}`);
        }
        lines.push("");
        lines.push("[RAW MODEL TEXT]");
        lines.push(rawText || "(empty)");
        lines.push("");
        lines.push("[PARSED JSON DECISION]");
        lines.push(parsedPretty || "(no JSON extracted)");
        lines.push("");
      }

      pushReturnedBlock("Model returned", r?.modelReturned);
      pushReturnedBlock("Retry 1", r?.modelReturnedRetry);
      pushReturnedBlock("Retry 2", r?.modelReturnedRetry2);
      pushReturnedBlock("Retry 3", r?.modelReturnedRetry3);
    }
    return lines.join("\n").trim();
  }, [rounds]);

  const finalContextPretty = useMemo(() => {
    if (!resp?.finalContext) return "";
    try {
      return JSON.stringify(resp.finalContext, null, 2);
    } catch {
      return String(resp.finalContext);
    }
  }, [resp]);

  const debugBundle = useMemo(() => {
    if (!resp) return "";
    const payload = {
      request: resp?.request || null,
      tools: resp?.tools || null,
      sentToModelCombined: allSentCombined || null,
      modelReturnedCombined: allReturnedCombined || null,
      rounds: Array.isArray(resp?.rounds) ? resp.rounds : [],
      allSteps: Array.isArray(resp?.allSteps) ? resp.allSteps : [],
      allResults: Array.isArray(resp?.allResults) ? resp.allResults : [],
      finalContext: resp?.finalContext || null,
    };

    const header = [
      "AI FLOW SIM DEBUG BUNDLE",
      `slug: ${String(props.slug || "").trim()}`,
      `generatedAt: ${new Date().toISOString()}`,
    ].join("\n");

    try {
      return `${header}\n\n${JSON.stringify(payload, null, 2)}`;
    } catch {
      return `${header}\n\n${String(payload)}`;
    }
  }, [resp, allSentCombined, allReturnedCombined, props.slug]);

  async function run() {
    setLoading(true);
    setErr("");
    setExplainLoading({});
    setExplainText({});
    try {
      let threadContext: any = undefined;
      const raw = threadContextText.trim();
      if (raw) {
        try {
          threadContext = JSON.parse(raw);
        } catch {
          setErr("threadContext must be valid JSON");
          setLoading(false);
          return;
        }
      }

      const r = await fetch("/api/portal/ai-flow-sim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, url: sendContextUrl ? url : null, execute, maxRounds, threadContext }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        setErr(json?.error ? String(json.error) : `Request failed (${r.status})`);
        setResp(json);
        return;
      }
      setResp(json);
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function useFinalContextAsNextInput() {
    if (!resp?.finalContext) return;
    try {
      setThreadContextText(`${JSON.stringify(resp.finalContext, null, 2)}\n`);
    } catch {
      setThreadContextText(`${String(resp.finalContext)}\n`);
    }
  }

  async function generateExplanationForRound(roundKey: string, roundPayload: any) {
    setExplainLoading((prev) => ({ ...prev, [roundKey]: true }));
    try {
      const r = await fetch("/api/portal/ai-flow-sim/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request: resp?.request || null,
          round: roundPayload,
        }),
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = json?.error ? String(json.error) : `Explain failed (${r.status})`;
        setExplainText((prev) => ({ ...prev, [roundKey]: msg }));
        return;
      }
      setExplainText((prev) => ({ ...prev, [roundKey]: String(json?.explanation || "") }));
    } catch (e: any) {
      setExplainText((prev) => ({
        ...prev,
        [roundKey]: e?.message ? String(e.message) : "Explain failed",
      }));
    } finally {
      setExplainLoading((prev) => ({ ...prev, [roundKey]: false }));
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>AI Flow Simulator</h1>
      <div style={{ color: "#666", marginBottom: 16 }}>
        Slug: <code>{props.slug}</code>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <Panel title="Inputs">
            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>User message (sent to model)</div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                style={{ width: "100%", padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              <div style={{ fontWeight: 600 }}>Thread context JSON (sent to model)</div>
              <textarea
                value={threadContextText}
                onChange={(e) => setThreadContextText(e.target.value)}
                rows={6}
                style={{ width: "100%", padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                placeholder='{"lastFunnel":{"id":"...","label":"..."}}'
              />
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={sendContextUrl}
                onChange={(e) => setSendContextUrl(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Send context URL</div>
                <div style={{ color: "#666", fontSize: 13 }}>
                  Real portal chat automatically includes <code>url: window.location.href</code> on each send.
                </div>
              </div>
            </label>

            {sendContextUrl ? (
              <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 600 }}>Context URL value</div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setUrlMode("auto")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: urlMode === "auto" ? "#111827" : "white",
                        color: urlMode === "auto" ? "white" : "#111827",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrlMode("manual")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: urlMode === "manual" ? "#111827" : "white",
                        color: urlMode === "manual" ? "white" : "#111827",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Manual
                    </button>
                  </div>
                </div>

                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={urlMode === "auto"}
                  style={{
                    width: "100%",
                    padding: 10,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    opacity: urlMode === "auto" ? 0.7 : 1,
                  }}
                />
                <div style={{ color: "#666", fontSize: 12 }}>
                  Tip: set Manual to simulate sending from a different portal page (funnels, inbox, booking, etc.).
                </div>
              </div>
            ) : null}

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <input type="checkbox" checked={execute} onChange={(e) => setExecute(e.target.checked)} />
              <div>
                <div style={{ fontWeight: 600 }}>Execute actions</div>
                <div style={{ color: "#666", fontSize: 13 }}>
                  When enabled, the simulator will call real portal actions (create pages, generate HTML, etc.).
                </div>
              </div>
            </label>

            <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>Max AI rounds</div>
              <input
                type="number"
                min={1}
                max={6}
                value={maxRounds}
                onChange={(e) => setMaxRounds(Math.max(1, Math.min(6, Number(e.target.value || 1))))}
                style={{ width: 140, padding: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </label>

            <button
              onClick={run}
              disabled={loading || !text.trim()}
              style={{
                padding: "10px 14px",
                background: loading ? "#999" : "#2563eb",
                border: 0,
                color: "white",
                borderRadius: 10,
                cursor: loading ? "not-allowed" : "pointer",
                width: "100%",
              }}
            >
              {loading ? "Running…" : "Run simulation"}
            </button>

            {resp ? (
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {debugBundle ? <CopyButton text={debugBundle} label="Copy debug bundle" /> : null}
                  {finalContextPretty ? (
                    <button
                      type="button"
                      onClick={useFinalContextAsNextInput}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid #e5e7eb",
                        background: "white",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      Use final context as next input
                    </button>
                  ) : null}
                </div>
                <div style={{ color: "#666", fontSize: 12 }}>
                  Tip: click "Use final context as next input", then send your next message to simulate a multi-step thread.
                </div>
              </div>
            ) : null}

            {err ? (
              <div style={{ marginTop: 10, padding: 10, background: "#fee2e2", color: "#7f1d1d", borderRadius: 10 }}>
                {err}
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Available portal action tools"
            right={toolsPretty ? <CopyButton text={toolsPretty} label="Copy list" /> : null}
          >
            {toolsPretty ? (
              <>
                <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
                  These are the action keys the model can emit in JSON (the “tools”).
                </div>
                <PreBlock text={toolsPretty} minHeight={220} />
              </>
            ) : (
              <div style={{ color: "#666" }}>(run a simulation to load the tool list)</div>
            )}
          </Panel>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <Panel title="AI rounds">
            {!rounds.length ? (
              <div style={{ color: "#666" }}>
                Run to see exactly what is sent to the model, what the model returns, and (optionally) what actions were executed.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>Everything sent to the model (combined)</div>
                    {allSentCombined ? <CopyButton text={allSentCombined} label="Copy" /> : null}
                  </div>
                  <div style={{ color: "#666", fontSize: 13 }}>
                    This is the exact text we sent to the AI across all rounds (including retries), in one place.
                  </div>
                  <PreBlock text={allSentCombined || "(empty)"} minHeight={220} />
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>Everything the model returned (combined)</div>
                    {allReturnedCombined ? <CopyButton text={allReturnedCombined} label="Copy" /> : null}
                  </div>
                  <div style={{ color: "#666", fontSize: 13 }}>
                    This is the raw model output across all rounds (plus the server-extracted JSON), in one place.
                  </div>
                  <PreBlock text={allReturnedCombined || "(empty)"} minHeight={220} />
                </div>

                {rounds.map((r: any, idx: number) => {
                  const system = String(r?.sentToModel?.system || "");
                  const user = String(r?.sentToModel?.user || "");
                  const cheat = String(r?.sentToModel?.toolCheatSheet || "");
                  const rawText = String(r?.modelReturned?.rawText || "");
                  const parsedDecision = r?.modelReturned?.parsedDecision;
                  const parsedDecisionPretty = parsedDecision ? JSON.stringify(parsedDecision, null, 2) : "";
                  const resolvedPretty = Array.isArray(r?.resolved) ? JSON.stringify(r.resolved, null, 2) : "[]";
                  const executedPretty = Array.isArray(r?.executed) ? JSON.stringify(r.executed, null, 2) : "[]";
                  const needsConfirmPretty = r?.needsConfirm ? JSON.stringify(r.needsConfirm, null, 2) : "";
                  const clarifyPretty = r?.clarify ? JSON.stringify(r.clarify, null, 2) : "";
                  const roundKey = String(r?.round ?? idx);
                  const explain = String(explainText[roundKey] || "").trim();
                  const isExplaining = Boolean(explainLoading[roundKey]);

                  return (
                    <details
                      key={String(r?.round ?? idx)}
                      open={idx === 0}
                      style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" }}
                    >
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                        Round {Number(r?.round ?? idx) + 1}
                        <span style={{ fontWeight: 500, color: "#666" }}> - {r?.at ? String(r.at) : ""}</span>
                      </summary>

                      <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ fontWeight: 800 }}>Plain-English explanation</div>
                          <button
                            type="button"
                            onClick={() => generateExplanationForRound(roundKey, r)}
                            disabled={isExplaining}
                            style={{
                              padding: "6px 10px",
                              border: "1px solid #e5e7eb",
                              background: isExplaining ? "#f3f4f6" : "white",
                              borderRadius: 8,
                              cursor: isExplaining ? "not-allowed" : "pointer",
                              fontSize: 12,
                            }}
                          >
                            {isExplaining ? "Explaining..." : "Generate explanation"}
                          </button>
                        </div>
                        <div style={{ color: "#666", fontSize: 13 }}>
                          This explains what the AI was told, what it returned, and what the server did next.
                        </div>
                        <PreBlock
                          text={explain || "(click Generate explanation)"}
                          minHeight={120}
                        />

                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 700 }}>Sent to model</div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <CopyButton text={system} label="Copy system" />
                              <CopyButton text={user} label="Copy user" />
                            </div>
                          </div>
                          <div style={{ color: "#666", fontSize: 13 }}>
                            The model sees a system prompt + user prompt (which includes thread context + optional URL).
                          </div>

                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 600 }}>System prompt</div>
                            <PreBlock text={system || "(empty)"} />
                          </div>
                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 600 }}>User prompt</div>
                            <PreBlock text={user || "(empty)"} />
                          </div>
                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span>Tool cheat sheet (embedded in system prompt)</span>
                              <CopyButton text={cheat} label="Copy cheat" />
                            </div>
                            <PreBlock text={cheat || "(empty)"} />
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 700 }}>Model returned</div>
                            <CopyButton text={rawText} label="Copy raw" />
                          </div>
                          <div style={{ color: "#666", fontSize: 13 }}>
                            If the model needs tools, it should return JSON only (e.g. <code>{"{\"actions\":[...]}"}</code>).
                          </div>
                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 600 }}>Raw text</div>
                            <PreBlock text={rawText || "(empty)"} minHeight={120} />
                          </div>
                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span>Parsed decision (server-extracted JSON)</span>
                              {parsedDecisionPretty ? <CopyButton text={parsedDecisionPretty} label="Copy parsed" /> : null}
                            </div>
                            <PreBlock text={parsedDecisionPretty || "(no JSON extracted)"} minHeight={100} />
                          </div>

                          {needsConfirmPretty ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ fontWeight: 600 }}>Needs confirm (simulation stops here)</div>
                              <PreBlock text={needsConfirmPretty} minHeight={80} />
                            </div>
                          ) : null}

                          {clarifyPretty ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ fontWeight: 600 }}>Clarify required (simulation stops here)</div>
                              <PreBlock text={clarifyPretty} minHeight={80} />
                            </div>
                          ) : null}
                        </div>

                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ fontWeight: 700 }}>Server resolution/execution</div>
                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 600 }}>Resolved steps</div>
                            <PreBlock text={resolvedPretty} minHeight={120} />
                          </div>
                          <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ fontWeight: 600 }}>Executed results</div>
                            <PreBlock
                              text={execute ? executedPretty : "(execution disabled - enable 'Execute actions' to run real portal actions)"}
                              minHeight={120}
                            />
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="Final thread context"
            right={finalContextPretty ? <CopyButton text={finalContextPretty} label="Copy" /> : null}
          >
            {finalContextPretty ? <PreBlock text={finalContextPretty} minHeight={160} /> : <div style={{ color: "#666" }}>(none)</div>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
