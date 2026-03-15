"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ToggleSwitch } from "@/components/ToggleSwitch";

import { ConnectAuthPanel } from "./ConnectAuthPanel";
import { defaultConnectUserDefaults, readConnectUserDefaultsFromStorage, writeConnectUserDefaultsToStorage, type ConnectUserDefaults } from "./connectDefaults";

function SettingsIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path
				d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M19.4 15a8 8 0 0 0 .1-1l2-1.2-2-3.4-2.3.5a7.6 7.6 0 0 0-.9-.6L15.8 6h-3.6l-.6 2.3c-.3.2-.6.4-.9.6L8.4 8.4l-2 3.4 2 1.2a8 8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.5c.3.2.6.4.9.6l.6 2.3h3.6l.6-2.3c.3-.2.6-.4.9-.6l2.3.5 2-3.4-2-1.2Z"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinecap="round"
				strokeLinejoin="round"
				opacity="0.85"
			/>
		</svg>
	);
}

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
						className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm hover:bg-zinc-50"
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
		<div className="min-h-screen bg-brand-mist text-brand-ink">
			<div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
				<div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
					<div className="flex items-center justify-between gap-6">
						<div className="relative h-12 w-48">
							<Image src="/brand/3.png" alt="Purely Connect" fill className="object-contain" priority />
						</div>
						<div className="flex items-center gap-3">
							<div className="hidden text-sm text-zinc-600 sm:block">
								{signedInName ? `Signed in as ${signedInName}` : "Video meetings"}
							</div>
							<button
								onClick={() => setSettingsOpen(true)}
								className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-base hover:bg-zinc-50"
								aria-label="Settings"
								title="Settings"
							>
								<SettingsIcon />
								<span className="hidden sm:inline">Settings</span>
							</button>
						</div>
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
							className="rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
									className="shrink-0 rounded-2xl bg-(--color-brand-blue) px-4 py-3 text-base font-semibold text-white hover:bg-blue-700"
								>
									Join
								</button>
							</div>
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
					<div>
						<div className="text-sm font-semibold text-zinc-900">My defaults</div>
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

					<div>
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
