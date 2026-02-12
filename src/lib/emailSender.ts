export type EmailAttachment = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export type EmailProvider = "POSTMARK" | "SMTP" | "SENDGRID";

export type TrySendEmailResult =
  | { ok: true; provider: EmailProvider; providerMessageId: string | null }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string };

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFromHeader(fromEmail: string, fromName?: string | null) {
  const email = safeOneLine(fromEmail);
  const name = safeOneLine(fromName || "");
  if (!name) return email;

  // Quote escaping for display name.
  const escaped = name.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
  return `"${escaped}" <${email}>`;
}

export function getOutboundEmailFrom() {
  const fromEmail = safeOneLine(process.env.EMAIL_FROM || process.env.SENDGRID_FROM_EMAIL || "");
  const fromName = safeOneLine(process.env.EMAIL_FROM_NAME || "");
  return {
    fromEmail: fromEmail || null,
    fromName: fromName || null,
  };
}

export function getOutboundEmailProvider(): EmailProvider | null {
  if (safeOneLine(process.env.POSTMARK_SERVER_TOKEN || "")) return "POSTMARK";
  if (safeOneLine(process.env.SMTP_HOST || "") && safeOneLine(process.env.SMTP_USER || "") && safeOneLine(process.env.SMTP_PASS || "")) {
    return "SMTP";
  }
  if (safeOneLine(process.env.SENDGRID_API_KEY || "")) return "SENDGRID";
  return null;
}

export function missingOutboundEmailConfigReason(): string {
  const provider = getOutboundEmailProvider();
  const { fromEmail } = getOutboundEmailFrom();

  if (!provider) return "Missing POSTMARK_SERVER_TOKEN (or SMTP_HOST/SMTP_USER/SMTP_PASS, or legacy SENDGRID_API_KEY)";
  if (!fromEmail) return "Missing EMAIL_FROM (or legacy SENDGRID_FROM_EMAIL)";
  return "Missing outbound email configuration";
}

export function isOutboundEmailConfigured() {
  const provider = getOutboundEmailProvider();
  const { fromEmail } = getOutboundEmailFrom();
  return Boolean(provider && fromEmail);
}

