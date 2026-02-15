import { NextResponse } from "next/server";
import { z } from "zod";

import { requireManagerSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { ensureEmployeeInvitesSchema } from "@/lib/employeeInvitesSchema";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { baseUrlFromRequest } from "@/lib/leadOutbound";
import { extractAllEmailAddresses } from "@/lib/portalMailbox";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const sendSchema = z.object({
	inviteId: z.string().min(1),
	toEmail: z.string().min(1),
	subject: z.string().min(1).max(200).optional(),
	note: z.string().max(600).optional(),
});

function safeOneLine(s: string) {
	return String(s || "")
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function escapeHtml(s: string) {
	return String(s || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function buildInviteEmailHtml(opts: { inviteCode: string; signupUrl: string; note?: string | null }) {
	const note = safeOneLine(opts.note || "");
	const noteHtml = note
		? `<tr><td style="padding:0 0 14px 0;color:#3f3f46;font-size:14px;line-height:20px;">${escapeHtml(note)}</td></tr>`
		: "";

	const code = escapeHtml(opts.inviteCode);
	const signupUrlEsc = escapeHtml(opts.signupUrl);

	return `
<div style="margin:0;padding:0;background:#f4f4f5;">
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
		<tr>
			<td align="center">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:20px;overflow:hidden;">
					<tr>
						<td style="padding:18px 22px;background:linear-gradient(135deg,#0f172a,#111827);">
							<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.2px;">Purely Automation</div>
							<div style="margin-top:6px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#d4d4d8;font-size:13px;line-height:18px;">Employee invite</div>
						</td>
					</tr>

					<tr>
						<td style="padding:20px 22px 8px 22px;">
							<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
								${noteHtml}
								<tr>
									<td style="padding:0 0 14px 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#18181b;font-size:14px;line-height:20px;">
										You’ve been invited to join the Purely Automation employee app. Use the code below to sign up.
									</td>
								</tr>

								<tr>
									<td style="padding:0 0 14px 0;">
										<div style="display:inline-block;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:14px;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:16px;font-weight:700;color:#111827;letter-spacing:1px;">${code}</div>
									</td>
								</tr>

								<tr>
									<td style="padding:0 0 18px 0;">
										<a href="${signupUrlEsc}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:14px;padding:12px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:14px;font-weight:700;">Create your account</a>
									</td>
								</tr>

								<tr>
									<td style="padding:0 0 2px 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#52525b;font-size:12px;line-height:18px;">
										Or sign up at <a href="${signupUrlEsc}" style="color:#111827;text-decoration:underline;">${signupUrlEsc}</a> and enter the code.
									</td>
								</tr>

								<tr>
									<td style="padding:16px 0 0 0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#a1a1aa;font-size:12px;line-height:18px;">
										This invite code is one-time use.
									</td>
								</tr>
							</table>
						</td>
					</tr>

					<tr>
						<td style="padding:14px 22px 18px 22px;border-top:1px solid #f4f4f5;">
							<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#71717a;font-size:12px;line-height:18px;">
								Questions? Reply to this email.
							</div>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</div>
`;
}

export async function POST(req: Request) {
	const auth = await requireManagerSession();
	if (!auth.ok) {
		return NextResponse.json(
			{ error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
			{ status: auth.status },
		);
	}

	const json = await req.json().catch(() => null);
	const parsed = sendSchema.safeParse(json ?? {});
	if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

	const extracted = extractAllEmailAddresses(parsed.data.toEmail);
	const toEmail = extracted?.[0] ? extracted[0].trim() : "";
	if (!toEmail) return NextResponse.json({ ok: false, error: "Enter a valid recipient email" }, { status: 400 });

	try {
		await ensureEmployeeInvitesSchema();

		const invite = await prisma.employeeInvite.findUnique({
			where: { id: parsed.data.inviteId },
			select: { id: true, code: true, expiresAt: true, usedAt: true },
		});

		if (!invite) return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });

		if (invite.usedAt) {
			return NextResponse.json({ ok: false, error: "Invite already used" }, { status: 400 });
		}

		if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
			return NextResponse.json({ ok: false, error: "Invite expired" }, { status: 400 });
		}

		const baseUrl = baseUrlFromRequest(req);
		const signupUrl = `${baseUrl}/signup?code=${encodeURIComponent(invite.code)}`;

		const subject = safeOneLine(parsed.data.subject || "") || "You're invited to Purely Automation";
		const note = safeOneLine(parsed.data.note || "");

		const textLines: string[] = [];
		if (note) textLines.push(note, "");
		textLines.push(
			"You're invited to join the Purely Automation employee app.",
			"",
			`Invite code: ${invite.code}`,
			`Sign up: ${signupUrl}`,
			"",
			"This invite code is one-time use.",
		);

		const html = buildInviteEmailHtml({ inviteCode: invite.code, signupUrl, note: note || null });

		const sendResult = await trySendTransactionalEmail({
			to: toEmail,
			subject,
			text: textLines.join("\n"),
			html,
			fromEmail: "contact@purelyautomation.com",
			fromName: "Purely Automation",
			replyTo: "contact@purelyautomation.com",
		});

		if (!sendResult.ok) {
			return NextResponse.json(
				{ ok: false, error: "Failed to send email", details: sendResult.reason },
				{ status: sendResult.skipped ? 501 : 500 },
			);
		}

		return NextResponse.json({
			ok: true,
			provider: sendResult.provider,
			providerMessageId: sendResult.providerMessageId,
			invite: { id: invite.id, code: invite.code, expiresAt: invite.expiresAt, usedAt: invite.usedAt },
		});
	} catch (e) {
		return NextResponse.json(
			{
				ok: false,
				error: "Failed to send email",
				details: e instanceof Error ? e.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}