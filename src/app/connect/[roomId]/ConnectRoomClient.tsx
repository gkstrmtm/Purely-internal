"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

function storageKey(roomId: string) {
	return `pa.connect.${roomId}`;
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

	const [myCreds, setMyCreds] = useState<ParticipantCreds | null>(null);
	const [participants, setParticipants] = useState<ParticipantPublic[]>([]);
	const [joinName, setJoinName] = useState<string>(props.signedInName ?? "");
	const [joining, setJoining] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [mediaWarning, setMediaWarning] = useState<string | null>(null);

	const [localStreamReady, setLocalStreamReady] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoOff, setIsVideoOff] = useState(false);
	const [isSharing, setIsSharing] = useState(false);

	const [remoteTiles, setRemoteTiles] = useState<Array<{ id: string; displayName: string; stream: MediaStream }>>([]);

	const localVideoRef = useRef<HTMLVideoElement | null>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const screenStreamRef = useRef<MediaStream | null>(null);

	const peerMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
	const makingOfferRef = useRef<Map<string, boolean>>(new Map());
	const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
	const afterSeqRef = useRef<number>(0);
	const pollingRef = useRef<boolean>(false);
	const pollTimerRef = useRef<number | null>(null);
	const participantsTimerRef = useRef<number | null>(null);

	const shareUrl = useMemo(() => (typeof window === "undefined" ? "" : window.location.href), []);

	function getLocalStream() {
		return localStreamRef.current;
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

	async function ensureLocalMedia() {
		if (localStreamRef.current) return localStreamRef.current;
		setMediaWarning(null);

		const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
		localStreamRef.current = stream;
		setLocalStreamReady(true);

		if (localVideoRef.current) {
			localVideoRef.current.srcObject = stream;
			await localVideoRef.current.play().catch(() => null);
		}

		return stream;
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
			iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
		});

		attachLocalTracksToPeer(pc);

		pc.onnegotiationneeded = () => {
			if (!myCreds) return;
			if (!isOfferer(myCreds.participantId, remoteParticipantId)) return;
			if (pc.signalingState !== "stable") return;
			if (makingOfferRef.current.get(remoteParticipantId)) return;

			makingOfferRef.current.set(remoteParticipantId, true);
			void (async () => {
				try {
					const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
					await pc.setLocalDescription(offer);
					await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
						participantId: myCreds.participantId,
						secret: myCreds.secret,
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
			if (!myCreds) return;

			void apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
				participantId: myCreds.participantId,
				secret: myCreds.secret,
				toParticipantId: remoteParticipantId,
				kind: "ice",
				payload: ev.candidate.toJSON(),
			}).catch(() => null);
		};

		pc.ontrack = (ev) => {
			const stream = ev.streams?.[0];
			if (!stream) return;

			const remoteName = participants.find((p) => p.id === remoteParticipantId)?.displayName || "Participant";
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
		if (!myCreds) return;
		const pc = getOrCreatePeer(remoteParticipantId);
		if (pc.signalingState !== "stable") return;
		const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
		await pc.setLocalDescription(offer);

		await apiPost(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, {
			participantId: myCreds.participantId,
			secret: myCreds.secret,
			toParticipantId: remoteParticipantId,
			kind: "offer",
			payload: pc.localDescription,
		});
	}

	async function handleOffer(fromParticipantId: string, payload: any) {
		if (!myCreds) return;
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
			participantId: myCreds.participantId,
			secret: myCreds.secret,
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
		if (!myCreds) return;

		const url = new URL(`/api/connect/rooms/${encodeURIComponent(roomId)}/signal`, window.location.origin);
		url.searchParams.set("participantId", myCreds.participantId);
		url.searchParams.set("secret", myCreds.secret);
		url.searchParams.set("afterSeq", String(afterSeqRef.current));
		url.searchParams.set("limit", "50");

		const res = await apiGet<{ ok: boolean; signals: Signal[]; nextAfterSeq: number }>(url.toString());
		if (!res.ok) return;

		if (typeof res.nextAfterSeq === "number") afterSeqRef.current = res.nextAfterSeq;

		for (const s of res.signals ?? []) {
			if (s.kind === "offer") await handleOffer(s.fromParticipantId, s.payload as any);
			else if (s.kind === "answer") await handleAnswer(s.fromParticipantId, s.payload as any);
			else if (s.kind === "ice") await handleIce(s.fromParticipantId, s.payload as any);
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
		if (!myCreds) return;

		const url = new URL(`/api/connect/rooms/${encodeURIComponent(roomId)}/participants`, window.location.origin);
		url.searchParams.set("participantId", myCreds.participantId);
		url.searchParams.set("secret", myCreds.secret);

		const res = await apiGet<{ ok: boolean; participants: ParticipantPublic[] }>(url.toString());
		if (!res.ok) return;

		setParticipants(res.participants ?? []);

		const others = (res.participants ?? []).filter((p) => p.id !== myCreds.participantId);
		for (const p of others) {
			// Ensure peer exists
			const already = peerMapRef.current.get(p.id);
			if (!already) getOrCreatePeer(p.id);

			// Deterministic caller: only offerer sends offer
			if (isOfferer(myCreds.participantId, p.id)) {
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
		setError(null);
		setInfo(null);
		setMediaWarning(null);
		setJoining(true);

		try {
			const name = safeName(joinName);
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

			setMyCreds(creds);
			setParticipants([...(joinRes.others ?? []), { id: creds.participantId, displayName: creds.displayName, isGuest: creds.isGuest, createdAt: new Date().toISOString() }]);

			localStorage.setItem(storageKey(roomId), JSON.stringify(creds));

			startPolling();
			startParticipantsRefresh();
			void ensureLocalMedia().catch(() => {
				setMediaWarning("Camera/mic permissions blocked. You can still connect, but allow permissions to send video/audio.");
			});

			// If we already see others, offer where appropriate.
			for (const p of joinRes.others ?? []) {
				getOrCreatePeer(p.id);
				if (isOfferer(creds.participantId, p.id)) {
					await sendOffer(p.id);
				}
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to join");
		} finally {
			setJoining(false);
		}
	}

	async function onLeave() {
		setInfo(null);
		setError(null);

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
			setMyCreds(null);
			setParticipants([]);
			setInfo("Left the meeting.");
		}
	}

	function toggleMute() {
		const local = localStreamRef.current;
		if (!local) return;
		const audioTracks = local.getAudioTracks();
		const nextMuted = !isMuted;
		for (const t of audioTracks) t.enabled = !nextMuted;
		setIsMuted(nextMuted);
	}

	function toggleVideo() {
		const local = localStreamRef.current;
		if (!local) return;
		const videoTracks = local.getVideoTracks();
		const nextOff = !isVideoOff;
		for (const t of videoTracks) t.enabled = !nextOff;
		setIsVideoOff(nextOff);
	}

	async function startShare() {
		if (isSharing) return;
		setError(null);

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
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to share screen");
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
	}

	async function copyLink() {
		setInfo(null);
		setError(null);
		try {
			await navigator.clipboard.writeText(shareUrl);
			setInfo("Copied meeting link.");
		} catch {
			setError("Could not copy link");
		}
	}

	useEffect(() => {
		// Restore creds if present.
		try {
			const raw = localStorage.getItem(storageKey(roomId));
			if (!raw) return;
			const parsed = JSON.parse(raw) as ParticipantCreds;
			if (!parsed?.participantId || !parsed?.secret) return;
			setMyCreds(parsed);
			setJoinName(parsed.displayName);
		} catch {
			// ignore
		}
	}, [roomId]);

	useEffect(() => {
		if (!myCreds) return;

		let cancelled = false;
		void (async () => {
			try {
				startPolling();
				startParticipantsRefresh();
				void ensureLocalMedia().catch(() => {
					setMediaWarning("Camera/mic permissions blocked. You can still connect, but allow permissions to send video/audio.");
				});
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

	return (
		<div className="min-h-screen bg-brand-mist text-brand-ink">
			<div className="mx-auto max-w-6xl px-6 py-10">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<div className="text-lg font-semibold text-zinc-900">Purely Connect</div>
						<div className="mt-1 text-sm text-zinc-600">Room: {roomId}</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
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

						{error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{error}</div> : null}
						{info ? <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base text-zinc-700">{info}</div> : null}
					</div>
				) : (
					<div className="mt-6">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<div className="text-sm text-zinc-600">Signed in as</div>
								<div className="text-xl font-semibold text-zinc-900">{myName || "You"}</div>
								<div className="mt-1 text-base text-zinc-600">{statusLine}</div>
							</div>

							<div className="flex flex-wrap gap-2">
								<button
									onClick={toggleMute}
									className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-base hover:bg-zinc-50"
								>
									{isMuted ? "Unmute" : "Mute"}
								</button>
								<button
									onClick={toggleVideo}
									className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-base hover:bg-zinc-50"
								>
									{isVideoOff ? "Start video" : "Stop video"}
								</button>
								{!isSharing ? (
									<button onClick={startShare} className="rounded-2xl bg-brand-ink px-4 py-2 text-base font-semibold text-white hover:opacity-95">
										Share screen
									</button>
								) : (
									<button onClick={stopShare} className="rounded-2xl bg-brand-ink px-4 py-2 text-base font-semibold text-white hover:opacity-95">
										Stop sharing
									</button>
								)}
							</div>
						</div>

						{mediaWarning ? (
							<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">
								{mediaWarning}
							</div>
						) : null}
						{error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{error}</div> : null}
						{info ? <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base text-zinc-700">{info}</div> : null}

						<div className="mt-6 grid gap-4 md:grid-cols-2">
							<div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
								<div className="text-sm font-medium text-zinc-900">You</div>
								<div className="mt-2 overflow-hidden rounded-2xl bg-black">
									<video ref={localVideoRef} muted playsInline autoPlay className="aspect-video w-full object-cover" />
								</div>
								<div className="mt-2 text-sm text-zinc-600">{localStreamReady ? "Camera on" : "Connecting…"}</div>
							</div>

							{remoteTiles.length ? (
								remoteTiles.map((t) => (
									<RemoteTile key={t.id} tile={t} />
								))
							) : otherParticipants.length ? (
								<div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
									<div className="text-base font-semibold text-zinc-900">Connecting…</div>
									<div className="mt-1 text-base text-zinc-600">
										Trying to connect to {otherParticipants.map((p) => p.displayName).join(", ")}. This can take a few seconds.
									</div>
									<div className="mt-3 text-sm text-zinc-500">If it hangs, refresh the page or try Chrome.</div>
								</div>
							) : (
								<div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
									<div className="text-base font-semibold text-zinc-900">Waiting for someone to join</div>
									<div className="mt-1 text-base text-zinc-600">Share the link and they’ll appear here.</div>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function RemoteTile(props: { tile: { id: string; displayName: string; stream: MediaStream } }) {
	const videoRef = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		if (!videoRef.current) return;
		videoRef.current.srcObject = props.tile.stream;
		void videoRef.current.play().catch(() => null);
	}, [props.tile.stream]);

	return (
		<div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
			<div className="text-sm font-medium text-zinc-900">{props.tile.displayName || "Guest"}</div>
			<div className="mt-2 overflow-hidden rounded-2xl bg-black">
				<video ref={videoRef} playsInline autoPlay className="aspect-video w-full object-cover" />
			</div>
		</div>
	);
}
