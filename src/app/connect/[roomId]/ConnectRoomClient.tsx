"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { IconCopy as PortalCopyGlyph } from "@/app/portal/PortalIcons";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

import { ConnectAuthPanel } from "../ConnectAuthPanel";
import { defaultConnectUserDefaults, readConnectUserDefaultsFromStorage, writeConnectUserDefaultsToStorage, type ConnectUserDefaults } from "../connectDefaults";

type ParticipantCreds = {
	participantId: string;
	secret: string;
	displayName: string;
	isGuest: boolean;
};

type ParticipantPublic = {
	id: string;
	displayName: string;
	isGuest: boolean;
	createdAt: string;
};

type Signal = {
	seq: number;
	kind: string;
	payload: unknown;
	fromParticipantId: string;
	toParticipantId: string | null;
	createdAt: string;
};

type MediaState = {
	audioEnabled: boolean;
	videoEnabled: boolean;
	isSharing: boolean;
	cameraStreamId?: string | null;
	screenStreamId?: string | null;
};

type RoomSettings = {
	waitingRoomEnabled: boolean;
	locked: boolean;
	muteOnJoin: boolean;
	cameraOffOnJoin: boolean;
	allowScreenShare: boolean;
};

type RoomJoinResponse = {
	ok: boolean;
	pending: boolean;
	room: {
		id: string;
		hostParticipantId: string | null;
		settings: RoomSettings;
	};
	participant: { id: string; secret: string; displayName: string; isGuest: boolean; status?: string };
	others: ParticipantPublic[];
};

type RoomSettingsResponse = {
	ok: boolean;
	room: { id: string; hostParticipantId: string | null; settings: RoomSettings };
	me: { id: string; isHost: boolean; status?: string };
};

type RoomSettingsUpdateResponse = {
	ok: boolean;
	room: { id: string; hostParticipantId: string | null; settings: RoomSettings };
};

type WaitingRoomResponse = {
	ok: boolean;
	roomId: string;
	waiting: ParticipantPublic[];
};

function storageKey(roomId: string) {
	return `pa.connect.${roomId}`;
}

function lastGuestNameKey() {
	return "pa.connect.lastGuestName";
}

function mediaGrantedKey() {
	return "pa.connect.mediaGranted";
}

function mirrorPrefKey() {
	return "pa.connect.mirrorSelf";
}

function connectNoticeKey() {
	return "pa.connect.notice";
}

function safeName(s: string) {
	return String(s || "")
		.replace(/[\r\n\t]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60);
}

function isOfferer(myId: string, otherId: string) {
	return myId.localeCompare(otherId) > 0;
}

