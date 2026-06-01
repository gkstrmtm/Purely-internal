function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEmailShell(opts: { eyebrow?: string; title: string; intro?: string; bodyHtml: string; footer?: string }) {
  const eyebrow = safeOneLine(opts.eyebrow || "Purely Automation");
  const title = safeOneLine(opts.title);
  const intro = safeOneLine(opts.intro || "");
  const footer = safeOneLine(opts.footer || "Reply to this email if you need help.");

  return `
<div style="margin:0;padding:0;background:#f5f5f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px 8px 24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#44403c;font-size:12px;font-weight:600;">
              ${escapeHtml(eyebrow)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 8px 24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917;font-size:28px;line-height:34px;font-weight:700;">
              ${escapeHtml(title)}
            </td>
          </tr>
          ${intro ? `<tr><td style="padding:0 24px 4px 24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#57534e;font-size:15px;line-height:24px;">${escapeHtml(intro)}</td></tr>` : ""}
          <tr>
            <td style="padding:12px 24px 24px 24px;">${opts.bodyHtml}</td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px 24px;border-top:1px solid #f5f5f4;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#78716c;font-size:12px;line-height:18px;">
              ${escapeHtml(footer)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

export function buildPasswordResetCodeEmail(opts: {
  name?: string | null;
  code: string;
  expiresMinutes?: number;
  audienceLabel?: string | null;
}) {
  const name = safeOneLine(opts.name || "there");
  const expiresMinutes = Number(opts.expiresMinutes || 15) || 15;
  const audienceLabel = safeOneLine(opts.audienceLabel || "account");
  const code = safeOneLine(opts.code || "");

  const subject = "Your Purely Automation password reset code";
  const text = [
    `Hi ${name},`,
    "",
    `We received a request to reset your ${audienceLabel} password.`,
    "",
    "Use this one-time code:",
    "",
    code,
    "",
    `This code expires in ${expiresMinutes} minutes.`,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");

  const html = buildEmailShell({
    title: "Reset your password",
    intro: `We received a request to reset your ${audienceLabel} password.`,
    bodyHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding:0 0 14px 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#44403c;font-size:15px;line-height:24px;">
            Hi ${escapeHtml(name)}, use this one-time code to continue.
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 16px 0;">
            <div style="display:inline-block;background:#fafaf9;border:1px solid #e7e5e4;border-radius:16px;padding:14px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:24px;line-height:28px;font-weight:700;color:#1c1917;letter-spacing:4px;">${escapeHtml(code)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 10px 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#57534e;font-size:14px;line-height:22px;">
            This code expires in ${escapeHtml(String(expiresMinutes))} minutes.
          </td>
        </tr>
        <tr>
          <td style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#78716c;font-size:13px;line-height:20px;">
            If you didn't request this, you can ignore this email.
          </td>
        </tr>
      </table>`,
  });

  return { subject, text, html };
}

export function buildPasswordChangedEmail(opts: {
  name?: string | null;
  audienceLabel?: string | null;
  manageUrl?: string | null;
}) {
  const name = safeOneLine(opts.name || "there");
  const audienceLabel = safeOneLine(opts.audienceLabel || "account");
  const manageUrl = safeOneLine(opts.manageUrl || "");
  const subject = "Password changed";

  const text = [
    `Hi ${name},`,
    "",
    `Your ${audienceLabel} password was changed.`,
    "",
    "If this wasn't you, update it immediately and contact support.",
    ...(manageUrl ? ["", `Open: ${manageUrl}`] : []),
  ].join("\n");

  const actionHtml = manageUrl
    ? `<tr><td style="padding:10px 0 0 0;"><a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;border-radius:14px;padding:12px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;">Open account</a></td></tr>`
    : "";

  const html = buildEmailShell({
    title: "Password changed",
    intro: `Your ${audienceLabel} password was updated.`,
    bodyHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding:0 0 14px 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#44403c;font-size:15px;line-height:24px;">
            Hi ${escapeHtml(name)}, this is a confirmation that your password was changed.
          </td>
        </tr>
        <tr>
          <td style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#57534e;font-size:14px;line-height:22px;">
            If this wasn't you, update it immediately and contact support.
          </td>
        </tr>
        ${actionHtml}
      </table>`,
  });

  return { subject, text, html };
}