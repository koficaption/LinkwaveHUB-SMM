const TOKEN_KEY = "lwh_token";
export const JUST_LOGGED_IN_KEY = "lbg.just-logged-in";

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function markJustLoggedIn(userId: string) {
  try {
    sessionStorage.setItem(JUST_LOGGED_IN_KEY, userId);
  } catch {
    /* ignore */
  }
}

export function clearJustLoggedIn() {
  try {
    sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
  } catch {
    /* ignore */
  }
}
