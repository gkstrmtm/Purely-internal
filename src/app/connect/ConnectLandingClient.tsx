"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { IconSettingsGlyph } from "@/app/portal/PortalIcons";
import { ToggleSwitch } from "@/components/ToggleSwitch";

import { ConnectAuthPanel } from "./ConnectAuthPanel";
import { defaultConnectUserDefaults, readConnectUserDefaultsFromStorage, writeConnectUserDefaultsToStorage, type ConnectUserDefaults } from "./connectDefaults";

function Modal(props: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
	if (!props.open) return null;
	return (
		<div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={props.title}>
			<button className="absolute inset-0 bg-black/40" onClick={props.onClose} aria-label="Close" />
			<div className="absolute left-1/2 top-1/2 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl sm:p-8">
				<div className="flex items-start justify-between gap-4">
					<div>
						<div className="text-xl font-semibold text-zinc-900">{props.title}</div>
						<div className="mt-1 text-sm text-zinc-600">Applies to all meetings on this device.</div>
					</div>
					<button
						onClick={props.onClose}
						className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent bg-white text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(29,78,216,0.25)]"
						aria-label="Close"
						title="Close"
					>
						×
					</button>
				</div>
				<div className="mt-6">{props.children}</div>
			</div>
		</div>
	);
}

