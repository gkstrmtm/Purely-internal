"use client";

import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type AuthStatus = {
	ok: boolean;
	employee: { email: string | null; name: string | null; role: string | null } | null;
	portal: { email: string | null; name: string | null; role: string | null } | null;
};

async function fetchAuthStatus(): Promise<AuthStatus> {
	const res = await fetch("/api/connect/auth/status", { cache: "no-store" });
	const json = (await res.json().catch(() => null)) as AuthStatus | null;
	if (!res.ok || !json) {
		return { ok: false, employee: null, portal: null };
	}
	return json;
}

function displayName(user: { name: string | null; email: string | null } | null) {
	if (!user) return null;
	const name = String(user.name ?? "").trim();
	if (name) return name;
	const email = String(user.email ?? "").trim();
	return email || null;
}

export function ConnectAuthPanel(props: { defaultOpen?: boolean; hideWhenSignedIn?: boolean }) {
	const router = useRouter();
	const [open, setOpen] = useState(Boolean(props.defaultOpen));
	const [loading, setLoading] = useState(true);
	const [status, setStatus] = useState<AuthStatus | null>(null);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function refresh() {
		setLoading(true);
		try {
			const next = await fetchAuthStatus();
			setStatus(next);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const signedInAs = useMemo(() => {
		const employee = displayName(status?.employee ?? null);
		if (employee) return { kind: "employee" as const, name: employee };
		const portal = displayName(status?.portal ?? null);
		if (portal) return { kind: "portal" as const, name: portal };
		return null;
	}, [status]);

	const isSignedIn = Boolean(signedInAs);

	async function onLogout() {
		setError(null);
		setSubmitting(true);
		try {
			await Promise.all([
				fetch("/portal/api/logout", { method: "POST" }).catch(() => null),
				signOut({ redirect: false }).catch(() => null),
			]);
			router.refresh();
			await refresh();
		} finally {
			setSubmitting(false);
		}
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const employeeRes = await signIn("credentials", {
				redirect: false,
				email,
				password,
			});

			if (employeeRes && !employeeRes.error) {
				setPassword("");
				setOpen(false);
				router.refresh();
				await refresh();
				return;
			}

			const portalRes = await fetch("/portal/api/login", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email, password }),
			});

			if (portalRes.ok) {
				setPassword("");
				setOpen(false);
				router.refresh();
				await refresh();
				return;
			}

			setError("Incorrect username or password");
		} catch {
			setError("Unable to sign in right now");
		} finally {
			setSubmitting(false);
		}
	}

	if (!loading && isSignedIn && props.hideWhenSignedIn) return null;

	return (
		<div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm font-semibold text-zinc-900">Account</div>
					{loading ? (
						<div className="mt-1 text-sm text-zinc-600">Checking sign-in…</div>
					) : signedInAs ? (
						<div className="mt-1 text-sm text-zinc-600">
							Signed in as <span className="font-semibold text-zinc-900">{signedInAs.name}</span>
						</div>
					) : (
						<div className="mt-1 text-sm text-zinc-600">Not signed in</div>
					)}
				</div>

				{!loading && signedInAs ? (
					<button
						onClick={() => void onLogout()}
						disabled={submitting}
						className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
					>
						{submitting ? "Signing out…" : "Sign out"}
					</button>
				) : (
					<button
						onClick={() => setOpen((v) => !v)}
						className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
					>
						{open ? "Hide" : "Sign in"}
					</button>
				)}
			</div>

			{open && !signedInAs ? (
				<form onSubmit={onSubmit} className="mt-4 grid gap-3">
					<div className="grid gap-1.5">
						<label className="text-sm font-semibold text-zinc-900">Email</label>
						<input
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
						/>
					</div>

					<div className="grid gap-1.5">
						<label className="text-sm font-semibold text-zinc-900">Password</label>
						<input
							type="password"
							autoComplete="current-password"
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
						/>
					</div>

					{error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

					<button
						type="submit"
						disabled={submitting}
						className="rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:opacity-60"
					>
						{submitting ? "Signing in…" : "Sign in"}
					</button>

					<div className="text-xs text-zinc-500">This sign-in works for both employee and client portal accounts.</div>
				</form>
			) : null}
		</div>
	);
}