export function ConnectRoomClient(props: { roomId: string; signedInName?: string | null }) {
	const roomId = props.roomId;

	type ToastKind = "info" | "warn" | "error";
	type ToastAction = { label: string; onClick: () => void };
	type ToastItem = { id: string; kind: ToastKind; message: string; details?: string | null; actions?: ToastAction[] };

	const [myCreds, setMyCreds] = useState<ParticipantCreds | null>(null);
	const [participants, setParticipants] = useState<ParticipantPublic[]>([]);
	const [roomSettings, setRoomSettings] = useState<RoomSettings | null>(null);
	const [isHost, setIsHost] = useState(false);
	const [pendingAdmission, setPendingAdmission] = useState(false);
	const [waitingRoom, setWaitingRoom] = useState<ParticipantPublic[]>([]);
	const [savingSettings, setSavingSettings] = useState(false);
	const [joinName, setJoinName] = useState<string>(props.signedInName ?? "");
	const [joining, setJoining] = useState(false);
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const [localStreamReady, setLocalStreamReady] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoOff, setIsVideoOff] = useState(false);
	const [isSharing, setIsSharing] = useState(false);
	const [remoteMediaState, setRemoteMediaState] = useState<Record<string, MediaState>>({});
	const [chromeVisible, setChromeVisible] = useState(true);
	const [tileHudVisible, setTileHudVisible] = useState(false);
	const [mirrorSelf, setMirrorSelf] = useState(true);
	const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
	const [hasBackCamera, setHasBackCamera] = useState(false);
	const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
	const headerMenuButtonRef = useRef<HTMLButtonElement | null>(null);
	const [headerMenuStyle, setHeaderMenuStyle] = useState<CSSProperties | null>(null);
	const [connectDefaults, setConnectDefaults] = useState<ConnectUserDefaults>(() => {
		if (typeof window === "undefined") return defaultConnectUserDefaults();
		try {
			return readConnectUserDefaultsFromStorage(window.localStorage);
		} catch {
			return defaultConnectUserDefaults();
		}
	});

	const [remoteTiles, setRemoteTiles] = useState<Array<{ id: string; participantId: string; streamId: string; displayName: string; stream: MediaStream; source: "camera" | "screen" }>>([]);

	const localVideoRef = useRef<HTMLVideoElement | null>(null);
	const screenVideoRef = useRef<HTMLVideoElement | null>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const screenStreamRef = useRef<MediaStream | null>(null);

	const peerMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
	const screenSenderMapRef = useRef<Map<string, RTCRtpSender>>(new Map());
	const makingOfferRef = useRef<Map<string, boolean>>(new Map());
	const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
	const afterSeqRef = useRef<number>(0);
	const participantsRef = useRef<ParticipantPublic[]>([]);
	const storedCredsFoundRef = useRef<boolean>(false);
	const autoJoinAttemptedRef = useRef(false);
	const myCredsRef = useRef<ParticipantCreds | null>(null);
	const roomSettingsRef = useRef<RoomSettings | null>(null);
	const remoteMediaStateRef = useRef<Record<string, MediaState>>({});
	const isHostRef = useRef<boolean>(false);
	const pendingAdmissionRef = useRef<boolean>(false);
	const connectDefaultsRef = useRef<ConnectUserDefaults>(defaultConnectUserDefaults());
	const headerMenuRef = useRef<HTMLDivElement | null>(null);
	const pollingRef = useRef<boolean>(false);
	const pollTimerRef = useRef<number | null>(null);
	const participantsTimerRef = useRef<number | null>(null);
	const waitingRoomTimerRef = useRef<number | null>(null);
	const chromeTimerRef = useRef<number | null>(null);
	const toastTimersRef = useRef<Map<string, number>>(new Map());

	const meetingUrl = useMemo(() => {
		const path = `/connect/${encodeURIComponent(roomId)}`;
		const hosted = toPurelyHostedUrl(path);
		if (typeof window === "undefined") return hosted;
		const host = window.location.hostname;
		const isLocal = host === "localhost" || host === "127.0.0.1";
		return isLocal ? `${window.location.origin}${path}` : hosted;
	}, [roomId]);

	useEffect(() => {
		connectDefaultsRef.current = connectDefaults;
		try {
			writeConnectUserDefaultsToStorage(window.localStorage, connectDefaults);
		} catch {
			// ignore
		}
	}, [connectDefaults]);

	useEffect(() => {
		// Initialize mirror preference: default to connectDefaults.mirrorSelf,
		// but keep honoring the legacy mirrorPrefKey if present.
		try {
			const raw = localStorage.getItem(mirrorPrefKey());
			if (raw === "0") {
				setMirrorSelf(false);
				return;
			}
			if (raw === "1") {
				setMirrorSelf(true);
				return;
			}
		} catch {
			// ignore
		}
		setMirrorSelf(connectDefaultsRef.current.mirrorSelf !== false);
	}, []);

	useEffect(() => {
		if (!headerMenuOpen) return;
		const onDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (!target) return;
			if (headerMenuRef.current && !headerMenuRef.current.contains(target)) setHeaderMenuOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setHeaderMenuOpen(false);
		};
		window.addEventListener("mousedown", onDown);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("mousedown", onDown);
			window.removeEventListener("keydown", onKey);
		};
	}, [headerMenuOpen]);

	useEffect(() => {
		if (!headerMenuOpen) {
			setHeaderMenuStyle(null);
			return;
		}

		const recompute = () => {
			const btn = headerMenuButtonRef.current;
			if (!btn) return;
			const rect = btn.getBoundingClientRect();
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const padding = 12;
			const gap = 8;
			const width = Math.min(320, vw - padding * 2);
			const left = Math.min(Math.max(rect.right - width, padding), vw - padding - width);
			const spaceBelow = vh - rect.bottom - padding - gap;
			const spaceAbove = rect.top - padding - gap;
			const preferDown = spaceBelow >= 240 || spaceBelow >= spaceAbove;
			setHeaderMenuStyle(
				preferDown
					? { left, top: rect.bottom + gap, width, maxHeight: Math.max(180, spaceBelow) }
					: { left, bottom: vh - rect.top + gap, width, maxHeight: Math.max(180, spaceAbove) },
			);
		};

		let raf = 0;
		const schedule = () => {
			if (raf) return;
			raf = window.requestAnimationFrame(() => {
				raf = 0;
				recompute();
			});
		};

		recompute();
		window.addEventListener("resize", schedule);
		window.addEventListener("scroll", schedule, true);
		return () => {
			if (raf) window.cancelAnimationFrame(raf);
			window.removeEventListener("resize", schedule);
			window.removeEventListener("scroll", schedule, true);
		};
	}, [headerMenuOpen]);

	function clearToastTimer(id: string) {
		const t = toastTimersRef.current.get(id);
		if (t) window.clearTimeout(t);
		toastTimersRef.current.delete(id);
	}

	function dismissToast(id: string) {
		clearToastTimer(id);
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}

	function showToast(kind: ToastKind, message: string, opts?: { details?: string | null; actions?: ToastAction[]; ttlMs?: number }) {
		const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
		setToasts((prev) => [{ id, kind, message, details: opts?.details ?? null, actions: opts?.actions }, ...prev].slice(0, 3));
		const ttlMs =
			opts?.ttlMs ??
			(kind === "info" ? 2200 : kind === "warn" ? 4500 : 5500);
		toastTimersRef.current.set(
			id,
			window.setTimeout(() => dismissToast(id), ttlMs),
		);
	}

	function showChromeTemporarily() {
		setChromeVisible(true);
		if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
		const isFinePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer:fine)")?.matches;
		chromeTimerRef.current = window.setTimeout(() => setChromeVisible(false), isFinePointer ? 1800 : 4500);
	}

	function toggleTileHud() {
		setTileHudVisible((prev) => !prev);
	}

	function setLandingNotice(message: string) {
		try {
			localStorage.setItem(connectNoticeKey(), message);
		} catch {
			// ignore
		}
	}

	function goToConnectLanding(opts?: { notice?: string }) {
		if (opts?.notice) setLandingNotice(opts.notice);
		window.location.href = "/connect";
	}

	function isRoomEndedApiError(e: unknown) {
		return e instanceof ApiError && e.status === 410;
	}

	useEffect(() => {
		if (typeof window === "undefined") return;
		const toastTimers = toastTimersRef.current;
		const onMove = () => showChromeTemporarily();
		window.addEventListener("mousemove", onMove, { passive: true });
		window.addEventListener("touchstart", onMove, { passive: true });
		showChromeTemporarily();
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("touchstart", onMove);
			if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
			chromeTimerRef.current = null;
			for (const id of toastTimers.keys()) clearToastTimer(id);
		};
	}, []);

	useEffect(() => {
		myCredsRef.current = myCreds;
	}, [myCreds]);

	useEffect(() => {
		roomSettingsRef.current = roomSettings;
		isHostRef.current = isHost;
		pendingAdmissionRef.current = pendingAdmission;
	}, [roomSettings, isHost, pendingAdmission]);

	useEffect(() => {
		remoteMediaStateRef.current = remoteMediaState;
	}, [remoteMediaState]);

	useEffect(() => {
		const el = screenVideoRef.current;
		if (!el) return;
		if (!isSharing || !screenStreamRef.current) {
			el.srcObject = null;
			return;
		}
		el.srcObject = screenStreamRef.current;
		void el.play().catch(() => null);
	}, [isSharing]);

	function getLocalStream() {
		return localStreamRef.current;
	}

	function currentMediaStateSnapshot(overrides?: Partial<MediaState>): MediaState {
		return {
			audioEnabled: !isMuted,
			videoEnabled: !isVideoOff,
			isSharing,
			cameraStreamId: localStreamRef.current?.id ?? null,
			screenStreamId: screenStreamRef.current?.id ?? null,
			...overrides,
		};
	}

	function inferRemoteTileSource(remoteParticipantId: string, streamId: string): "camera" | "screen" {
		const media = remoteMediaStateRef.current[remoteParticipantId];
		if (media?.screenStreamId && media.screenStreamId === streamId) return "screen";
		return "camera";
	}

	function describeGetUserMediaError(err: unknown) {
		const e = err as { name?: string; message?: string };
		const name = String(e?.name || "");
		const msg = String(e?.message || "");

		if (typeof window !== "undefined" && !window.isSecureContext) {
			return {
				warning: "Camera/mic require a secure context. Please use HTTPS (not HTTP).",
				details: msg || name || null,
			};
		}

		if (name === "NotAllowedError" || name === "PermissionDeniedError") {
			return {
				warning: "Camera/mic permissions are blocked. Allow permissions in your browser, then click “Retry”.",
				details: msg || name || null,
			};
		}
		if (name === "NotFoundError" || name === "DevicesNotFoundError") {
			return {
				warning: "No camera/microphone found. Plug in a device and click “Retry”.",
				details: msg || name || null,
			};
		}
		if (name === "NotReadableError" || name === "TrackStartError") {
			return {
				warning: "Camera/mic are in use by another app (Zoom/Teams/etc). Close it and click “Retry”.",
				details: msg || name || null,
			};
		}
		if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
			return {
				warning: "Your device can’t satisfy the requested camera/mic settings. Try a different device.",
				details: msg || name || null,
			};
		}

		return {
			warning: "Couldn’t access camera/mic. Click “Retry” or use Chrome.",
			details: msg || name || null,
		};
	}

	function upsertRemoteStream(remoteId: string, displayName: string, stream: MediaStream) {
		const source = inferRemoteTileSource(remoteId, stream.id);
		setRemoteTiles((prev) => {
			const tileId = `${remoteId}:${stream.id}`;
			const idx = prev.findIndex((t) => t.id === tileId);
			if (idx >= 0) {
				const next = prev.slice();
				next[idx] = { id: tileId, participantId: remoteId, streamId: stream.id, displayName, stream, source };
				return next;
			}
			return [...prev, { id: tileId, participantId: remoteId, streamId: stream.id, displayName, stream, source }];
		});
	}

	function syncRemoteTilesForMediaState(remoteId: string, nextMedia: MediaState) {
		setRemoteTiles((prev) => {
			let changed = false;
			let next = prev.map((tile) => {
				if (tile.participantId !== remoteId) return tile;
				const source: "camera" | "screen" = nextMedia.screenStreamId && tile.streamId === nextMedia.screenStreamId ? "screen" : "camera";
				if (tile.source === source) return tile;
				changed = true;
				return { ...tile, source };
			});
			if (!nextMedia.isSharing) {
				const filtered = next.filter((tile) => !(tile.participantId === remoteId && tile.source === "screen"));
				if (filtered.length !== next.length) {
					changed = true;
					next = filtered;
				}
			}
			return changed ? next : prev;
		});
	}

	function removeRemote(remoteId: string) {
		setRemoteTiles((prev) => prev.filter((t) => t.participantId !== remoteId));
		setRemoteMediaState((prev) => {
			if (!prev[remoteId]) return prev;
			const next = { ...prev };
			delete next[remoteId];
			return next;
		});
		remoteMediaStateRef.current = Object.fromEntries(Object.entries(remoteMediaStateRef.current).filter(([id]) => id !== remoteId));
		screenSenderMapRef.current.delete(remoteId);
	}

	class ApiError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.status = status;
		}
	}

	async function apiGet<T>(path: string): Promise<T> {
		const res = await fetch(path, { method: "GET" });
		const json = (await res.json().catch(() => null)) as T;
		if (!res.ok) throw new ApiError(res.status, (json as any)?.error || "Request failed");
		return json;
	}

	async function apiPost<T>(path: string, body: unknown): Promise<T> {
		const res = await fetch(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const json = (await res.json().catch(() => null)) as T;
		if (!res.ok) throw new ApiError(res.status, (json as any)?.error || "Request failed");
		return json;
	}

	async function fetchRoomSettingsOnce() {
		const creds = myCredsRef.current;
		if (!creds) return;

		const url = new URL(`/api/connect/rooms/${encodeURIComponent(roomId)}/settings`, window.location.origin);
		url.searchParams.set("participantId", creds.participantId);
		url.searchParams.set("secret", creds.secret);
		let res: RoomSettingsResponse;
		try {
			res = await apiGet(url.toString());
		} catch (e) {
			if (isRoomEndedApiError(e)) {
				cleanupLocalState();
				goToConnectLanding({ notice: "Meeting ended." });
				return;
			}
			return;
		}
		if (!res.ok) return;
		setRoomSettings(res.room.settings);
		setIsHost(res.me?.isHost === true);
		setPendingAdmission(res.me?.status ? res.me.status !== "approved" : false);
	}

	async function saveRoomSettings(next: Partial<RoomSettings>) {
		const creds = myCredsRef.current;
		if (!creds) return;
		if (!isHostRef.current) {
			showToast("warn", "Only the host can change settings.");
			return;
		}
		setSavingSettings(true);
		try {
			const res = await apiPost<RoomSettingsUpdateResponse>(`/api/connect/rooms/${encodeURIComponent(roomId)}/settings`, {
				participantId: creds.participantId,
				secret: creds.secret,
				...next,
			});
			if (!res.ok) return;
			setRoomSettings(res.room.settings);
			setIsHost(res.room.hostParticipantId === creds.participantId);
			showToast("info", "Saved.", { ttlMs: 1400 });
		} catch (e) {
			showToast("error", e instanceof Error ? e.message : "Failed to save settings");
		} finally {
			setSavingSettings(false);
		}
	}

	async function pollWaitingRoomOnce() {
		const creds = myCredsRef.current;
		if (!creds) return;
		if (!isHostRef.current) return;
		if (!roomSettingsRef.current?.waitingRoomEnabled) {
			setWaitingRoom([]);
			return;
		}

		const url = new URL(`/api/connect/rooms/${encodeURIComponent(roomId)}/waiting`, window.location.origin);
		url.searchParams.set("participantId", creds.participantId);
		url.searchParams.set("secret", creds.secret);
		let res: WaitingRoomResponse;
		try {
			res = await apiGet(url.toString());
		} catch (e) {
			if (isRoomEndedApiError(e)) {
				cleanupLocalState();
				goToConnectLanding({ notice: "Meeting ended." });
				return;
			}
			return;
		}
		if (!res.ok) return;
		setWaitingRoom(res.waiting ?? []);
	}

	function startWaitingRoomPolling() {
		if (waitingRoomTimerRef.current) return;
		const tick = async () => {
			try {
				await pollWaitingRoomOnce();
			} catch {
				// ignore
			}
			waitingRoomTimerRef.current = window.setTimeout(tick, 1500);
		};
		waitingRoomTimerRef.current = window.setTimeout(tick, 250);
	}

	function stopWaitingRoomPolling() {
		if (waitingRoomTimerRef.current) window.clearTimeout(waitingRoomTimerRef.current);
		waitingRoomTimerRef.current = null;
		setWaitingRoom([]);
	}

	async function admitWaitingParticipant(targetParticipantId: string) {
		const creds = myCredsRef.current;
		if (!creds) return;
		await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/waiting/admit`, {
			participantId: creds.participantId,
			secret: creds.secret,
			targetParticipantId,
		});
		void pollWaitingRoomOnce().catch(() => null);
		void refreshParticipantsOnce().catch(() => null);
	}

	async function denyWaitingParticipant(targetParticipantId: string) {
		const creds = myCredsRef.current;
		if (!creds) return;
		await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/waiting/deny`, {
			participantId: creds.participantId,
			secret: creds.secret,
			targetParticipantId,
		});
		void pollWaitingRoomOnce().catch(() => null);
	}

	async function broadcastMediaState(next: MediaState) {
		const creds = myCredsRef.current;
		if (!creds) return;
		await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
			participantId: creds.participantId,
			secret: creds.secret,
			toParticipantId: null,
			kind: "media",
			payload: next,
		}).catch(() => null);
	}

	function buildVideoConstraints(facing: "user" | "environment") {
		// `facingMode` is widely supported on mobile; browsers that don't support it will ignore.
		return { facingMode: { ideal: facing } } as any;
	}

	async function detectBackCameraOnce() {
		if (typeof navigator === "undefined") return;
		if (!navigator.mediaDevices?.enumerateDevices) return;
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const videos = devices.filter((d) => d.kind === "videoinput");
			const labeledBack = videos.some((d) => /back|rear|environment/i.test(d.label || ""));
			setHasBackCamera(labeledBack || videos.length > 1);
		} catch {
			// ignore
		}
	}

	async function replaceLocalVideoTrack(local: MediaStream, newTrack: MediaStreamTrack) {
		// Replace video track in local stream
		for (const t of local.getVideoTracks()) {
			try {
				t.stop();
			} catch {
				// ignore
			}
			try {
				local.removeTrack(t);
			} catch {
				// ignore
			}
		}
		local.addTrack(newTrack);

		if (localVideoRef.current) {
			localVideoRef.current.srcObject = local;
			await localVideoRef.current.play().catch(() => null);
		}

		// Replace sender track for all peers
		for (const pc of peerMapRef.current.values()) {
			const sender = pc.getSenders().find((s) => s.track?.kind === "video");
			if (sender) await sender.replaceTrack(newTrack).catch(() => null);
			else {
				try {
					pc.addTrack(newTrack, local);
				} catch {
					// ignore
				}
			}
		}
	}

	async function ensureLocalMedia() {
		if (localStreamRef.current) return localStreamRef.current;

		if (typeof navigator === "undefined") throw new Error("No navigator");
		if (!navigator.mediaDevices?.getUserMedia) {
			const warning = typeof window !== "undefined" && !window.isSecureContext
				? "Camera/mic require HTTPS. Please use https://purelyautomation.com/connect"
				: "This browser doesn’t support camera/mic access.";
			showToast("warn", warning);
			throw new Error(warning);
		}

		const stream = await navigator.mediaDevices.getUserMedia({ video: buildVideoConstraints(cameraFacing), audio: true });
		localStreamRef.current = stream;
		setLocalStreamReady(true);
		void detectBackCameraOnce();
		try {
			localStorage.setItem(mediaGrantedKey(), "1");
		} catch {
			// ignore
		}

		if (localVideoRef.current) {
			localVideoRef.current.srcObject = stream;
			await localVideoRef.current.play().catch(() => null);
		}

		return stream;
	}

	function toastMediaIssue(err: unknown) {
		const d = describeGetUserMediaError(err);
		showToast("warn", d.warning, {
			details: d.details,
			actions: [
				{
					label: "Retry",
					onClick: () => {
						showChromeTemporarily();
						void ensureLocalMedia()
							.then((stream) => attachLocalTracksToExistingPeers(stream))
							.catch(() => null);
					},
				},
				{
					label: "Help",
					onClick: () => {
						showChromeTemporarily();
						window.open("https://support.google.com/chrome/answer/2693767", "_blank", "noopener,noreferrer");
					},
				},
			],
			ttlMs: 8000,
		});
	}

	async function shouldAutoStartMedia() {
		// Goal: avoid re-prompting on refresh for browsers that require a user gesture.
		// If Permissions API indicates "granted" OR we previously succeeded, we can auto-start.
		let previouslyGranted = false;
		try {
			previouslyGranted = localStorage.getItem(mediaGrantedKey()) === "1";
		} catch {
			// ignore
		}
		if (previouslyGranted) return true;

		const perms = (navigator as any)?.permissions;
		if (!perms?.query) return false;
		try {
			const cam = await perms.query({ name: "camera" });
			const mic = await perms.query({ name: "microphone" });
			return cam?.state === "granted" && mic?.state === "granted";
		} catch {
			return false;
		}
	}

	async function ensureCameraTrackOn() {
		let local = localStreamRef.current;
		if (!local) local = await ensureLocalMedia();

		const existing = local.getVideoTracks()[0];
		if (existing && existing.readyState === "live") {
			existing.enabled = true;
			return;
		}

		if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported");
		const camStream = await navigator.mediaDevices.getUserMedia({ video: buildVideoConstraints(cameraFacing), audio: false });
		const newTrack = camStream.getVideoTracks()[0];
		if (!newTrack) throw new Error("No camera available");
		await replaceLocalVideoTrack(local, newTrack);
	}

	function attachLocalTracksToExistingPeers(stream: MediaStream) {
		for (const [remoteId, pc] of peerMapRef.current.entries()) {
			const senders = pc.getSenders();
			const hasAudio = senders.some((s) => s.track?.kind === "audio");
			const hasVideo = senders.some((s) => s.track?.kind === "video" && s !== screenSenderMapRef.current.get(remoteId));

			for (const track of stream.getTracks()) {
				if (track.kind === "audio" && hasAudio) continue;
				if (track.kind === "video" && hasVideo) continue;
				try {
					pc.addTrack(track, stream);
				} catch {
					// ignore
				}
			}

			const screenTrack = screenStreamRef.current?.getVideoTracks?.()[0];
			if (screenTrack && !screenSenderMapRef.current.get(remoteId)) {
				try {
					const sender = pc.addTrack(screenTrack, screenStreamRef.current!);
					screenSenderMapRef.current.set(remoteId, sender);
				} catch {
					// ignore
				}
			}

			// If we are the offerer for this peer, negotiationneeded will fire.
			// For extra safety, kick it if stable.
			const creds = myCredsRef.current;
			if (creds && isOfferer(creds.participantId, remoteId) && pc.signalingState === "stable") {
				void sendOffer(remoteId).catch(() => null);
			}
		}
	}

	function buildIceServers(): RTCIceServer[] {
		const urlsRaw = process.env.NEXT_PUBLIC_CONNECT_TURN_URLS || "";
		const username = process.env.NEXT_PUBLIC_CONNECT_TURN_USERNAME || "";
		const credential = process.env.NEXT_PUBLIC_CONNECT_TURN_CREDENTIAL || "";

		const turnUrls = urlsRaw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
		if (turnUrls.length) {
			servers.push({ urls: turnUrls, username: username || undefined, credential: credential || undefined });
		}
		return servers;
	}

	function attachLocalTracksToPeer(pc: RTCPeerConnection, remoteParticipantId: string) {
		const local = getLocalStream();
		if (!local) {
			// Allow receiving even if local media isn't ready.
			try {
				pc.addTransceiver("audio", { direction: "recvonly" });
				pc.addTransceiver("video", { direction: "recvonly" });
			} catch {
				// ignore
			}
			return;
		}

		for (const track of local.getTracks()) {
			pc.addTrack(track, local);
		}

		const screenTrack = screenStreamRef.current?.getVideoTracks?.()[0];
		if (screenTrack && screenStreamRef.current) {
			const sender = pc.addTrack(screenTrack, screenStreamRef.current);
			screenSenderMapRef.current.set(remoteParticipantId, sender);
		}
	}

	function createPeer(remoteParticipantId: string) {
		const pc = new RTCPeerConnection({
			iceServers: buildIceServers(),
		});

		attachLocalTracksToPeer(pc, remoteParticipantId);

		pc.onnegotiationneeded = () => {
			const creds = myCredsRef.current;
			if (!creds) return;
			if (!isOfferer(creds.participantId, remoteParticipantId)) return;
			if (pc.signalingState !== "stable") return;
			if (makingOfferRef.current.get(remoteParticipantId)) return;

			makingOfferRef.current.set(remoteParticipantId, true);
			void (async () => {
				try {
					const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
					await pc.setLocalDescription(offer);
					await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
						participantId: creds.participantId,
						secret: creds.secret,
						toParticipantId: remoteParticipantId,
						kind: "offer",
						payload: pc.localDescription,
					});
				} catch {
					// ignore
				} finally {
					makingOfferRef.current.set(remoteParticipantId, false);
				}
			})();
		};

		pc.onicecandidate = (ev) => {
			if (!ev.candidate) return;
			const creds = myCredsRef.current;
			if (!creds) return;

			void apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
				participantId: creds.participantId,
				secret: creds.secret,
				toParticipantId: remoteParticipantId,
				kind: "ice",
				payload: ev.candidate.toJSON(),
			}).catch(() => null);
		};

		pc.oniceconnectionstatechange = () => {
			if (pc.iceConnectionState === "failed") {
				showToast(
					"warn",
					"Connection trouble (ICE failed).",
					{ details: "Often a network/firewall issue. Try a different network or refresh." },
				);
			}
		};

		pc.ontrack = (ev) => {
			const stream = ev.streams?.[0];
			if (!stream) return;

			const remoteName = participantsRef.current.find((p) => p.id === remoteParticipantId)?.displayName || "Participant";
			upsertRemoteStream(remoteParticipantId, remoteName, stream);
		};

		pc.onconnectionstatechange = () => {
			if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
				// Keep UI clean; we'll reconnect via participant refresh if needed.
				removeRemote(remoteParticipantId);
			}
		};

		peerMapRef.current.set(remoteParticipantId, pc);
		return pc;
	}

	function getOrCreatePeer(remoteParticipantId: string) {
		return peerMapRef.current.get(remoteParticipantId) ?? createPeer(remoteParticipantId);
	}

	async function sendOffer(remoteParticipantId: string) {
		const creds = myCredsRef.current;
		if (!creds) return;
		const pc = getOrCreatePeer(remoteParticipantId);
		if (pc.signalingState !== "stable") return;
		if (makingOfferRef.current.get(remoteParticipantId)) return;
		makingOfferRef.current.set(remoteParticipantId, true);
		try {
			const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
			await pc.setLocalDescription(offer);

			await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
				participantId: creds.participantId,
				secret: creds.secret,
				toParticipantId: remoteParticipantId,
				kind: "offer",
				payload: pc.localDescription,
			});
		} finally {
			makingOfferRef.current.set(remoteParticipantId, false);
		}
	}

	async function handleOffer(fromParticipantId: string, payload: any) {
		const creds = myCredsRef.current;
		if (!creds) return;
		const pc = getOrCreatePeer(fromParticipantId);

		await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);

		// Flush queued ICE
		const queued = pendingIceRef.current.get(fromParticipantId) ?? [];
		pendingIceRef.current.delete(fromParticipantId);
		for (const c of queued) {
			await pc.addIceCandidate(c).catch(() => null);
		}

		const answer = await pc.createAnswer();
		await pc.setLocalDescription(answer);

		await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
			participantId: creds.participantId,
			secret: creds.secret,
			toParticipantId: fromParticipantId,
			kind: "answer",
			payload: pc.localDescription,
		});
	}

	async function handleAnswer(fromParticipantId: string, payload: any) {
		const pc = peerMapRef.current.get(fromParticipantId);
		if (!pc) return;

		await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);

		const queued = pendingIceRef.current.get(fromParticipantId) ?? [];
		pendingIceRef.current.delete(fromParticipantId);
		for (const c of queued) {
			await pc.addIceCandidate(c).catch(() => null);
		}
	}

	async function handleIce(fromParticipantId: string, payload: any) {
		const pc = peerMapRef.current.get(fromParticipantId);
		if (!pc) {
			// We'll add after peer is created.
			const q = pendingIceRef.current.get(fromParticipantId) ?? [];
			q.push(payload);
			pendingIceRef.current.set(fromParticipantId, q);
			return;
		}

		if (!pc.remoteDescription) {
			const q = pendingIceRef.current.get(fromParticipantId) ?? [];
			q.push(payload);
			pendingIceRef.current.set(fromParticipantId, q);
			return;
		}

		await pc.addIceCandidate(payload as RTCIceCandidateInit).catch(() => null);
	}

	async function pollSignalsOnce() {
		const creds = myCredsRef.current;
		if (!creds) return;

		const url = new URL(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, window.location.origin);
		url.searchParams.set("participantId", creds.participantId);
		url.searchParams.set("secret", creds.secret);
		url.searchParams.set("afterSeq", String(afterSeqRef.current));
		url.searchParams.set("limit", "50");

		let res: { ok: boolean; signals: Signal[]; nextAfterSeq: number };
		try {
			res = await apiGet(url.toString());
		} catch (e) {
			if (isRoomEndedApiError(e)) {
				cleanupLocalState();
				goToConnectLanding({ notice: "Meeting ended." });
				return;
			}
			return;
		}
		if (!res.ok) return;

		if (typeof res.nextAfterSeq === "number") afterSeqRef.current = res.nextAfterSeq;
		const isPending = pendingAdmissionRef.current;

		for (const s of res.signals ?? []) {
			if (s.kind === "end") {
				cleanupLocalState();
				goToConnectLanding({ notice: "Meeting ended by the host." });
				return;
			}
			if (s.kind === "admit") {
				const pid = (s.payload as any)?.participantId;
				if (pid && pid === creds.participantId) {
					setPendingAdmission(false);
					showToast("info", "You’ve been admitted.");
					void fetchRoomSettingsOnce().catch(() => null);
					void refreshParticipantsOnce().catch(() => null);
					void broadcastMediaState(currentMediaStateSnapshot()).catch(() => null);
				}
				continue;
			}
			if (s.kind === "deny") {
				const pid = (s.payload as any)?.participantId;
				if (pid && pid === creds.participantId) {
					setPendingAdmission(false);
					await performLeave({ infoToast: null });
					showToast("error", "The host denied your request to join.", {
						actions: [
							{
								label: "Back",
								onClick: () => {
									window.location.href = "/connect";
								},
							},
						],
						ttlMs: 8000,
					});
				}
				continue;
			}
			if (isPending) continue;

			if (s.kind === "offer") await handleOffer(s.fromParticipantId, s.payload as any);
			else if (s.kind === "answer") await handleAnswer(s.fromParticipantId, s.payload as any);
			else if (s.kind === "ice") await handleIce(s.fromParticipantId, s.payload as any);
			else if (s.kind === "media") {
				const payload = s.payload as any;
				if (!payload || typeof payload !== "object") continue;
				const nextMedia: MediaState = {
					audioEnabled: payload.audioEnabled !== false,
					videoEnabled: payload.videoEnabled !== false,
					isSharing: payload.isSharing === true,
					cameraStreamId: typeof payload.cameraStreamId === "string" && payload.cameraStreamId.trim() ? payload.cameraStreamId.trim() : null,
					screenStreamId: typeof payload.screenStreamId === "string" && payload.screenStreamId.trim() ? payload.screenStreamId.trim() : null,
				};
				setRemoteMediaState((prev) => ({
					...prev,
					[s.fromParticipantId]: nextMedia,
				}));
				syncRemoteTilesForMediaState(s.fromParticipantId, nextMedia);
			}
			else if (s.kind === "leave") {
				const remoteId = (s.payload as any)?.participantId;
				if (remoteId) {
					peerMapRef.current.get(remoteId)?.close();
					peerMapRef.current.delete(remoteId);
					removeRemote(remoteId);
				}
			}
		}
	}

	function startPolling() {
		if (pollingRef.current) return;
		pollingRef.current = true;

		const tick = async () => {
			if (!pollingRef.current) return;
			try {
				await pollSignalsOnce();
			} catch {
				// ignore transient errors
			}
			if (!pollingRef.current) return;
			pollTimerRef.current = window.setTimeout(tick, 900);
		};

		pollTimerRef.current = window.setTimeout(tick, 250);
	}

	function stopPolling() {
		pollingRef.current = false;
		if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
		pollTimerRef.current = null;
	}

	async function refreshParticipantsOnce() {
		const creds = myCredsRef.current;
		if (!creds) return;

		const url = new URL(`/api/connect/rooms/${encodeURIComponent(roomId)}/participants`, window.location.origin);
		url.searchParams.set("participantId", creds.participantId);
		url.searchParams.set("secret", creds.secret);

		let res: { ok: boolean; pending?: boolean; participants: ParticipantPublic[] };
		try {
			res = await apiGet(url.toString());
		} catch (e) {
			if (isRoomEndedApiError(e)) {
				cleanupLocalState();
				goToConnectLanding({ notice: "Meeting ended." });
				return;
			}
			return;
		}
		if (!res.ok) return;

		if (res.pending) {
			setPendingAdmission(true);
			setParticipants([
				{ id: creds.participantId, displayName: creds.displayName, isGuest: creds.isGuest, createdAt: new Date().toISOString() },
			]);
			return;
		}

		setPendingAdmission(false);

		setParticipants(res.participants ?? []);

		const others = (res.participants ?? []).filter((p) => p.id !== creds.participantId);
		for (const p of others) {
			// Ensure peer exists
			const already = peerMapRef.current.get(p.id);
			if (!already) getOrCreatePeer(p.id);
			if (screenStreamRef.current && peerMapRef.current.get(p.id)?.signalingState === "stable") {
				void sendOffer(p.id).catch(() => null);
				continue;
			}

			// Deterministic caller: only offerer sends offer
			if (isOfferer(creds.participantId, p.id)) {
				// If we have no remote description yet, kick off an offer.
				const pc = peerMapRef.current.get(p.id);
				if (pc && !pc.currentRemoteDescription && pc.signalingState === "stable") {
					void sendOffer(p.id).catch(() => null);
				}
			}
		}
	}

	function startParticipantsRefresh() {
		if (participantsTimerRef.current) return;
		const tick = async () => {
			try {
				await refreshParticipantsOnce();
			} catch {
				// ignore
			}
			participantsTimerRef.current = window.setTimeout(tick, 2500);
		};
		participantsTimerRef.current = window.setTimeout(tick, 250);
	}

	function stopParticipantsRefresh() {
		if (participantsTimerRef.current) window.clearTimeout(participantsTimerRef.current);
		participantsTimerRef.current = null;
	}

	async function applyHostDefaultsIfNeeded(creds: ParticipantCreds, current: RoomSettings | null) {
		const desired = connectDefaultsRef.current.hostDefaults;
		if (!desired) return;
		if (!current) return;

		const patch: Partial<RoomSettings> = {};
		if (current.waitingRoomEnabled !== desired.waitingRoomEnabled) patch.waitingRoomEnabled = desired.waitingRoomEnabled;
		if (current.locked !== desired.locked) patch.locked = desired.locked;
		if (current.muteOnJoin !== desired.muteOnJoin) patch.muteOnJoin = desired.muteOnJoin;
		if (current.cameraOffOnJoin !== desired.cameraOffOnJoin) patch.cameraOffOnJoin = desired.cameraOffOnJoin;
		if (current.allowScreenShare !== desired.allowScreenShare) patch.allowScreenShare = desired.allowScreenShare;
		if (!Object.keys(patch).length) return;

		try {
			const res = await apiPost<RoomSettingsUpdateResponse>(`/api/connect/rooms/${encodeURIComponent(roomId)}/settings`, {
				participantId: creds.participantId,
				secret: creds.secret,
				...patch,
			});
			if (res.ok) setRoomSettings(res.room.settings);
		} catch {
			// ignore
		}
	}

	async function onJoin() {
		if (myCreds) return;
		setToasts([]);
		setJoining(true);

		try {
			const name = safeName(joinName);
			if (name) {
				try {
					localStorage.setItem(lastGuestNameKey(), name);
				} catch {
					// ignore
				}
			}
			const joinRes = await apiPost<RoomJoinResponse>(`/api/connect/rooms/${encodeURIComponent(roomId)}/join`, {
				displayName: name || undefined,
			});

			if (!joinRes.ok) throw new Error("Failed to join");

			const creds: ParticipantCreds = {
				participantId: joinRes.participant.id,
				secret: joinRes.participant.secret,
				displayName: joinRes.participant.displayName,
				isGuest: joinRes.participant.isGuest,
			};
			myCredsRef.current = creds;
			afterSeqRef.current = 0;

			setRoomSettings(joinRes.room?.settings ?? null);
			const isHostNow = joinRes.room?.hostParticipantId === creds.participantId;
			setIsHost(isHostNow);
			isHostRef.current = isHostNow;
			setPendingAdmission(joinRes.pending === true);

			const deviceDefaults = connectDefaultsRef.current;
			const defaultsMuted = joinRes.room?.settings?.muteOnJoin === true || deviceDefaults.startMuted === true;
			const defaultsCamOff = joinRes.room?.settings?.cameraOffOnJoin === true || deviceDefaults.startCameraOff === true;
			setIsMuted(defaultsMuted);
			setIsVideoOff(defaultsCamOff);

			setMyCreds(creds);
			setParticipants([
				...(joinRes.others ?? []),
				{ id: creds.participantId, displayName: creds.displayName, isGuest: creds.isGuest, createdAt: new Date().toISOString() },
			]);

			if (isHostNow && joinRes.room?.settings) {
				void applyHostDefaultsIfNeeded(creds, joinRes.room.settings);
			}

			localStorage.setItem(storageKey(roomId), JSON.stringify(creds));

			startPolling();
			startParticipantsRefresh();
			void fetchRoomSettingsOnce().catch(() => null);
			void broadcastMediaState(currentMediaStateSnapshot({ audioEnabled: !defaultsMuted, videoEnabled: !defaultsCamOff, isSharing: false })).catch(() => null);
			showChromeTemporarily();
			void ensureLocalMedia()
				.then((stream) => {
					// Apply meeting defaults
					for (const t of stream.getAudioTracks()) t.enabled = !defaultsMuted;
					for (const t of stream.getVideoTracks()) t.enabled = !defaultsCamOff;
					attachLocalTracksToExistingPeers(stream);
				})
				.catch((err) => {
					toastMediaIssue(err);
				});

			// If we already see others, offer where appropriate.
			if (!joinRes.pending) {
				for (const p of joinRes.others ?? []) {
					getOrCreatePeer(p.id);
					if (isOfferer(creds.participantId, p.id)) {
						await sendOffer(p.id);
					}
				}
			}
		} catch (e) {
			showToast("error", e instanceof Error ? e.message : "Failed to join");
		} finally {
			setJoining(false);
		}
	}

	function cleanupLocalState() {
		stopPolling();
		stopParticipantsRefresh();
		stopWaitingRoomPolling();
		afterSeqRef.current = 0;

		for (const pc of peerMapRef.current.values()) pc.close();
		peerMapRef.current.clear();
		screenSenderMapRef.current.clear();
		pendingIceRef.current.clear();

		for (const t of remoteTiles) {
			t.stream.getTracks().forEach((tr) => tr.stop());
		}
		setRemoteTiles([]);

		const local = localStreamRef.current;
		if (local) local.getTracks().forEach((tr) => tr.stop());
		localStreamRef.current = null;
		setLocalStreamReady(false);

		const screen = screenStreamRef.current;
		if (screen) screen.getTracks().forEach((tr) => tr.stop());
		screenStreamRef.current = null;
		setIsSharing(false);

		try {
			localStorage.removeItem(storageKey(roomId));
		} catch {
			// ignore
		}
		myCredsRef.current = null;
		setMyCreds(null);
		setIsMuted(false);
		setIsVideoOff(false);
		setIsSharing(false);
		setChromeVisible(true);
		if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
		chromeTimerRef.current = null;
		setTileHudVisible(false);
		setParticipants([]);
		setRoomSettings(null);
		setIsHost(false);
		setPendingAdmission(false);
		setWaitingRoom([]);
		setSavingSettings(false);
	}

	async function performLeave(opts?: { infoToast?: string | null }) {
		setToasts([]);

		try {
			if (myCreds) {
				await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/leave`, {
					participantId: myCreds.participantId,
					secret: myCreds.secret,
				});
			}
		} catch {
			// ignore
		} finally {
			cleanupLocalState();
			const infoToast = opts?.infoToast ?? "Left the meeting.";
			if (infoToast) showToast("info", infoToast);
		}
	}

	async function onLeave() {
		await performLeave();
	}

	async function onEndMeeting() {
		if (!myCredsRef.current) return;
		if (!isHostRef.current) {
			showToast("warn", "Only the host can end the meeting.");
			return;
		}
		setToasts([]);
		try {
			await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/end`, {
				participantId: myCredsRef.current.participantId,
				secret: myCredsRef.current.secret,
			});
		} catch (e) {
			if (isRoomEndedApiError(e)) {
				cleanupLocalState();
				goToConnectLanding({ notice: "Meeting ended." });
				return;
			}
			showToast("error", e instanceof Error ? e.message : "Failed to end meeting");
			return;
		}
		cleanupLocalState();
		goToConnectLanding({ notice: "You ended the meeting." });
	}

	function flipCamera() {
		void (async () => {
			const prevFacing = cameraFacing;
			const nextFacing: "user" | "environment" = prevFacing === "user" ? "environment" : "user";
			setCameraFacing(nextFacing);
			showChromeTemporarily();

			if (nextFacing === "environment" && !hasBackCamera) {
				// Still attempt to switch: some browsers don't expose labels, but facingMode works.
				showToast("info", "Switching camera…", { ttlMs: 1200 });
			}

			try {
				let local = localStreamRef.current;
				if (!local) {
					local = await ensureLocalMedia();
					attachLocalTracksToExistingPeers(local);
				}
				if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported");

				const camStream = await navigator.mediaDevices.getUserMedia({ video: buildVideoConstraints(nextFacing), audio: false });
				const newTrack = camStream.getVideoTracks()[0];
				if (!newTrack) throw new Error("No camera available");
				await replaceLocalVideoTrack(local, newTrack);
				void detectBackCameraOnce();

				// Preserve current video enabled state
				if (isVideoOff) {
					for (const t of local.getVideoTracks()) t.enabled = false;
				}
			} catch (err) {
				setCameraFacing(prevFacing);
				const msg = err && typeof err === "object" && "message" in err ? String((err as any).message) : "Unknown error";
				showToast("warn", "Could not switch camera.", { details: msg });
			}
		})();
	}

	function toggleMute() {
		void (async () => {
			let local = localStreamRef.current;
			if (!local) {
				try {
					local = await ensureLocalMedia();
					attachLocalTracksToExistingPeers(local);
				} catch (err) {
					toastMediaIssue(err);
					return;
				}
			}

			const audioTracks = local.getAudioTracks();
			const nextMuted = !isMuted;
			for (const t of audioTracks) t.enabled = !nextMuted;
			setIsMuted(nextMuted);
			void broadcastMediaState(currentMediaStateSnapshot({ audioEnabled: !nextMuted })).catch(() => null);
			showChromeTemporarily();
		})();
	}

	function toggleVideo() {
		void (async () => {
			let local = localStreamRef.current;
			if (!local) {
				try {
					local = await ensureLocalMedia();
					attachLocalTracksToExistingPeers(local);
				} catch (err) {
					toastMediaIssue(err);
					return;
				}
			}

			const nextOff = !isVideoOff;
			if (nextOff) {
				// Turning video off
				for (const t of local.getVideoTracks()) t.enabled = false;
				setIsVideoOff(true);
				void broadcastMediaState(currentMediaStateSnapshot({ videoEnabled: false })).catch(() => null);
				showChromeTemporarily();
				return;
			}

			// Turning video on - some devices require reacquiring/replacing the track
			try {
				await ensureCameraTrackOn();
				for (const t of local.getVideoTracks()) t.enabled = true;
				setIsVideoOff(false);
				void broadcastMediaState(currentMediaStateSnapshot({ videoEnabled: true })).catch(() => null);
				showChromeTemporarily();
			} catch (err) {
				toastMediaIssue(err);
			}
		})();
	}

	async function startShare() {
		if (isSharing) return;
		if (pendingAdmissionRef.current) {
			showToast("warn", "Waiting for host approval.");
			return;
		}
		if (roomSettings && roomSettings.allowScreenShare === false) {
			showToast("warn", "Screen sharing is disabled for this meeting.");
			return;
		}
		if (!navigator.mediaDevices?.getDisplayMedia) {
			showToast("warn", "Screen share is not currently supported on mobile.");
			return;
		}

		try {
			const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
			screenStreamRef.current = screen;
			setIsSharing(true);

			const screenTrack = screen.getVideoTracks()[0];
			if (!screenTrack) return;

			screenTrack.onended = () => {
				void stopShare();
			};

			for (const [remoteId, pc] of peerMapRef.current.entries()) {
				const existingScreenSender = screenSenderMapRef.current.get(remoteId);
				if (existingScreenSender) await existingScreenSender.replaceTrack(screenTrack).catch(() => null);
				else {
					try {
						const sender = pc.addTrack(screenTrack, screen);
						screenSenderMapRef.current.set(remoteId, sender);
					} catch {
						// ignore
					}
				}
				await sendOffer(remoteId).catch(() => null);
			}
			void broadcastMediaState(currentMediaStateSnapshot({ isSharing: true, screenStreamId: screen.id })).catch(() => null);
			showChromeTemporarily();
		} catch {
			showToast("warn", "Screen share is not currently supported on this device.");
		}
	}

	async function stopShare() {
		const screen = screenStreamRef.current;
		screenStreamRef.current = null;
		setIsSharing(false);
		if (screen) screen.getTracks().forEach((t) => t.stop());

		for (const [remoteId, pc] of peerMapRef.current.entries()) {
			const sender = screenSenderMapRef.current.get(remoteId);
			if (sender) {
				try {
					pc.removeTrack(sender);
				} catch {
					// ignore
				}
				screenSenderMapRef.current.delete(remoteId);
				await sendOffer(remoteId).catch(() => null);
			}
		}
		void broadcastMediaState(currentMediaStateSnapshot({ isSharing: false, screenStreamId: null })).catch(() => null);
		showChromeTemporarily();
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(meetingUrl);
			showToast("info", "Copied meeting link.");
		} catch {
			showToast("error", "Could not copy link");
		}
	}

	useEffect(() => {
		// Restore creds if present. This must run before any auto-join to avoid duplicate participants on refresh.
		storedCredsFoundRef.current = false;
		try {
			const raw = localStorage.getItem(storageKey(roomId));
			if (raw) {
				const parsed = JSON.parse(raw) as ParticipantCreds;
				if (parsed?.participantId && parsed?.secret) {
					storedCredsFoundRef.current = true;
					myCredsRef.current = parsed;
					setMyCreds(parsed);
					setJoinName(parsed.displayName);
					setParticipants([
						{ id: parsed.participantId, displayName: parsed.displayName, isGuest: parsed.isGuest, createdAt: new Date().toISOString() },
					]);
					// Prevent the auto-join effect from firing on this mount.
					autoJoinAttemptedRef.current = true;
					void (async () => {
						startPolling();
						startParticipantsRefresh();
						void fetchRoomSettingsOnce().catch(() => null);
						await refreshParticipantsOnce().catch(() => null);
					})();
				}
			}
		} catch {
			// ignore
		}
	}, [roomId]);

	useEffect(() => {
		// If user came from a shared link, prefer auto-fill name.
		if (myCreds) return;
		if (safeName(joinName)) return;
		try {
			const fromStorage = localStorage.getItem(lastGuestNameKey());
			if (fromStorage) setJoinName(fromStorage);
		} catch {
			// ignore
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [roomId, myCreds]);

	useEffect(() => {
		// If user signs in (employee or portal) while on this page, don't require a manual refresh.
		// Only populate the join name if the user hasn't typed something already.
		if (myCreds) return;
		const next = safeName(props.signedInName ?? "");
		if (!next) return;
		if (safeName(joinName)) return;
		setJoinName(next);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.signedInName, myCreds]);

	useEffect(() => {
		// Auto-join if we already have a name (employee signed-in or stored guest name).
		if (autoJoinAttemptedRef.current) return;
		if (myCreds) return;
		if (storedCredsFoundRef.current) return;
		const name = safeName(joinName);
		if (!name) return;
		autoJoinAttemptedRef.current = true;
		void onJoin();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [joinName, myCreds]);

	useEffect(() => {
		participantsRef.current = participants;
		// Keep names correct even if tracks arrive before participants refresh.
		setRemoteTiles((prev) => {
			let changed = false;
			const next = prev.map((t) => {
				const name = participants.find((p) => p.id === t.participantId)?.displayName;
				if (name && name !== t.displayName) {
					changed = true;
					return { ...t, displayName: name };
				}
				return t;
			});
			return changed ? next : prev;
		});
	}, [participants]);

	useEffect(() => {
		if (!myCreds) return;

		let cancelled = false;
		void (async () => {
			try {
				startPolling();
				startParticipantsRefresh();
				void fetchRoomSettingsOnce().catch(() => null);
				void (async () => {
					try {
						if (await shouldAutoStartMedia()) await ensureLocalMedia();
					} catch {
						showToast("info", "Tap the mic/camera buttons to enable audio/video.");
					}
				})();
				if (!pendingAdmissionRef.current) {
					void broadcastMediaState(currentMediaStateSnapshot()).catch(() => null);
				}
				showChromeTemporarily();
				if (cancelled) return;
				await refreshParticipantsOnce();
			} catch {
				// ignore
			}
		})();

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [myCreds?.participantId]);

	useEffect(() => {
		const peers = peerMapRef.current;
		return () => {
			stopPolling();
			stopParticipantsRefresh();
			stopWaitingRoomPolling();
			for (const pc of peers.values()) pc.close();
			peers.clear();
		};
	}, []);

	useEffect(() => {
		if (!myCreds) return;
		void fetchRoomSettingsOnce().catch(() => null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [myCreds?.participantId]);

	useEffect(() => {
		if (!myCreds) return;
		if (!isHost) {
			stopWaitingRoomPolling();
			return;
		}
		if (!roomSettings?.waitingRoomEnabled) {
			stopWaitingRoomPolling();
			return;
		}
		startWaitingRoomPolling();
		return () => {
			stopWaitingRoomPolling();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [myCreds?.participantId, isHost, roomSettings?.waitingRoomEnabled]);

	const myName = myCreds?.displayName ?? safeName(joinName);
	const otherParticipants = myCreds ? participants.filter((p) => p.id !== myCreds.participantId) : [];

	const statusLine = useMemo(() => {
		if (!myCreds) return "Not joined";
		if (pendingAdmission) return "Waiting for host approval…";
		const others = participants.filter((p) => p.id !== myCreds.participantId);
		if (!others.length) return "Waiting for someone to join…";
		return `In call with ${others.map((p) => p.displayName).join(", ")}`;
	}, [participants, myCreds, pendingAdmission]);

	const othersCount = myCreds ? participants.filter((p) => p.id !== myCreds.participantId).length : 0;
	const showPreCallInfo = myCreds ? othersCount === 0 : true;
	const inActiveCall = Boolean(myCreds && !pendingAdmission && othersCount > 0);

	const stageHeightClass = showPreCallInfo
		? "h-[calc(100svh-190px)] sm:h-[calc(100svh-170px)]"
		: "h-[calc(100svh-140px)] sm:h-[calc(100svh-120px)]";
	const showLocalScreenTile = Boolean(isSharing && screenStreamRef.current);

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top,#edf4ff_0%,#f8fafc_36%,#f1f5f9_100%)] text-brand-ink">
			<div className="fixed left-1/2 top-4 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 space-y-2 px-2">
				{toasts.map((t) => (
					<div
						key={t.id}
						role="status"
						className={
							"rounded-2xl border px-4 py-3 shadow-lg backdrop-blur " +
							(t.kind === "error"
								? "border-red-200 bg-red-50/95 text-red-900"
								: t.kind === "warn"
									? "border-amber-200 bg-amber-50/95 text-amber-900"
									: "border-zinc-200 bg-white/95 text-zinc-900")
						}
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="text-base font-medium">{t.message}</div>
								{t.details ? <div className="mt-1 text-sm opacity-80">{t.details}</div> : null}
								{t.actions?.length ? (
									<div className="mt-2 flex flex-wrap gap-2">
										{t.actions.map((a) => (
											<button
												key={a.label}
												onClick={() => {
													a.onClick();
													dismissToast(t.id);
												}}
												className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
											>
												{a.label}
											</button>
										))}
									</div>
								) : null}
							</div>
							<button
								onClick={() => dismissToast(t.id)}
								className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm hover:bg-zinc-50"
								aria-label="Dismiss"
								title="Dismiss"
							>
								×
							</button>
						</div>
					</div>
				))}
			</div>

			<div className="mx-auto w-full max-w-none px-3 py-4 sm:px-6 sm:py-8">
				<div
					className={
						"rounded-[30px] border border-white/75 bg-white/82 px-4 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.07)] backdrop-blur-xl transition sm:flex sm:flex-row sm:items-center sm:justify-between sm:px-5 " +
						(chromeVisible ? "opacity-100" : "pointer-events-none opacity-0")
					}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="min-w-0">
						<div className="flex items-center gap-3">
							<div className="relative h-8 w-32">
								<Image src="/brand/3.png" alt="Purely Connect" fill className="object-contain" priority />
							</div>
							<div className="text-lg font-semibold text-zinc-900">Meeting</div>
						</div>
						<div className="mt-1 truncate text-sm text-zinc-500">Room: {roomId}</div>
					</div>

						<div className="mt-3 flex items-center justify-between gap-2 sm:mt-0 sm:justify-end sm:gap-3">
							<button
								onClick={() => void copyLink()}
								className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/90 px-3.5 py-2.5 text-sm font-medium text-zinc-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:bg-white"
							>
								<PortalCopyGlyph className="h-4 w-4 text-zinc-900" />
								<span className="hidden sm:inline">Copy invite</span>
							</button>
							<div ref={headerMenuRef} className="relative flex items-center">
						<button
							ref={headerMenuButtonRef}
							onClick={() => setHeaderMenuOpen((p) => !p)}
								className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white/90 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:bg-white"
							aria-label="Meeting menu"
							title="Meeting menu"
						>
							<DotsIcon />
						</button>
						{headerMenuOpen ? (
							<div
								className="fixed z-50 overflow-auto rounded-[26px] border border-zinc-200/80 bg-white/96 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl"
								style={headerMenuStyle ?? undefined}
							>
								<div className="p-2">
									<Link
										href="/connect"
										onClick={() => setHeaderMenuOpen(false)}
										className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
									>
										<ArrowLeftIcon />
										Back
									</Link>

									<button
										onClick={() => {
											setHeaderMenuOpen(false);
											void copyLink();
										}}
										className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
									>
											<PortalCopyGlyph className="h-5 w-5 text-zinc-900" />
										Copy link
									</button>
								</div>

								<div className="h-px bg-zinc-200" />

								<div className="p-3">
									<div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2">
										<div>
											<div className="text-sm font-semibold text-zinc-900">Mirror self view</div>
											<div className="mt-0.5 text-xs text-zinc-600">Front camera acts like a mirror.</div>
										</div>
										<ToggleSwitch
											checked={mirrorSelf}
											onChange={(checked) => {
												setMirrorSelf(checked);
												setConnectDefaults((prev) => ({ ...prev, mirrorSelf: checked }));
												try {
													localStorage.setItem(mirrorPrefKey(), checked ? "1" : "0");
												} catch {
													// ignore
												}
											}}
											ariaLabel="Mirror self view"
										/>
									</div>
								</div>

								{myCreds ? (
									<div className="p-2">
										{isHost ? (
											<button
												onClick={() => {
														setHeaderMenuOpen(false);
														void onEndMeeting();
													}}
													className="flex w-full items-center gap-3 rounded-xl bg-red-600 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-red-500"
												>
											<EndMeetingIcon />
											End meeting for everyone
										</button>
										) : (
											<button
												onClick={() => {
														setHeaderMenuOpen(false);
														void onLeave();
													}}
													className="flex w-full items-center gap-3 rounded-xl bg-red-600 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-red-500"
												>
											<PhoneHangupIcon />
											Leave meeting
										</button>
										)}
									</div>
								) : null}
							</div>
						) : null}
						</div>
					</div>
				</div>

				{!myCreds ? (
					<div className="mt-6 overflow-hidden rounded-4xl border border-white/75 bg-white/88 p-6 shadow-[0_20px_54px_rgba(15,23,42,0.09)] backdrop-blur-xl sm:max-w-3xl sm:p-8">
						<h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Join this meeting</h1>
						<p className="mt-2 max-w-2xl text-base text-zinc-600">Enter your name to step into the room. Your saved audio, camera, and mirror defaults still apply on this device.</p>

						<div className="mt-5">
							<ConnectAuthPanel defaultOpen={false} />
						</div>

						<div className="mt-4 flex flex-col gap-3 sm:flex-row">
							<input
								value={joinName}
								onChange={(e) => setJoinName(e.target.value)}
								placeholder="Your name"
								className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-zinc-400"
							/>
							<button
								onClick={onJoin}
								disabled={joining || !safeName(joinName)}
								className="rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-base font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.2)] hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{joining ? "Joining…" : "Join"}
							</button>
						</div>

					</div>
				) : (
					<div className="mt-6">
						{showPreCallInfo ? (
							<div className="mb-2 rounded-[28px] border border-white/75 bg-white/88 p-5 shadow-[0_16px_44px_rgba(15,23,42,0.07)] backdrop-blur-xl">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<div className="text-sm text-zinc-600">Signed in as</div>
										<div className="text-xl font-semibold text-zinc-900">{myName || "You"}</div>
										<div className="mt-1 text-base text-zinc-600">{statusLine}</div>
									</div>
									<div className="text-sm text-zinc-500">{pendingAdmission ? "Pending approval" : isHost ? "Host" : "Connected"}</div>
								</div>
								{!inActiveCall ? (
									<div className="mt-4" onClick={(e) => e.stopPropagation()}>
										<ConnectAuthPanel defaultOpen={false} hideWhenSignedIn />
									</div>
								) : null}
							</div>
						) : null}

						<div
							className={"mt-4 grid auto-rows-fr gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 " + stageHeightClass}
							onClick={() => {
								toggleTileHud();
								showChromeTemporarily();
							}}
						>
							{showLocalScreenTile ? (
								<StageTile
									label="Screen"
									name={myName ? `${myName}'s share` : "Your screen"}
									videoEl={<video ref={screenVideoRef} muted playsInline autoPlay className="h-full w-full bg-black object-contain" />}
									videoEnabled={true}
									audioEnabled={!isMuted}
									isSharing={true}
									loading={false}
									hudVisible={tileHudVisible}
									emphasized={true}
								/>
							) : null}
							<StageTile
								label="You"
								name={myName || "You"}
								videoEl={
									<video
										ref={localVideoRef}
										muted
										playsInline
										autoPlay
										className="h-full w-full object-cover"
										style={{ transform: mirrorSelf && cameraFacing === "user" ? "scaleX(-1)" : undefined }}
									/>
								}
								videoEnabled={!isVideoOff}
								audioEnabled={!isMuted}
								isSharing={isSharing}
								loading={!localStreamReady}
								hudVisible={tileHudVisible}
							/>

							{remoteTiles.length ? (
								remoteTiles.map((t) => (
									<RemoteTile
										key={t.id}
										tile={t}
										media={remoteMediaState[t.id]}
										hudVisible={tileHudVisible}
									/>
								))
							) : pendingAdmission ? (
								<div className="relative overflow-hidden rounded-[26px] bg-zinc-950" onClick={(e) => e.stopPropagation()}>
									<div className="absolute inset-0 bg-linear-to-br from-blue-500/18 via-slate-950/55 to-black/90" />
									<div className="relative h-full p-6 text-white">
										<div className="text-lg font-semibold">Request to join sent</div>
										<div className="mt-2 max-w-md text-base text-white/78">Waiting for the host to approve you.</div>
										<div className="mt-4 flex flex-wrap gap-2">
											<button
												onClick={() => void performLeave({ infoToast: null })}
												className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
											>
												Cancel
											</button>
										</div>
									</div>
								</div>
							) : showPreCallInfo && isHost && roomSettings ? (
								<div className="relative h-full overflow-auto rounded-[26px] border border-white/80 bg-white/92 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
									<div className="flex items-start justify-between gap-3">
										<div>
											<div className="text-lg font-semibold text-zinc-900">Meeting settings</div>
											<div className="mt-1 text-sm text-zinc-600">You’re the host. Changes apply immediately.</div>
										</div>
										{savingSettings ? (
											<div className="text-sm font-semibold text-zinc-600">Saving…</div>
										) : null}
									</div>

									<div className="mt-4 grid gap-3">
										<label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
											<span className="text-sm font-semibold text-zinc-900">Waiting room</span>
																		<ToggleSwitch
																			checked={roomSettings.waitingRoomEnabled}
																			disabled={savingSettings}
																			onChange={(checked) => void saveRoomSettings({ waitingRoomEnabled: checked })}
																			ariaLabel="Waiting room"
																		/>
										</label>

										<label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
											<span className="text-sm font-semibold text-zinc-900">Lock meeting</span>
																		<ToggleSwitch
																			checked={roomSettings.locked}
																			disabled={savingSettings}
																			onChange={(checked) => void saveRoomSettings({ locked: checked })}
																			ariaLabel="Lock meeting"
																		/>
										</label>

										<label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
											<span className="text-sm font-semibold text-zinc-900">Mute on join</span>
																		<ToggleSwitch
																			checked={roomSettings.muteOnJoin}
																			disabled={savingSettings}
																			onChange={(checked) => void saveRoomSettings({ muteOnJoin: checked })}
																			ariaLabel="Mute on join"
																		/>
										</label>

										<label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
											<span className="text-sm font-semibold text-zinc-900">Camera off on join</span>
																		<ToggleSwitch
																			checked={roomSettings.cameraOffOnJoin}
																			disabled={savingSettings}
																			onChange={(checked) => void saveRoomSettings({ cameraOffOnJoin: checked })}
																			ariaLabel="Camera off on join"
																		/>
										</label>

										<label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
											<span className="text-sm font-semibold text-zinc-900">Allow screen share</span>
																		<ToggleSwitch
																			checked={roomSettings.allowScreenShare}
																			disabled={savingSettings}
																			onChange={(checked) => void saveRoomSettings({ allowScreenShare: checked })}
																			ariaLabel="Allow screen share"
																		/>
										</label>
									</div>

									{roomSettings.waitingRoomEnabled ? (
										<div className="mt-5">
											<div className="flex items-center justify-between">
												<div className="text-sm font-semibold text-zinc-900">Waiting room</div>
												<button
													onClick={() => void pollWaitingRoomOnce()}
													className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
												>
													Refresh
												</button>
											</div>
											{waitingRoom.length ? (
												<div className="mt-3 space-y-2">
													{waitingRoom.map((p) => (
														<div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
															<div className="min-w-0">
																<div className="truncate text-sm font-semibold text-zinc-900">{p.displayName}</div>
																<div className="mt-0.5 text-xs text-zinc-500">Requesting to join</div>
															</div>
															<div className="flex shrink-0 items-center gap-2">
																<button
																	onClick={() => void admitWaitingParticipant(p.id)}
																	className="rounded-2xl bg-brand-ink px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
																>
																	Admit
																</button>
																<button
																	onClick={() => void denyWaitingParticipant(p.id)}
																	className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
																>
																	Deny
																</button>
															</div>
														</div>
													))}
												</div>
											) : (
												<div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
													No one is waiting right now.
												</div>
											)}
										</div>
									) : null}
								</div>
							) : otherParticipants.length ? (
								<div className="relative overflow-hidden rounded-[26px] bg-zinc-950">
									<div className="absolute inset-0 bg-linear-to-br from-brand-blue/18 via-slate-950/55 to-black/90" />
									<div className="relative h-full p-6 text-white">
										<div className="text-lg font-semibold">Connecting…</div>
										<div className="mt-2 max-w-xl text-base text-white/78">
											Trying to connect to {otherParticipants.map((p) => p.displayName).join(", ")}. This can take a few seconds.
										</div>
										<div className="mt-3 text-sm text-white/60">If it hangs, refresh the page.</div>
									</div>
								</div>
							) : (
								<div className="relative overflow-hidden rounded-[26px] bg-zinc-950">
									<div className="absolute inset-0 bg-linear-to-br from-blue-500/16 via-slate-950/55 to-black/90" />
									<div className="relative h-full p-6 text-white">
										<div className="text-lg font-semibold">Waiting for someone to join</div>
										<div className="mt-2 max-w-md text-base text-white/78">Share the link and they’ll appear here.</div>
										<button
											onClick={() => void copyLink()}
											className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
										>
											<PortalCopyGlyph className="h-4 w-4 text-white" />
											Copy invite link
										</button>
									</div>
								</div>
							)}
						</div>

						<div
							className={
								"fixed inset-x-0 bottom-5 z-10 flex justify-center px-4 transition " +
								(chromeVisible ? "opacity-100" : "pointer-events-none opacity-0")
							}
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-[28px] border border-white/10 bg-zinc-950/80 px-2 py-2 shadow-[0_18px_44px_rgba(0,0,0,0.26)] backdrop-blur-xl sm:gap-2 sm:px-2.5 sm:py-2.5">
								<IconButton
									label={isMuted ? "Unmute" : "Mute"}
									onClick={toggleMute}
									active={!isMuted}
									icon={isMuted ? <MicOffIcon /> : <MicIcon />}
								/>
								<IconButton
									label={isVideoOff ? "Start video" : "Stop video"}
									onClick={toggleVideo}
									active={!isVideoOff}
									icon={isVideoOff ? <VideoOffIcon /> : <VideoIcon />}
								/>
								<IconButton
									label={!isSharing ? "Share screen" : "Stop sharing"}
									onClick={!isSharing ? startShare : stopShare}
									active={isSharing}
									icon={!isSharing ? <ScreenShareIcon /> : <ScreenStopIcon />}
								/>
								<div className="mx-1 hidden h-8 w-px bg-white/12 sm:block" />
								<IconButton
									label={cameraFacing === "user" ? "Back camera" : "Front camera"}
									onClick={flipCamera}
									active={true}
									icon={<CameraFlipIcon />}
								/>
								<div className="mx-1 hidden h-8 w-px bg-white/12 sm:block" />
								<button
									onClick={onLeave}
									className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-400/20 bg-red-500 text-white shadow-[0_10px_30px_rgba(239,68,68,0.28)] transition hover:bg-red-400 sm:h-12 sm:w-12"
									aria-label="Leave"
									title="Leave"
								>
									<PhoneHangupIcon />
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function IconButton(props: { label: string; onClick: () => void; icon: ReactNode; active: boolean }) {
	return (
		<button
			onClick={props.onClick}
			className={
				"group flex h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition sm:h-12 " +
				(props.active
					? "border-brand-blue/25 bg-brand-blue/95 text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] hover:-translate-y-0.5 hover:bg-blue-500"
					: "border-white/10 bg-white/8 text-white hover:-translate-y-0.5 hover:bg-white/15")
			}
			aria-label={props.label}
			title={props.label}
		>
			<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-current group-hover:scale-[1.02]">{props.icon}</span>
			<span className="hidden whitespace-nowrap pr-1 md:inline">{props.label}</span>
		</button>
	);
}

function MicIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-current">
			<path d="M19 10V12C19 15.866 15.866 19 12 19M5 10V12C5 15.866 8.13401 19 12 19M12 19V22M8 22H16M12 15C10.3431 15 9 13.6569 9 12V5C9 3.34315 10.3431 2 12 2C13.6569 2 15 3.34315 15 5V12C15 13.6569 13.6569 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
		</svg>
	);
	}

function MicOffIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-current">
			<path d="M4 12V13C4 17.4183 7.58172 21 12 21C14.4653 21 16.6701 19.8849 18.1376 18.1316M2 2L22 22M16 10.4V7C16 4.79086 14.2091 3 12 3C11.0406 3 10.1601 3.33778 9.47086 3.9009M12 17C9.79086 17 8 15.2091 8 13V8L15.2815 15.288C14.5585 16.323 13.3583 17 12 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
		</svg>
	);
	}

function VideoIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-current">
			<path d="M2 8.37722C2 8.0269 2 7.85174 2.01462 7.70421C2.1556 6.28127 3.28127 5.1556 4.70421 5.01462C4.85174 5 5.03636 5 5.40558 5C5.54785 5 5.61899 5 5.67939 4.99634C6.45061 4.94963 7.12595 4.46288 7.41414 3.746C7.43671 3.68986 7.45781 3.62657 7.5 3.5C7.54219 3.37343 7.56329 3.31014 7.58586 3.254C7.87405 2.53712 8.54939 2.05037 9.32061 2.00366C9.38101 2 9.44772 2 9.58114 2H14.4189C14.5523 2 14.619 2 14.6794 2.00366C15.4506 2.05037 16.126 2.53712 16.4141 3.254C16.4367 3.31014 16.4578 3.37343 16.5 3.5C16.5422 3.62657 16.5633 3.68986 16.5859 3.746C16.874 4.46288 17.5494 4.94963 18.3206 4.99634C18.381 5 18.4521 5 18.5944 5C18.9636 5 19.1483 5 19.2958 5.01462C20.7187 5.1556 21.8444 6.28127 21.9854 7.70421C22 7.85174 22 8.0269 22 8.37722V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V8.37722Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
			<path d="M12 16.5C14.2091 16.5 16 14.7091 16 12.5C16 10.2909 14.2091 8.5 12 8.5C9.79086 8.5 8 10.2909 8 12.5C8 14.7091 9.79086 16.5 12 16.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
		</svg>
	);
	}

function VideoOffIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-current">
			<path d="M5 5H5.41886C5.55228 5 5.61899 5 5.67939 4.99634C6.45061 4.94963 7.12595 4.46288 7.41414 3.746C7.43671 3.68986 7.45781 3.62657 7.5 3.5C7.54219 3.37343 7.56329 3.31014 7.58586 3.254C7.87405 2.53712 8.54939 2.05037 9.32061 2.00366C9.38101 2 9.44772 2 9.58114 2H14.4189C14.5523 2 14.619 2 14.6794 2.00366C15.4506 2.05037 16.126 2.53712 16.4141 3.254C16.4367 3.31014 16.4578 3.37343 16.5 3.5C16.5422 3.62657 16.5633 3.68986 16.5859 3.746C16.874 4.46288 17.5494 4.94963 18.3206 4.99634C18.381 5 18.4521 5 18.5944 5C18.9636 5 19.1483 5 19.2958 5.01462C20.7187 5.1556 21.8444 6.28127 21.9854 7.70421C22 7.85174 22 8.0269 22 8.37722V18C22 19.0849 21.4241 20.0353 20.5613 20.5622M15.0641 15.0714C15.6482 14.3761 16 13.4791 16 12.5C16 10.2909 14.2091 8.5 12 8.5C11.0216 8.5 10.1252 8.8513 9.43012 9.43464M22 22L2 2M2 7.5V16.2C2 17.8802 2 18.7202 2.32698 19.362C2.6146 19.9265 3.07354 20.3854 3.63803 20.673C4.27976 21 5.11984 21 6.8 21H15.5M12 16.5C9.79086 16.5 8 14.7091 8 12.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
		</svg>
	);
	}

function ScreenShareIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-current">
			<path d="M8 21H16M12 17V21M6.8 17H17.2C18.8802 17 19.7202 17 20.362 16.673C20.9265 16.3854 21.3854 15.9265 21.673 15.362C22 14.7202 22 13.8802 22 12.2V7.8C22 6.11984 22 5.27976 21.673 4.63803C21.3854 4.07354 20.9265 3.6146 20.362 3.32698C19.7202 3 18.8802 3 17.2 3H6.8C5.11984 3 4.27976 3 3.63803 3.32698C3.07354 3.6146 2.6146 4.07354 2.32698 4.63803C2 5.27976 2 6.11984 2 7.8V12.2C2 13.8802 2 14.7202 2.32698 15.362C2.6146 15.9265 3.07354 16.3854 3.63803 16.673C4.27976 17 5.11984 17 6.8 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
		</svg>
	);
	}

function ScreenStopIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-current">
			<path d="M8 21H16M12 17V21M6.8 17H17.2C18.8802 17 19.7202 17 20.362 16.673C20.9265 16.3854 21.3854 15.9265 21.673 15.362C22 14.7202 22 13.8802 22 12.2V7.8C22 6.11984 22 5.27976 21.673 4.63803C21.3854 4.07354 20.9265 3.6146 20.362 3.32698C19.7202 3 18.8802 3 17.2 3H6.8C5.11984 3 4.27976 3 3.63803 3.32698C3.07354 3.6146 2.6146 4.07354 2.32698 4.63803C2 5.27976 2 6.11984 2 7.8V12.2C2 13.8802 2 14.7202 2.32698 15.362C2.6146 15.9265 3.07354 16.3854 3.63803 16.673C4.27976 17 5.11984 17 6.8 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
			<path d="M7 7L17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
		</svg>
	);
	}
function DotsIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<circle cx="12" cy="5" r="1.6" fill="currentColor" />
			<circle cx="12" cy="12" r="1.6" fill="currentColor" />
			<circle cx="12" cy="19" r="1.6" fill="currentColor" />
		</svg>
	);
}

function ArrowLeftIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path d="M10 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

function CopyIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path
				d="M9 9h10v10H9V9Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<path
				d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function EndMeetingIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
			<path
				d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
				stroke="currentColor"
				strokeWidth="2"
			/>
			<path d="M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

function CameraFlipIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path
				d="M7 7h3l1-2h2l1 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<path
				d="M15.5 11.2a4.5 4.5 0 0 0-7.6 1.5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<path d="M8 11.2v2.6h2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
			<path
				d="M8.5 14.8a4.5 4.5 0 0 0 7.6-1.5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<path d="M16 14.8v-2.6h-2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function PhoneHangupIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
			<path
				d="M21 15.5c-2.5-2-5.5-3-9-3s-6.5 1-9 3V19c0 .6.4 1 1 1h3c.4 0 .8-.3 1-.7l.6-1.7c1.1-.3 2.3-.6 3.4-.6s2.3.2 3.4.6l.6 1.7c.1.4.5.7 1 .7h3c.6 0 1-.4 1-1v-3.5Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function RemoteTile(props: { tile: { id: string; displayName: string; stream: MediaStream; source: "camera" | "screen" }; media?: MediaState; hudVisible: boolean }) {
	const videoRef = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		if (!videoRef.current) return;
		videoRef.current.srcObject = props.tile.stream;
		void videoRef.current.play().catch(() => null);
	}, [props.tile.stream]);

	return (
		<StageTile
			label={props.tile.source === "screen" ? "Screen" : ""}
			name={props.tile.displayName || "Guest"}
			videoEl={<video ref={videoRef} playsInline autoPlay className={"h-full w-full " + (props.tile.source === "screen" ? "bg-black object-contain" : "object-cover")} />}
			videoEnabled={props.tile.source === "screen" ? true : props.media?.videoEnabled !== false}
			audioEnabled={props.media?.audioEnabled !== false}
			isSharing={props.tile.source === "screen" || props.media?.isSharing === true}
			loading={false}
			hudVisible={props.hudVisible}
			emphasized={props.tile.source === "screen"}
		/>
	);
}

