"use client";

import { useMemo, useState } from "react";

type SimResponse = any;

export function AiFlowSimClient(props: { slug: string }) {
  const [text, setText] = useState(
    "Go ahead and create the whole appointment booking funnel. Make the Booking page and Thank You page, and generate real HTML layout.",
  );
  const [url, setUrl] = useState<string>("/portal/app/services/funnel-builder");
  const [execute, setExecute] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<SimResponse | null>(null);
  const [err, setErr] = useState<string>("");

  const pretty = useMemo(() => (resp ? JSON.stringify(resp, null, 2) : ""), [resp]);

  async function run() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/portal/ai-flow-sim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, url, execute, maxRounds: 3 }),
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

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>AI Flow Simulator</h1>
      <div style={{ color: "#666", marginBottom: 16 }}>
        Slug: <code>{props.slug}</code>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>User message</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            style={{ width: "100%", padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600 }}>Context URL (optional)</div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ width: "100%", padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={execute} onChange={(e) => setExecute(e.target.checked)} />
          <div>
            <div style={{ fontWeight: 600 }}>Execute actions</div>
            <div style={{ color: "#666", fontSize: 13 }}>
              When enabled, the simulator will call real portal actions (create pages, generate HTML, etc.).
            </div>
          </div>
        </label>

        <button
          onClick={run}
          disabled={loading || !text.trim()}
          style={{
            padding: "10px 14px",
            background: loading ? "#999" : "#2563eb",
            border: 0,
            color: "white",
            borderRadius: 8,
            cursor: loading ? "not-allowed" : "pointer",
            width: 180,
          }}
        >
          {loading ? "Running…" : "Run simulation"}
        </button>

        {err ? (
          <div style={{ padding: 10, background: "#fee2e2", color: "#7f1d1d", borderRadius: 8 }}>{err}</div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Output</div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#0b1020",
            color: "#e5e7eb",
            padding: 14,
            borderRadius: 10,
            minHeight: 260,
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {pretty || "(run to see system prompt, tool cheat sheet, model output, resolved steps, and execution results)"}
        </pre>
      </div>
    </div>
  );
}
