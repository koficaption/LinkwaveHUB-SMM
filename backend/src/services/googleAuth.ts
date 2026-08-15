import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { query, queryOne, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { signToken } from "../utils.js";
import { notify } from "./notificationService.js";
import { attachReferrer, newReferralCode } from "./affiliateService.js";
import { attachPanelCustomer } from "./resellerService.js";

const publicUser = `id, email, full_name, phone, whatsapp_number, role, status, avatar_url, last_login_at, created_at`;

export function googleEnabled() {
  return Boolean(config.googleClientId);
}

export function googleRedirectUrl(state: string, redirectUri = config.googleRedirectUri) {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function createGoogleState(redirectUri: string, referralCode?: string, storeSlug?: string) {
  return jwt.sign(
    { typ: "google_oauth", redirectUri, referralCode: referralCode || undefined, storeSlug: storeSlug || undefined },
    config.jwtSecret,
    { expiresIn: "10m" }
  );
}

export function verifyGoogleState(state: string) {
  const payload = jwt.verify(state, config.jwtSecret) as { typ?: string; redirectUri?: string; referralCode?: string; storeSlug?: string };
  if (payload.typ !== "google_oauth") throw new AppError("Invalid Google sign-in state", 400);
  return {
    redirectUri: payload.redirectUri || config.googleRedirectUri,
    referralCode: payload.referralCode || "",
    storeSlug: payload.storeSlug || "",
  };
}

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

export async function loginWithGoogleCode(code: string, redirectUri = config.googleRedirectUri, referralCode?: string, storeSlug?: string) {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new AppError("Google sign-in is not configured", 501);
  }
  const body = new URLSearchParams({
    code,
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenJson = (await tokenRes.json()) as { id_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!tokenRes.ok || tokenJson.error) {
    throw new AppError(tokenJson.error_description || "Google sign-in failed", 401);
  }
  if (tokenJson.id_token) {
    return loginWithGoogleIdToken(tokenJson.id_token, referralCode, storeSlug);
  }
  if (!tokenJson.access_token) throw new AppError("Google did not return a user token", 401);
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profile = (await profileRes.json()) as GoogleProfile & { error?: string };
  if (!profileRes.ok || !profile.email || !profile.sub) {
    throw new AppError("Could not read Google profile", 401);
  }
  return upsertGoogleUser(profile, referralCode, storeSlug);
}

export async function loginWithGoogleAccessToken(accessToken: string, referralCode?: string, storeSlug?: string) {
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = (await profileRes.json()) as GoogleProfile & { error?: string };
  if (!profileRes.ok || !profile.email || !profile.sub) {
    throw new AppError("Could not read Google profile", 401);
  }
  return upsertGoogleUser(profile, referralCode, storeSlug);
}

export async function loginWithGoogleIdToken(idToken: string, referralCode?: string, storeSlug?: string) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const payload = (await res.json()) as GoogleProfile & { aud?: string; error?: string };
  if (!res.ok || payload.error || !payload.email || !payload.sub) {
    throw new AppError("Invalid Google credential", 401);
  }
  if (config.googleClientId && payload.aud !== config.googleClientId) {
    throw new AppError("Google credential does not match this app", 401);
  }
  return upsertGoogleUser(payload, referralCode, storeSlug);
}

async function upsertGoogleUser(profile: GoogleProfile, referralCode?: string, storeSlug?: string) {
  const email = profile.email.toLowerCase();
  const verified = profile.email_verified !== false && profile.email_verified !== "false";
  if (!verified) throw new AppError("Google email is not verified", 401);

  const result = await withTransaction(async (client) => {
    let user = await queryOne(
      `SELECT ${publicUser} FROM users WHERE google_id = $1 OR LOWER(email) = $2`,
      [profile.sub, email],
      client
    );
    let created = false;

    if (!user) {
      user = await queryOne(
        `INSERT INTO users (email, password_hash, full_name, role, status, google_id, auth_provider, email_verified, avatar_url, referral_code)
         VALUES ($1, NULL, $2, 'customer', 'active', $3, 'google', TRUE, $4, $5)
         RETURNING ${publicUser}`,
        [email, profile.name || email.split("@")[0], profile.sub, profile.picture ?? null, newReferralCode()],
        client
      );
      await query(`INSERT INTO wallets (user_id, balance) VALUES ($1, 0)`, [user!.id], client);
      created = true;
    } else {
      user = await queryOne(
        `UPDATE users SET
           google_id = COALESCE(google_id, $2),
           auth_provider = CASE WHEN google_id IS NULL THEN 'google' ELSE auth_provider END,
           avatar_url = COALESCE(avatar_url, $3),
           email_verified = TRUE,
           last_login_at = NOW()
         WHERE id = $1
         RETURNING ${publicUser}`,
        [user.id, profile.sub, profile.picture ?? null],
        client
      );
    }

    if (!user) throw new AppError("Unable to sign in with Google", 500);
    if (user.status === "suspended") throw new AppError("Account is suspended", 403);
    if (referralCode) {
      await attachReferrer(user.id, referralCode, client);
    }
    if (storeSlug) {
      const panel = await queryOne<{ id: string }>(
        `SELECT id FROM resellers WHERE store_slug = $1 AND status = 'active'`,
        [storeSlug],
        client
      );
      if (panel) {
        await query(
          `UPDATE users SET panel_reseller_id = $2
           WHERE id = $1 AND panel_reseller_id IS NULL AND role = 'customer'`,
          [user.id, panel.id],
          client
        );
      }
    }
    const token = signToken({ id: user.id, role: user.role, email: user.email });
    return { user, token, created };
  });

  if (result.created) {
    await notify({
      userId: result.user.id,
      title: "Welcome to LinkBoost Growth",
      body: "You signed in with Google. Add funds to your wallet to start placing orders.",
      type: "account",
    });
  }
  return { user: result.user, token: result.token };
}
