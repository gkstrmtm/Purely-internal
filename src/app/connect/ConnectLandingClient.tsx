"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function ConnectLandingClient(props: { signedInName?: string | null }) {
	const router = useRouter();
	const [creating, setCreating] = useState(false);
	const [joinValue, setJoinValue] = useState("");
	const [error, setError] = useState<string | null>(null);

	const cleanJoin = useMemo(() => joinValue.trim(), [joinValue]);

	async function onCreateMeeting() {
		setError(null);
		setCreating(true);
		try {
			const res = await fetch("/api/connect/rooms", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			const data = (await res.json().catch(() => null)) as unknown as { ok?: boolean; roomId?: string; error?: string };
			if (!res.ok || !data?.ok || !data.roomId) throw new Error(data?.error || "Failed to create room");
			router.push(`/connect/${encodeURIComponent(data.roomId)}`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to create meeting");
		} finally {
			setCreating(false);
		}
	}

	function onJoin() {
		setError(null);
		const raw = cleanJoin;
		if (!raw) {
			setError("Paste a meeting link or room ID");
			return;
		}

		try {
			const maybeUrl = new URL(raw);
			if (maybeUrl.pathname.startsWith("/connect/")) {
				router.push(`${maybeUrl.pathname}${maybeUrl.search}`);
				return;
			}
		} catch {
			// not a URL
		}

		// Assume it's a room id
		router.push(`/connect/${encodeURIComponent(raw)}`);
	}

	return (
		<div className="min-h-[calc(100vh-0px)] bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-white">
			<div className="mx-auto max-w-3xl px-4 py-10">
				<div className="flex items-center gap-4">
					<div className="relative h-12 w-48">
						<Image src="/brand/Purely_Connect.png" alt="Purely Connect" fill className="object-contain" priority />
					</div>
				</div>

				<div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
					<h1 className="text-balance text-3xl font-semibold tracking-tight">Video calls, the simple way.</h1>
					<p className="mt-2 text-sm text-zinc-300">
						Start a meeting, share the link, and hop on a call. Works best on Chrome.
					</p>

					{props.signedInName ? (
						<div className="mt-4 text-sm text-zinc-300">Signed in as <span className="font-semibold text-white">{props.signedInName}</span></div>
					) : null}

					<div className="mt-6 grid gap-4 sm:grid-cols-2">
						<button
							onClick={onCreateMeeting}
							disabled={creating}
							className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70"
						>
							{creating ? "Starting…" : "Start a meeting"}
						</button>

						<div className="rounded-2xl border border-white/10 bg-black/30 p-3">
							<label className="block text-xs font-medium text-zinc-300">Join a meeting</label>
							<div className="mt-2 flex gap-2">
								<input
									value={joinValue}
									onChange={(e) => setJoinValue(e.target.value)}
									placeholder="Paste link or room ID"
									className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/20"
								/>
								<button
									onClick={onJoin}
									className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
								>
									Join
								</button>
							</div>
						</div>
					</div>

					{error ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

					<div className="mt-6 text-xs text-zinc-400">
						Note: this MVP uses peer-to-peer WebRTC (no recording). Some corporate networks may block calls without a TURN relay.
					</div>
				</div>
			</div>
		</div>
	);
}
