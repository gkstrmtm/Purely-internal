import * as SecureStore from "expo-secure-store";

function isWeb() {
  return typeof window !== "undefined";
}

const KEY = "pa.portal.bearer";

export async function getPortalBearerToken(): Promise<string | null> {
  if (isWeb()) return null;
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function setPortalBearerToken(token: string | null): Promise<void> {
  if (isWeb()) return;
  const v = (token || "").trim();
  try {
    if (!v) {
      await SecureStore.deleteItemAsync(KEY);
      return;
    }
    await SecureStore.setItemAsync(KEY, v);
  } catch {
    // ignore
  }
}

export async function clearPortalBearerToken(): Promise<void> {
  return setPortalBearerToken(null);
}