function StageTile(props: {
	label: string;
	name: string;
	videoEl: ReactNode;
	videoEnabled: boolean;
	audioEnabled: boolean;
	isSharing: boolean;
	loading: boolean;
	hudVisible: boolean;
	emphasized?: boolean;
}) {
	const initials = (props.name || "?")
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase())
		.join("");

	return (
		<div className={"relative h-full overflow-hidden rounded-[26px] border border-white/10 bg-zinc-950 shadow-[0_20px_44px_rgba(15,23,42,0.22)] " + (props.emphasized ? "sm:col-span-2 xl:col-span-2 ring-1 ring-brand-blue/25" : "") }>
			<div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/6 via-transparent to-black/35" />
			<div className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-inset ring-white/6" />
			<div className="absolute inset-0">
				<div className={"h-full w-full " + (props.videoEnabled ? "opacity-100" : "opacity-0")}>
					{props.videoEl}
				</div>
				{!props.videoEnabled ? (
					<div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
						<div className="flex h-18 w-18 items-center justify-center rounded-full border border-white/10 bg-white/8 text-xl font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)] sm:h-20 sm:w-20 sm:text-2xl">
							{initials || "?"}
						</div>
					</div>
				) : null}
				{props.loading ? (
					<div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white/80">
						<div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm">Connecting…</div>
					</div>
				) : null}
			</div>

			{props.hudVisible ? (
				<div className="absolute inset-x-0 bottom-0 p-3" onClick={(e) => e.stopPropagation()}>
					<div className="flex items-end justify-between rounded-2xl border border-white/10 bg-black/38 px-3 py-2.5 text-white backdrop-blur-xl">
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold">{props.label ? `${props.label} · ` : ""}{props.name}</div>
							<div className="mt-0.5 text-xs text-white/68">
								{props.isSharing ? "Sharing" : ""}
								{props.isSharing ? " · " : ""}
								{props.audioEnabled ? "Mic on" : "Muted"} · {props.videoEnabled ? "Camera on" : "Camera off"}
							</div>
						</div>
						<div className="ml-3 flex items-center gap-2">
							{!props.audioEnabled ? (
								<span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10" title="Muted">
									<MicOffIcon />
								</span>
							) : null}
							{!props.videoEnabled ? (
								<span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10" title="Camera off">
									<VideoOffIcon />
								</span>
							) : null}
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
