"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ConnectAuthPanel } from "./ConnectAuthPanel";

export function ConnectLandingClient() {
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
		<div className="min-h-screen bg-brand-mist text-brand-ink">
			<div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
				<div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
					<div className="flex items-center justify-between gap-6">
						<div className="relative h-12 w-48">
							<Image src="/brand/Purely_Connect.png" alt="Purely Connect" fill className="object-contain" priority />
						</div>
						<div className="hidden text-sm text-zinc-600 sm:block">Video meetings</div>
					</div>

					<h1 className="mt-6 text-balance text-2xl font-semibold text-zinc-900 sm:text-3xl">Video calls, the simple way.</h1>
					<p className="mt-2 text-base text-zinc-600">
						Start a meeting, share the link, and hop on a call.
					</p>

					<div className="mt-5">
						<ConnectAuthPanel />
					</div>

					<div className="mt-6 grid gap-4 sm:grid-cols-2">
						<button
							onClick={onCreateMeeting}
							disabled={creating}
							className="rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{creating ? "Starting…" : "Start a meeting"}
						</button>

						<div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
							<label className="block text-base font-medium text-zinc-900">Join a meeting</label>
							<div className="mt-3 flex gap-2">
								<input
									value={joinValue}
									onChange={(e) => setJoinValue(e.target.value)}
									placeholder="Paste link or room ID"
									className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
								/>
								<button
									onClick={onJoin}
									className="shrink-0 rounded-2xl bg-brand-ink px-4 py-3 text-base font-semibold text-white hover:opacity-95"
								>
									Join
								</button>
							</div>
						</div>
					</div>

					{error ? (
						<div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{error}</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
