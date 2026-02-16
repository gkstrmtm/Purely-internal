"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

	const [remoteTiles, setRemoteTiles] = useState<Array<{ id: string; displayName: string; stream: MediaStream }>>([]);

	const localVideoRef = useRef<HTMLVideoElement | null>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const screenStreamRef = useRef<MediaStream | null>(null);

	const peerMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
	const makingOfferRef = useRef<Map<string, boolean>>(new Map());
	const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
	const afterSeqRef = useRef<number>(0);
	const participantsRef = useRef<ParticipantPublic[]>([]);
	const storedCredsFoundRef = useRef<boolean>(false);
	const autoJoinAttemptedRef = useRef(false);
	const myCredsRef = useRef<ParticipantCreds | null>(null);
	const pollingRef = useRef<boolean>(false);
	const pollTimerRef = useRef<number | null>(null);
	const participantsTimerRef = useRef<number | null>(null);
	const chromeTimerRef = useRef<number | null>(null);
	const toastTimersRef = useRef<Map<string, number>>(new Map());

	const meetingUrl = useMemo(() => {
		if (typeof window === "undefined") return "";
		return `${window.location.origin}/connect/${encodeURIComponent(roomId)}`;
	}, [roomId]);

	useEffect(() => {
		try {
			const raw = localStorage.getItem(mirrorPrefKey());
			if (raw === "0") setMirrorSelf(false);
			if (raw === "1") setMirrorSelf(true);
		} catch {
			// ignore
		}
	}, []);

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

	useEffect(() => {
		if (typeof window === "undefined") return;
		const onMove = () => showChromeTemporarily();
		window.addEventListener("mousemove", onMove, { passive: true });
		window.addEventListener("touchstart", onMove, { passive: true });
		showChromeTemporarily();
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("touchstart", onMove);
			if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current);
			chromeTimerRef.current = null;
			for (const id of toastTimersRef.current.keys()) clearToastTimer(id);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		myCredsRef.current = myCreds;
	}, [myCreds]);

	function getLocalStream() {
		return localStreamRef.current;
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
		setRemoteTiles((prev) => {
			const idx = prev.findIndex((t) => t.id === remoteId);
			if (idx >= 0) {
				const next = prev.slice();
				next[idx] = { id: remoteId, displayName, stream };
				return next;
			}
			return [...prev, { id: remoteId, displayName, stream }];
		});
	}

	function removeRemote(remoteId: string) {
		setRemoteTiles((prev) => prev.filter((t) => t.id !== remoteId));
		setRemoteMediaState((prev) => {
			if (!prev[remoteId]) return prev;
			const next = { ...prev };
			delete next[remoteId];
			return next;
		});
	}

	async function apiGet<T>(path: string): Promise<T> {
		const res = await fetch(path, { method: "GET" });
		const json = (await res.json().catch(() => null)) as T;
		if (!res.ok) throw new Error((json as any)?.error || "Request failed");
		return json;
	}

	async function apiPost<T>(path: string, body: unknown): Promise<T> {
		const res = await fetch(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const json = (await res.json().catch(() => null)) as T;
		if (!res.ok) throw new Error((json as any)?.error || "Request failed");
		return json;
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

		const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
		localStreamRef.current = stream;
		setLocalStreamReady(true);
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
		const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
		const newTrack = camStream.getVideoTracks()[0];
		if (!newTrack) throw new Error("No camera available");

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

	function attachLocalTracksToExistingPeers(stream: MediaStream) {
		for (const [remoteId, pc] of peerMapRef.current.entries()) {
			const senders = pc.getSenders();
			const hasAudio = senders.some((s) => s.track?.kind === "audio");
			const hasVideo = senders.some((s) => s.track?.kind === "video");

			for (const track of stream.getTracks()) {
				if (track.kind === "audio" && hasAudio) continue;
				if (track.kind === "video" && hasVideo) continue;
				try {
					pc.addTrack(track, stream);
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

	function attachLocalTracksToPeer(pc: RTCPeerConnection) {
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
	}

	function createPeer(remoteParticipantId: string) {
		const pc = new RTCPeerConnection({
			iceServers: buildIceServers(),
		});

		attachLocalTracksToPeer(pc);

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
		const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
		await pc.setLocalDescription(offer);

		await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
			participantId: creds.participantId,
			secret: creds.secret,
			toParticipantId: remoteParticipantId,
			kind: "offer",
			payload: pc.localDescription,
		});
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

		const res = await apiGet<{ ok: boolean; signals: Signal[]; nextAfterSeq: number }>(url.toString());
		if (!res.ok) return;

		if (typeof res.nextAfterSeq === "number") afterSeqRef.current = res.nextAfterSeq;

		for (const s of res.signals ?? []) {
			if (s.kind === "offer") await handleOffer(s.fromParticipantId, s.payload as any);
			else if (s.kind === "answer") await handleAnswer(s.fromParticipantId, s.payload as any);
			else if (s.kind === "ice") await handleIce(s.fromParticipantId, s.payload as any);
			else if (s.kind === "media") {
				const payload = s.payload as any;
				if (!payload || typeof payload !== "object") continue;
				setRemoteMediaState((prev) => ({
					...prev,
					[s.fromParticipantId]: {
						audioEnabled: payload.audioEnabled !== false,
						videoEnabled: payload.videoEnabled !== false,
						isSharing: payload.isSharing === true,
					},
				}));
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

		const res = await apiGet<{ ok: boolean; participants: ParticipantPublic[] }>(url.toString());
		if (!res.ok) return;

		setParticipants(res.participants ?? []);

		const others = (res.participants ?? []).filter((p) => p.id !== creds.participantId);
		for (const p of others) {
			// Ensure peer exists
			const already = peerMapRef.current.get(p.id);
			if (!already) getOrCreatePeer(p.id);

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
			const joinRes = await apiPost<{
				ok: boolean;
				participant: { id: string; secret: string; displayName: string; isGuest: boolean };
				others: ParticipantPublic[];
			}>(`/api/connect/rooms/${encodeURIComponent(roomId)}/join`, { displayName: name || undefined });

			if (!joinRes.ok) throw new Error("Failed to join");

			const creds: ParticipantCreds = {
				participantId: joinRes.participant.id,
				secret: joinRes.participant.secret,
				displayName: joinRes.participant.displayName,
				isGuest: joinRes.participant.isGuest,
			};
			myCredsRef.current = creds;

			setMyCreds(creds);
			setParticipants([...(joinRes.others ?? []), { id: creds.participantId, displayName: creds.displayName, isGuest: creds.isGuest, createdAt: new Date().toISOString() }]);

			localStorage.setItem(storageKey(roomId), JSON.stringify(creds));

			startPolling();
			startParticipantsRefresh();
			void broadcastMediaState({ audioEnabled: !isMuted, videoEnabled: !isVideoOff, isSharing }).catch(() => null);
			showChromeTemporarily();
			void ensureLocalMedia()
				.then((stream) => attachLocalTracksToExistingPeers(stream))
				.catch((err) => {
					toastMediaIssue(err);
				});

			// If we already see others, offer where appropriate.
			for (const p of joinRes.others ?? []) {
				getOrCreatePeer(p.id);
				if (isOfferer(creds.participantId, p.id)) {
					await sendOffer(p.id);
				}
			}
		} catch (e) {
			showToast("error", e instanceof Error ? e.message : "Failed to join");
		} finally {
			setJoining(false);
		}
	}

	async function onLeave() {
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
			stopPolling();
			stopParticipantsRefresh();

			for (const pc of peerMapRef.current.values()) pc.close();
			peerMapRef.current.clear();
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

			localStorage.removeItem(storageKey(roomId));
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
			showToast("info", "Left the meeting.");
		}
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
			void broadcastMediaState({ audioEnabled: nextMuted ? false : true, videoEnabled: !isVideoOff, isSharing }).catch(() => null);
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
				void broadcastMediaState({ audioEnabled: !isMuted, videoEnabled: false, isSharing }).catch(() => null);
				showChromeTemporarily();
				return;
			}

			// Turning video on - some devices require reacquiring/replacing the track
			try {
				await ensureCameraTrackOn();
				for (const t of local.getVideoTracks()) t.enabled = true;
				setIsVideoOff(false);
				void broadcastMediaState({ audioEnabled: !isMuted, videoEnabled: true, isSharing }).catch(() => null);
				showChromeTemporarily();
			} catch (err) {
				toastMediaIssue(err);
			}
		})();
	}

	async function startShare() {
		if (isSharing) return;
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

			for (const pc of peerMapRef.current.values()) {
				const sender = pc.getSenders().find((s) => s.track?.kind === "video");
				if (sender) await sender.replaceTrack(screenTrack).catch(() => null);
			}
			void broadcastMediaState({ audioEnabled: !isMuted, videoEnabled: true, isSharing: true }).catch(() => null);
		} catch (e) {
			showToast("warn", "Screen share is not currently supported on this device.");
		}
	}

	async function stopShare() {
		const screen = screenStreamRef.current;
		screenStreamRef.current = null;
		setIsSharing(false);
		if (screen) screen.getTracks().forEach((t) => t.stop());

		const local = localStreamRef.current;
		const cameraTrack = local?.getVideoTracks()?.[0];
		if (!cameraTrack) return;

		for (const pc of peerMapRef.current.values()) {
			const sender = pc.getSenders().find((s) => s.track?.kind === "video");
			if (sender) await sender.replaceTrack(cameraTrack).catch(() => null);
		}
		void broadcastMediaState({ audioEnabled: !isMuted, videoEnabled: !isVideoOff, isSharing: false }).catch(() => null);
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
					setMyCreds(parsed);
					setJoinName(parsed.displayName);
					// Prevent the auto-join effect from firing on this mount.
					autoJoinAttemptedRef.current = true;
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
				const name = participants.find((p) => p.id === t.id)?.displayName;
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
				void (async () => {
					try {
						if (await shouldAutoStartMedia()) await ensureLocalMedia();
					} catch {
						showToast("info", "Tap the mic/camera buttons to enable audio/video.");
					}
				})();
				void broadcastMediaState({ audioEnabled: !isMuted, videoEnabled: !isVideoOff, isSharing }).catch(() => null);
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
			for (const pc of peers.values()) pc.close();
			peers.clear();
		};
	}, []);

	const myName = myCreds?.displayName ?? safeName(joinName);
	const otherParticipants = myCreds ? participants.filter((p) => p.id !== myCreds.participantId) : [];

	const statusLine = useMemo(() => {
		if (!myCreds) return "Not joined";
		const others = participants.filter((p) => p.id !== myCreds.participantId);
		if (!others.length) return "Waiting for someone to join…";
		return `In call with ${others.map((p) => p.displayName).join(", ")}`;
	}, [participants, myCreds]);

	const othersCount = myCreds ? participants.filter((p) => p.id !== myCreds.participantId).length : 0;
	const showPreCallInfo = myCreds ? othersCount === 0 : true;

	const stageHeightClass = showPreCallInfo
		? "h-[calc(100svh-190px)] sm:h-[calc(100svh-170px)]"
		: "h-[calc(100svh-140px)] sm:h-[calc(100svh-120px)]";

	return (
		<div className="min-h-screen bg-brand-mist text-brand-ink">
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

			<div className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 sm:py-8">
				<div
					className={
						"flex flex-col gap-3 transition sm:flex-row sm:items-center sm:justify-between " +
						(chromeVisible ? "opacity-100" : "pointer-events-none opacity-0")
					}
					onClick={(e) => e.stopPropagation()}
				>
					<div>
						<div className="flex items-center gap-3">
							<div className="relative h-8 w-32">
								<Image src="/brand/Purely_Connect.png" alt="Purely Connect" fill className="object-contain" priority />
							</div>
							<div className="text-lg font-semibold text-zinc-900">Meeting</div>
						</div>
						<div className="mt-1 text-sm text-zinc-600">Room: {roomId}</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Link href="/connect" className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-base hover:bg-zinc-50">
							Back
						</Link>
						<button onClick={copyLink} className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-base hover:bg-zinc-50">
							Copy link
						</button>
						{myCreds ? (
							<button onClick={onLeave} className="rounded-2xl bg-red-600 px-4 py-2 text-base font-semibold text-white hover:bg-red-500">
								Leave
							</button>
						) : null}
					</div>
				</div>

				{!myCreds ? (
					<div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
						<h1 className="text-2xl font-semibold text-zinc-900">Join this meeting</h1>
						<p className="mt-2 text-base text-zinc-600">Enter your name to join.</p>

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
								className="rounded-2xl bg-brand-ink px-5 py-3 text-base font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{joining ? "Joining…" : "Join"}
							</button>
						</div>

					</div>
				) : (
					<div className="mt-6">
						{showPreCallInfo ? (
							<div className="mb-2">
								<div className="text-sm text-zinc-600">Signed in as</div>
								<div className="text-xl font-semibold text-zinc-900">{myName || "You"}</div>
								<div className="mt-1 text-base text-zinc-600">{statusLine}</div>
							</div>
						) : null}

						<div
							className={
								"mt-4 grid gap-2 sm:gap-3 grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1 " + stageHeightClass
							}
							onClick={() => {
								toggleTileHud();
								showChromeTemporarily();
							}}
						>
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
										style={{ transform: mirrorSelf ? "scaleX(-1)" : undefined }}
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
							) : otherParticipants.length ? (
								<div className="relative overflow-hidden rounded-2xl bg-zinc-950">
									<div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/80" />
									<div className="relative h-full p-6 text-white">
										<div className="text-lg font-semibold">Connecting…</div>
										<div className="mt-2 text-base text-white/80">
											Trying to connect to {otherParticipants.map((p) => p.displayName).join(", ")}. This can take a few seconds.
										</div>
										<div className="mt-3 text-sm text-white/60">If it hangs, refresh the page.</div>
									</div>
								</div>
							) : (
								<div className="relative overflow-hidden rounded-2xl bg-zinc-950">
									<div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/80" />
									<div className="relative h-full p-6 text-white">
										<div className="text-lg font-semibold">Waiting for someone to join</div>
										<div className="mt-2 text-base text-white/80">Share the link and they’ll appear here.</div>
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
							<div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-zinc-200 bg-white/90 px-2 py-2 shadow-lg backdrop-blur sm:gap-2">
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
									active={!isSharing}
									icon={!isSharing ? <ScreenShareIcon /> : <ScreenStopIcon />}
								/>
								<div className="mx-1 h-8 w-px bg-zinc-200" />
								<IconButton
									label={mirrorSelf ? "Unmirror" : "Mirror"}
									onClick={() => {
										setMirrorSelf((prev) => {
											const next = !prev;
											try {
												localStorage.setItem(mirrorPrefKey(), next ? "1" : "0");
											} catch {
												// ignore
											}
											showChromeTemporarily();
											return next;
										});
									}}
									active={true}
									icon={<RotateIcon />}
								/>
								<div className="mx-1 h-8 w-px bg-zinc-200" />
								<button
									onClick={onLeave}
									className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500 sm:h-11 sm:w-11"
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
				"flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition sm:h-11 sm:w-11 " +
				(props.active ? "border-zinc-200 bg-white hover:bg-zinc-50" : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200")
			}
			aria-label={props.label}
			title={props.label}
		>
			{props.icon}
		</button>
	);
}

function MicIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path
				d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

function MicOffIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path
				d="M9 9v2a3 3 0 0 0 4.2 2.74"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M15 9.34V6a3 3 0 0 0-5.1-2.12"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path d="M19 11a7 7 0 0 1-7 7c-1.2 0-2.34-.3-3.33-.84" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

function VideoIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path
				d="M15 10.5V7a2 2 0 0 0-2-2H6A2 2 0 0 0 4 7v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3.5l5 3v-9l-5 3Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function VideoOffIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path
				d="M14 10.5V7a2 2 0 0 0-2-2H7.5"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<path
				d="M15 13.5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinejoin="round"
			/>
			<path d="M20 7v10l-4-2.4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
		</svg>
	);
}

function ScreenShareIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path d="M4 4h16v10H4V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
			<path d="M12 14v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M12 7v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M10 9l2-2 2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function ScreenStopIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path d="M4 4h16v10H4V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
			<path d="M12 14v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M8 20h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<path d="M9 7h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

function RotateIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-900">
			<path
				d="M21 12a9 9 0 0 0-15.36-6.36"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<path
				d="M3 12a9 9 0 0 0 15.36 6.36"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<path d="M6 5v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M18 19v-4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

function RemoteTile(props: { tile: { id: string; displayName: string; stream: MediaStream }; media?: MediaState; hudVisible: boolean }) {
	const videoRef = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		if (!videoRef.current) return;
		videoRef.current.srcObject = props.tile.stream;
		void videoRef.current.play().catch(() => null);
	}, [props.tile.stream]);

	return (
		<StageTile
			label=""
			name={props.tile.displayName || "Guest"}
			videoEl={<video ref={videoRef} playsInline autoPlay className="h-full w-full object-cover" />}
			videoEnabled={props.media?.videoEnabled !== false}
			audioEnabled={props.media?.audioEnabled !== false}
			isSharing={props.media?.isSharing === true}
			loading={false}
			hudVisible={props.hudVisible}
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
}) {
	const initials = (props.name || "?")
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase())
		.join("");

	return (
		<div className="relative h-full overflow-hidden rounded-2xl bg-zinc-950">
			<div className="absolute inset-0">
				<div className={"h-full w-full " + (props.videoEnabled ? "opacity-100" : "opacity-0")}>
					{props.videoEl}
				</div>
				{!props.videoEnabled ? (
					<div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
						<div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-white">
							{initials || "?"}
						</div>
					</div>
				) : null}
				{props.loading ? (
					<div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white/80">
						Connecting…
					</div>
				) : null}
			</div>

			{props.hudVisible ? (
				<div className="absolute inset-x-0 bottom-0 p-3" onClick={(e) => e.stopPropagation()}>
					<div className="flex items-center justify-between rounded-xl bg-black/45 px-3 py-2 text-white backdrop-blur">
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold">{props.label ? `${props.label} · ` : ""}{props.name}</div>
							<div className="mt-0.5 text-xs text-white/70">
								{props.isSharing ? "Sharing" : ""}
								{props.isSharing ? " · " : ""}
								{props.audioEnabled ? "Mic on" : "Muted"} · {props.videoEnabled ? "Camera on" : "Camera off"}
							</div>
						</div>
						<div className="flex items-center gap-2">
							{!props.audioEnabled ? (
								<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10" title="Muted">
									<MicOffIcon />
								</span>
							) : null}
							{!props.videoEnabled ? (
								<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10" title="Camera off">
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