export async function trySendTransactionalEmail({
  to,
  cc,
  subject,
  text,
  html,
  fromName,
  replyTo,
  attachments,
  messageStream,
}: {
  to: string | string[];
  cc?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  fromName?: string;
  replyTo?: string | null;
  attachments?: EmailAttachment[];
  messageStream?: string | null;
}): Promise<TrySendEmailResult> {
  const provider = getOutboundEmailProvider();
  const { fromEmail, fromName: envFromName } = getOutboundEmailFrom();

  if (!provider || !fromEmail) {
    return { ok: false, skipped: true, reason: missingOutboundEmailConfigReason() };
  }

  const fromEmailRequired = fromEmail;

  const safeText = safeOneLine(text || "") || " ";
  const toList = (Array.isArray(to) ? to : [to]).map((x) => safeOneLine(String(x || ""))).filter(Boolean);
  if (toList.length === 0) return { ok: false, skipped: true, reason: "Missing recipient" };
  const toHeader = toList.join(", ");
  const ccEmail = safeOneLine(cc || "");
  const replyToEmail = safeOneLine(replyTo || "");
  const effectiveFromName = safeOneLine(envFromName || fromName || "Purely Automation") || "Purely Automation";

  if (provider === "POSTMARK") {
    const token = safeOneLine(process.env.POSTMARK_SERVER_TOKEN || "");
    if (!token) return { ok: false, skipped: true, reason: "Missing POSTMARK_SERVER_TOKEN" };

    const stream =
      safeOneLine(messageStream || "") || safeOneLine(process.env.POSTMARK_MESSAGE_STREAM || "") || "outbound";

    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        From: formatFromHeader(fromEmail, effectiveFromName),
        To: toHeader,
        ...(ccEmail ? { Cc: ccEmail } : {}),
        ...(replyToEmail ? { ReplyTo: replyToEmail } : {}),
        Subject: safeOneLine(subject),
        TextBody: safeText,
        ...(safeOneLine(html || "") ? { HtmlBody: String(html) } : {}),
        MessageStream: stream,
        ...(attachments?.length
          ? {
              Attachments: attachments.slice(0, 10).map((a) => ({
                Name: String(a.fileName || "attachment").slice(0, 200),
                ContentType: String(a.mimeType || "application/octet-stream").slice(0, 120),
                Content: Buffer.from(a.bytes).toString("base64"),
              })),
            }
          : {}),
      }),
    });

    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, reason: `Postmark failed (${res.status}): ${raw.slice(0, 500)}` };
    }

    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    const errorCode = typeof json?.ErrorCode === "number" ? json.ErrorCode : 0;
    if (errorCode && errorCode !== 0) {
      const msg = safeOneLine(json?.Message || "Postmark error") || "Postmark error";
      return { ok: false, reason: `Postmark error (${errorCode}): ${msg}` };
    }

    const messageId = safeOneLine(json?.MessageID || "") || null;
    return { ok: true, provider: "POSTMARK", providerMessageId: messageId };
  }

  if (provider === "SMTP") {
    const net = await import("net");
    const tls = await import("tls");
    const crypto = await import("crypto");

    const host = safeOneLine(process.env.SMTP_HOST || "");
    const user = safeOneLine(process.env.SMTP_USER || "");
    const pass = String(process.env.SMTP_PASS || "");
    const portRaw = safeOneLine(process.env.SMTP_PORT || "");
    const port = Number(portRaw || "") || 587;
    const secureEnv = safeOneLine(process.env.SMTP_SECURE || "");
    const useImplicitTls = secureEnv === "1" || secureEnv.toLowerCase() === "true" || port === 465;

    if (!host || !user || !pass) {
      return { ok: false, skipped: true, reason: "Missing SMTP_HOST, SMTP_USER, or SMTP_PASS" };
    }

    const ccList = ccEmail
      ? ccEmail
          .split(",")
          .map((s) => safeOneLine(s))
          .filter(Boolean)
      : [];

    const allRcpt = [...toList, ...ccList].filter(Boolean);
    if (!allRcpt.length) return { ok: false, skipped: true, reason: "Missing recipient" };

    function base64Lines(buf: Buffer) {
      const b64 = buf.toString("base64");
      const out: string[] = [];
      for (let i = 0; i < b64.length; i += 76) out.push(b64.slice(i, i + 76));
      return out.join("\r\n");
    }

    function dotStuff(s: string) {
      return s
        .split(/\r?\n/)
        .map((line) => (line.startsWith(".") ? `.${line}` : line))
        .join("\r\n");
    }

    function buildRfc822(): string {
      const date = new Date().toUTCString();
      const msgId = `<${crypto.randomUUID()}@${host}>`;
      const safeSubject = safeOneLine(subject).slice(0, 200) || "(no subject)";

      const headers: string[] = [
        `From: ${formatFromHeader(fromEmailRequired, effectiveFromName)}`,
        `To: ${toHeader}`,
        ...(ccList.length ? [`Cc: ${ccList.join(", ")}`] : []),
        ...(replyToEmail ? [`Reply-To: ${replyToEmail}`] : []),
        `Subject: ${safeSubject}`,
        `Date: ${date}`,
        `Message-ID: ${msgId}`,
        "MIME-Version: 1.0",
      ];

      const safeHtml = safeOneLine(html || "") ? String(html) : "";
      const hasAttachments = Boolean(attachments?.length);

      if (!safeHtml && !hasAttachments) {
        headers.push("Content-Type: text/plain; charset=utf-8");
        headers.push("Content-Transfer-Encoding: 7bit");
        return headers.join("\r\n") + "\r\n\r\n" + dotStuff(safeText) + "\r\n";
      }

      const boundaryAlt = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
      const boundaryMixed = `mix_${crypto.randomUUID().replace(/-/g, "")}`;

      if (!hasAttachments) {
        headers.push(`Content-Type: multipart/alternative; boundary=\"${boundaryAlt}\"`);
        const parts: string[] = [];
        parts.push(`--${boundaryAlt}`);
        parts.push("Content-Type: text/plain; charset=utf-8");
        parts.push("Content-Transfer-Encoding: 7bit");
        parts.push("");
        parts.push(dotStuff(safeText));
        parts.push(`--${boundaryAlt}`);
        parts.push("Content-Type: text/html; charset=utf-8");
        parts.push("Content-Transfer-Encoding: 7bit");
        parts.push("");
        parts.push(dotStuff(safeHtml || ""));
        parts.push(`--${boundaryAlt}--`);
        return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n") + "\r\n";
      }

      headers.push(`Content-Type: multipart/mixed; boundary=\"${boundaryMixed}\"`);
      const parts: string[] = [];

      // First part: text or alternative.
      if (safeHtml) {
        parts.push(`--${boundaryMixed}`);
        parts.push(`Content-Type: multipart/alternative; boundary=\"${boundaryAlt}\"`);
        parts.push("");
        parts.push(`--${boundaryAlt}`);
        parts.push("Content-Type: text/plain; charset=utf-8");
        parts.push("Content-Transfer-Encoding: 7bit");
        parts.push("");
        parts.push(dotStuff(safeText));
        parts.push(`--${boundaryAlt}`);
        parts.push("Content-Type: text/html; charset=utf-8");
        parts.push("Content-Transfer-Encoding: 7bit");
        parts.push("");
        parts.push(dotStuff(safeHtml));
        parts.push(`--${boundaryAlt}--`);
      } else {
        parts.push(`--${boundaryMixed}`);
        parts.push("Content-Type: text/plain; charset=utf-8");
        parts.push("Content-Transfer-Encoding: 7bit");
        parts.push("");
        parts.push(dotStuff(safeText));
      }

      for (const a of (attachments || []).slice(0, 10)) {
        const name = safeOneLine(a?.fileName || "attachment").slice(0, 200) || "attachment";
        const ct = safeOneLine(a?.mimeType || "application/octet-stream").slice(0, 120) || "application/octet-stream";
        const buf = Buffer.isBuffer(a?.bytes) ? a.bytes : Buffer.from(String(a?.bytes || ""));

        parts.push(`--${boundaryMixed}`);
        parts.push(`Content-Type: ${ct}; name=\"${name.replace(/\"/g, "") }\"`);
        parts.push("Content-Transfer-Encoding: base64");
        parts.push(`Content-Disposition: attachment; filename=\"${name.replace(/\"/g, "") }\"`);
        parts.push("");
        parts.push(base64Lines(buf));
      }

      parts.push(`--${boundaryMixed}--`);
      return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n") + "\r\n";
    }

    type SocketLike = import("net").Socket | import("tls").TLSSocket;

    async function readLine(sock: SocketLike, timeoutMs = 20_000): Promise<string> {
      return await new Promise((resolve, reject) => {
        let buf = "";
        const onData = (chunk: Buffer) => {
          buf += chunk.toString("utf8");
          const idx = buf.indexOf("\n");
          if (idx >= 0) {
            const line = buf.slice(0, idx + 1);
            cleanup();
            resolve(line.replace(/\r?\n$/, ""));
          }
        };
        const onErr = (e: any) => {
          cleanup();
          reject(e);
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("SMTP timeout"));
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timer);
          sock.off("data", onData);
          sock.off("error", onErr);
        };
        sock.on("data", onData);
        sock.on("error", onErr);
      });
    }

    async function readResponse(sock: SocketLike): Promise<{ code: number; lines: string[] }> {
      const lines: string[] = [];
      while (true) {
        const line = await readLine(sock);
        lines.push(line);
        const m = /^([0-9]{3})([\s-])(.*)$/.exec(line);
        if (!m) continue;
        const code = Number(m[1]);
        const cont = m[2] === "-";
        if (!cont) return { code, lines };
      }
    }

    async function sendCmd(sock: SocketLike, cmd: string, okCodes: number[] = [250, 235, 354, 220, 221]) {
      sock.write(cmd + "\r\n");
      const r = await readResponse(sock);
      if (!okCodes.includes(r.code)) {
        throw new Error(`SMTP error (${r.code}): ${r.lines.join(" | ")}`.slice(0, 500));
      }
      return r;
    }

    try {
      const socket: SocketLike = await new Promise((resolve, reject) => {
        const onErr = (e: any) => reject(e);
        if (useImplicitTls) {
          const s = tls.connect({ host, port, servername: host }, () => resolve(s));
          s.once("error", onErr);
          return;
        }
        const s = net.createConnection({ host, port }, () => resolve(s));
        s.once("error", onErr);
      });

      // Greet
      const greet = await readResponse(socket);
      if (greet.code !== 220) throw new Error(`SMTP greeting failed (${greet.code})`);

      await sendCmd(socket, `EHLO purelyautomation.com`, [250]);

      // STARTTLS upgrade if not implicit TLS
      if (!useImplicitTls) {
        try {
          await sendCmd(socket, "STARTTLS", [220]);
          const upgraded = tls.connect({ socket, servername: host });
          await new Promise<void>((resolve, reject) => {
            upgraded.once("secureConnect", () => resolve());
            upgraded.once("error", (e) => reject(e));
          });

          // Re-EHLO after TLS
          await sendCmd(upgraded, `EHLO purelyautomation.com`, [250]);

          // AUTH LOGIN
          await sendCmd(upgraded, "AUTH LOGIN", [334]);
          await sendCmd(upgraded, Buffer.from(user).toString("base64"), [334]);
          await sendCmd(upgraded, Buffer.from(pass).toString("base64"), [235]);

          await sendCmd(upgraded, `MAIL FROM:<${fromEmailRequired}>`, [250]);
          for (const rcpt of allRcpt) await sendCmd(upgraded, `RCPT TO:<${rcpt}>`, [250, 251]);
          await sendCmd(upgraded, "DATA", [354]);
          const msg = buildRfc822();
          upgraded.write(msg.replace(/\r?\n/g, "\r\n"));
          upgraded.write("\r\n.\r\n");
          const dataDone = await readResponse(upgraded);
          if (dataDone.code !== 250) {
            throw new Error(`SMTP DATA failed (${dataDone.code}): ${dataDone.lines.join(" | ")}`.slice(0, 500));
          }
          await sendCmd(upgraded, "QUIT", [221]);

          return { ok: true, provider: "SMTP", providerMessageId: null };
        } catch (err: any) {
          try {
            socket.destroy();
          } catch {
            // ignore
          }
          return { ok: false, reason: (err?.message ? String(err.message) : "SMTP failed").slice(0, 500) };
        }
      }

      // Implicit TLS path continues on same socket
      await sendCmd(socket, "AUTH LOGIN", [334]);
      await sendCmd(socket, Buffer.from(user).toString("base64"), [334]);
      await sendCmd(socket, Buffer.from(pass).toString("base64"), [235]);

      await sendCmd(socket, `MAIL FROM:<${fromEmailRequired}>`, [250]);
      for (const rcpt of allRcpt) await sendCmd(socket, `RCPT TO:<${rcpt}>`, [250, 251]);
      await sendCmd(socket, "DATA", [354]);
      const msg = buildRfc822();
      socket.write(msg.replace(/\r?\n/g, "\r\n"));
      socket.write("\r\n.\r\n");
      const dataDone = await readResponse(socket);
      if (dataDone.code !== 250) {
        throw new Error(`SMTP DATA failed (${dataDone.code}): ${dataDone.lines.join(" | ")}`.slice(0, 500));
      }
      await sendCmd(socket, "QUIT", [221]);

      return { ok: true, provider: "SMTP", providerMessageId: null };
    } catch (err: any) {
      return { ok: false, reason: (err?.message ? String(err.message) : "SMTP failed").slice(0, 500) };
    }
  }

  // Legacy fallback: SendGrid
  const apiKey = safeOneLine(process.env.SENDGRID_API_KEY || "");
  if (!apiKey) return { ok: false, skipped: true, reason: "Missing SENDGRID_API_KEY" };

  const personalizations: any = {
    to: toList.map((email) => ({ email })),
    ...(ccEmail ? { cc: [{ email: ccEmail }] } : {}),
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      personalizations: [personalizations],
      from: { email: fromEmail, name: effectiveFromName },
      subject: safeOneLine(subject),
      content: [{ type: "text/plain", value: safeText }],
      ...(attachments?.length
        ? {
            attachments: attachments.slice(0, 10).map((a) => ({
              content: Buffer.from(a.bytes).toString("base64"),
              type: String(a.mimeType || "application/octet-stream"),
              filename: String(a.fileName || "attachment").slice(0, 200),
              disposition: "attachment",
            })),
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, reason: `SendGrid failed (${res.status}): ${t.slice(0, 500)}` };
  }

  return { ok: true, provider: "SENDGRID", providerMessageId: null };
}

export async function sendTransactionalEmail(args: Parameters<typeof trySendTransactionalEmail>[0]) {
  const r = await trySendTransactionalEmail(args);
  if (!r.ok) {
    if (r.skipped) throw new Error("Email is not configured yet.");
    throw new Error(r.reason);
  }
  return r;
}
