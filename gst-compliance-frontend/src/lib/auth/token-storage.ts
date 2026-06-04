const ACCESS_TOKEN_KEY = "gst_compliance_access_token";
const REFRESH_TOKEN_KEY = "gst_compliance_refresh_token";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export const tokenStorage = {
  getAccessToken() {
    return getStorage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
  },
  getRefreshToken() {
    return getStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
  },
  setTokens(accessToken: string, refreshToken?: string) {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    storage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  },
  clear() {
    const storage = getStorage();
    if (!storage) {
      return;
    }
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
  },
  hasSession() {
    return Boolean(this.getAccessToken() || this.getRefreshToken());
  },
};
