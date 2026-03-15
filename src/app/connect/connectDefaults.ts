export type ConnectHostDefaults = {
	waitingRoomEnabled: boolean;
	locked: boolean;
	muteOnJoin: boolean;
	cameraOffOnJoin: boolean;
	allowScreenShare: boolean;
};

export type ConnectUserDefaults = {
	startMuted: boolean;
	startCameraOff: boolean;
	mirrorSelf: boolean;
	hostDefaults: ConnectHostDefaults;
};

export const CONNECT_DEFAULTS_STORAGE_KEY = "pa.connect.defaults.v1";

export function defaultConnectUserDefaults(): ConnectUserDefaults {
	return {
		startMuted: false,
		startCameraOff: false,
		mirrorSelf: true,
		hostDefaults: {
			waitingRoomEnabled: false,
			locked: false,
			muteOnJoin: false,
			cameraOffOnJoin: false,
			allowScreenShare: true,
		},
	};
}

function isObj(v: unknown): v is Record<string, unknown> {
	return Boolean(v) && typeof v === "object";
}

export function readConnectUserDefaultsFromStorage(storage: Storage): ConnectUserDefaults {
	try {
		const raw = storage.getItem(CONNECT_DEFAULTS_STORAGE_KEY);
		if (!raw) return defaultConnectUserDefaults();
		const parsed = JSON.parse(raw) as unknown;
		if (!isObj(parsed)) return defaultConnectUserDefaults();

		const host = isObj(parsed.hostDefaults) ? parsed.hostDefaults : {};

		return {
			startMuted: parsed.startMuted === true,
			startCameraOff: parsed.startCameraOff === true,
			mirrorSelf: parsed.mirrorSelf !== false,
			hostDefaults: {
				waitingRoomEnabled: host.waitingRoomEnabled === true,
				locked: host.locked === true,
				muteOnJoin: host.muteOnJoin === true,
				cameraOffOnJoin: host.cameraOffOnJoin === true,
				allowScreenShare: host.allowScreenShare !== false,
			},
		};
	} catch {
		return defaultConnectUserDefaults();
	}
}

export function writeConnectUserDefaultsToStorage(storage: Storage, value: ConnectUserDefaults) {
	storage.setItem(CONNECT_DEFAULTS_STORAGE_KEY, JSON.stringify(value));
}