export function ConnectLandingClient({ signedInName }: { signedInName?: string | null }) {
	const router = useRouter();
	const [creating, setCreating] = useState(false);
	const [joinValue, setJoinValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [defaults, setDefaults] = useState<ConnectUserDefaults>(() => {
		if (typeof window === "undefined") return defaultConnectUserDefaults();
		try {
			return readConnectUserDefaultsFromStorage(window.localStorage);
		} catch {
			return defaultConnectUserDefaults();
		}
	});

	const cleanJoin = useMemo(() => joinValue.trim(), [joinValue]);

	useEffect(() => {
		try {
			const raw = localStorage.getItem("pa.connect.notice");
			if (raw) {
				setNotice(raw);
				localStorage.removeItem("pa.connect.notice");
			}
		} catch {
			// ignore
		}
	}, []);

	function saveDefaults(next: ConnectUserDefaults) {
		setDefaults(next);
		try {
			writeConnectUserDefaultsToStorage(window.localStorage, next);
		} catch {
			// ignore
		}
	}

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
		<div className="min-h-screen bg-[radial-gradient(circle_at_top,#e8f1ff_0%,#f8fafc_38%,#f1f5f9_100%)] text-brand-ink">
			<div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
				<div className="relative overflow-hidden rounded-4xl border border-white/70 bg-white/84 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-10">
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-blue-200/35 blur-3xl" />
						<div className="absolute -left-10 bottom-0 h-48 w-48 rounded-full bg-slate-200/35 blur-3xl" />
					</div>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
						<div className="relative h-12 w-48">
							<Image src="/brand/3.png" alt="Purely Connect" fill className="object-contain" priority />
						</div>
						<div className="flex items-center gap-3">
							{signedInName ? <div className="hidden text-sm text-zinc-600 sm:block">Signed in as {signedInName}</div> : null}
							<button
								onClick={() => setSettingsOpen(true)}
								className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200/90 bg-white/88 px-3.5 py-2.5 text-sm font-medium text-zinc-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:bg-white"
								aria-label="Settings"
								title="Settings"
							>
								<IconSettingsGlyph className="h-5 w-5 text-zinc-900" />
								<span className="hidden sm:inline">Settings</span>
							</button>
						</div>
					</div>

					<h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-950 sm:mt-5 sm:text-5xl">Meet, share, and stay face to face.</h1>
					<p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
						Start a meeting, share the link, and jump into a cleaner calling experience with camera, screen share, and host controls built in.
					</p>

					<div className="mt-5">
						<ConnectAuthPanel />
					</div>

					<div className="mt-8 grid gap-4 lg:grid-cols-[1.02fr,0.98fr]">
						<button
							onClick={onCreateMeeting}
							disabled={creating}
							className="group h-full rounded-[28px] bg-(--color-brand-blue) px-5 py-5 text-left text-base font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-6"
						>
							<div className="flex items-start justify-between gap-4">
								<div>
									<div>{creating ? "Starting…" : "Start a meeting"}</div>
									<div className="mt-1 text-sm font-medium text-blue-100/85">Create a room instantly and share the link when you’re ready.</div>
								</div>
							</div>
						</button>

						<div className="rounded-[28px] border border-zinc-200/90 bg-zinc-50/78 p-4 shadow-inner shadow-white/50">
							<label className="block text-base font-medium text-zinc-900">Join a meeting</label>
							<p className="mt-1 text-sm text-zinc-600">Paste a full invite link or drop in a room ID to reconnect fast.</p>
							<div className="mt-3 flex flex-col gap-2 sm:flex-row">
								<input
									value={joinValue}
									onChange={(e) => setJoinValue(e.target.value)}
									placeholder="Paste link or room ID"
									className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-brand-blue/15"
								/>
								<button
									onClick={onJoin}
									className="shrink-0 rounded-2xl bg-(--color-brand-blue) px-4 py-3 text-base font-semibold text-white transition hover:bg-blue-700"
								>
									Join
								</button>
							</div>
							<div className="mt-3 text-sm text-zinc-500">Works for guests, employees, and shared hosted links.</div>
						</div>
					</div>

					{notice ? (
						<div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-base text-blue-800">{notice}</div>
					) : null}
					{error ? (
						<div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{error}</div>
					) : null}
				</div>
			</div>

			<Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Connect settings">
				<div className="space-y-6">
					<div className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-4">
						<div className="text-sm font-semibold text-zinc-900">My defaults</div>
						<div className="mt-1 text-xs text-zinc-600">Choose how Purely Connect should feel before you even join.</div>
						<div className="mt-2 space-y-3">
							<div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
								<div>
									<div className="text-sm font-semibold text-zinc-900">Start muted</div>
									<div className="mt-0.5 text-xs text-zinc-600">Applies to you only.</div>
								</div>
								<ToggleSwitch
									checked={defaults.startMuted}
									onChange={(checked) => saveDefaults({ ...defaults, startMuted: checked })}
									ariaLabel="Start muted"
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
								<div>
									<div className="text-sm font-semibold text-zinc-900">Start with camera off</div>
									<div className="mt-0.5 text-xs text-zinc-600">Applies to you only.</div>
								</div>
								<ToggleSwitch
									checked={defaults.startCameraOff}
									onChange={(checked) => saveDefaults({ ...defaults, startCameraOff: checked })}
									ariaLabel="Start with camera off"
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
								<div>
									<div className="text-sm font-semibold text-zinc-900">Mirror self view</div>
									<div className="mt-0.5 text-xs text-zinc-600">Front camera acts like a mirror.</div>
								</div>
								<ToggleSwitch
									checked={defaults.mirrorSelf}
									onChange={(checked) => saveDefaults({ ...defaults, mirrorSelf: checked })}
									ariaLabel="Mirror self view"
								/>
							</div>
						</div>
					</div>

					<div className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-4">
						<div className="text-sm font-semibold text-zinc-900">Host defaults</div>
						<div className="mt-1 text-xs text-zinc-600">Applied automatically when you are the host.</div>
						<div className="mt-2 space-y-3">
							<div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
								<div className="text-sm font-semibold text-zinc-900">Waiting room</div>
								<ToggleSwitch
									checked={defaults.hostDefaults.waitingRoomEnabled}
									onChange={(checked) =>
										saveDefaults({
											...defaults,
											hostDefaults: { ...defaults.hostDefaults, waitingRoomEnabled: checked },
										})
									}
									ariaLabel="Waiting room"
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
								<div className="text-sm font-semibold text-zinc-900">Lock meeting</div>
								<ToggleSwitch
									checked={defaults.hostDefaults.locked}
									onChange={(checked) =>
										saveDefaults({
											...defaults,
											hostDefaults: { ...defaults.hostDefaults, locked: checked },
										})
									}
									ariaLabel="Lock meeting"
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
								<div className="text-sm font-semibold text-zinc-900">Mute on join</div>
								<ToggleSwitch
									checked={defaults.hostDefaults.muteOnJoin}
									onChange={(checked) =>
										saveDefaults({
											...defaults,
											hostDefaults: { ...defaults.hostDefaults, muteOnJoin: checked },
										})
									}
									ariaLabel="Mute on join"
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
								<div className="text-sm font-semibold text-zinc-900">Camera off on join</div>
								<ToggleSwitch
									checked={defaults.hostDefaults.cameraOffOnJoin}
									onChange={(checked) =>
										saveDefaults({
											...defaults,
											hostDefaults: { ...defaults.hostDefaults, cameraOffOnJoin: checked },
										})
									}
									ariaLabel="Camera off on join"
								/>
							</div>
							<div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
								<div className="text-sm font-semibold text-zinc-900">Allow screen share</div>
								<ToggleSwitch
									checked={defaults.hostDefaults.allowScreenShare}
									onChange={(checked) =>
										saveDefaults({
											...defaults,
											hostDefaults: { ...defaults.hostDefaults, allowScreenShare: checked },
										})
									}
									ariaLabel="Allow screen share"
								/>
							</div>
						</div>
					</div>
				</div>
			</Modal>
		</div>
	);
}
