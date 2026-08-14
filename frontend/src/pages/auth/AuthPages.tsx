import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, Input, PasswordInput } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/api/client";
import { storedReferralCode } from "@/pages/customer/AffiliatePages";
import { BrandLogo } from "@/components/BrandLogo";

const loginSchema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Password is required") });
const registerSchema = z.object({
  fullName: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  asReseller: z.boolean().optional(),
  storeName: z.string().optional(),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    const google = params.get("google");
    if (google === "unconfigured") toast.error("Google sign-in is not configured yet. Ask the admin to add Google OAuth keys.");
    if (google === "denied") toast.error("Google sign-in was cancelled.");
    if (google === "failed") toast.error("Google sign-in failed. Try again or use email and password.");
  }, [params]);

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to LinkBoost Growth SMM">
      <GoogleSignIn forceHelp={["failed", "denied"].includes(params.get("google") || "")} />
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            const me = await login(values.email, values.password);
            toast.success("Logged in");
            navigate(me.user.role === "admin" ? "/admin" : "/app");
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Login failed");
          }
        })}
      >
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register("email")} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...form.register("password")} />
        </Field>
        <div className="-mt-2 text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700">Forgot password?</Link>
        </div>
        <Button className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in..." : "Login"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">No account? <Link to="/register" className="font-semibold text-brand-700">Register</Link></p>
    </AuthCard>
  );
}

const forgotSchema = z.object({ email: z.string().email("Enter a valid email") });
const resetSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string().min(8, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirm, { message: "Passwords do not match", path: ["confirm"] });

export function ForgotPasswordPage() {
  const form = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: "" } });
  const [result, setResult] = useState<{ emailSent: boolean; resetUrl?: string; message: string } | null>(null);

  return (
    <AuthCard title="Forgot password" subtitle="Enter your email to reset your password">
      {result ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {result.emailSent
              ? "If an account exists for that email, we sent a reset link. Check your inbox and spam folder."
              : result.resetUrl
                ? "Email sending is not connected yet, so nothing was delivered to your inbox. Use this link to set a new password now."
                : result.message}
          </p>
          {result.resetUrl ? (
            <Link to={result.resetUrl.replace(/^https?:\/\/[^/]+/, "")}>
              <Button className="w-full">Set a new password</Button>
            </Link>
          ) : null}
          <p className="text-center text-sm">
            <Link to="/login" className="font-semibold text-brand-700">Back to login</Link>
          </p>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const data = await api<{ emailSent: boolean; resetUrl?: string; message: string }>("/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({ email: values.email }),
              });
              setResult(data);
              toast.success(data.emailSent ? "Check your email for a reset link" : data.resetUrl ? "Use the reset link on this page" : "Request received");
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Could not start password reset");
            }
          })}
        >
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register("email")} />
          </Field>
          <Button className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Sending..." : "Send reset link"}
          </Button>
          <p className="text-center text-sm">
            Remembered it? <Link to="/login" className="font-semibold text-brand-700">Login</Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: "", confirm: "" } });

  if (!token) {
    return (
      <AuthCard title="Reset password" subtitle="This reset link is missing">
        <p className="text-sm text-slate-600 dark:text-slate-300">Request a new link from the forgot password page.</p>
        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="font-semibold text-brand-700">Forgot password</Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" subtitle="Choose a password you have not used here before">
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password: values.password }) });
            toast.success("Password updated. Sign in with your new password.");
            navigate("/login", { replace: true });
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Could not reset password");
          }
        })}
      >
        <Field label="New password" error={form.formState.errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register("password")} />
        </Field>
        <Field label="Confirm password" error={form.formState.errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...form.register("confirm")} />
        </Field>
        <Button className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : "Update password"}
        </Button>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [asReseller, setAsReseller] = useState(false);
  const invitedBy = storedReferralCode();
  const publicSettings = useQuery({ queryKey: ["public-settings"], queryFn: () => api<{ resellers?: { upgradeEnabled?: boolean; upgradeFee?: number } }>("/settings/public") });
  const paidUpgrade = publicSettings.data?.resellers?.upgradeEnabled !== false;
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { fullName: "", email: "", password: "", phone: "", whatsappNumber: "", storeName: "" } });
  return (
    <AuthCard title="Create your account" subtitle="Start growing in minutes">
      {invitedBy && (
        <p className="mb-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          You were invited with code <span className="font-mono font-semibold">{invitedBy}</span>. You will be linked to that affiliate when you register.
        </p>
      )}
      <GoogleSignIn />
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            const me = await register({
              fullName: values.fullName.trim(),
              email: values.email.trim(),
              password: values.password,
              phone: values.phone?.trim() || undefined,
              whatsappNumber: values.whatsappNumber?.trim() || undefined,
              asReseller: paidUpgrade ? false : asReseller,
              storeName: values.storeName?.trim() || undefined,
            });
            toast.success("Account created");
            navigate(me.user.role === "admin" ? "/admin" : "/app");
          } catch (e) {
            toast.error(errorMessage(e, "Registration failed"));
          }
        })}
      >
        <Field label="Full name" error={form.formState.errors.fullName?.message}><Input {...form.register("fullName")} /></Field>
        <Field label="Email" error={form.formState.errors.email?.message}><Input type="email" autoComplete="email" {...form.register("email")} /></Field>
        <Field label="Phone"><Input {...form.register("phone")} /></Field>
        <Field label="WhatsApp number"><Input placeholder="233241112222" {...form.register("whatsappNumber")} /></Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register("password")} />
        </Field>
        <p className="-mt-2 text-xs text-slate-500">Use at least 8 characters. Phone and WhatsApp are optional.</p>
        {!paidUpgrade && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={asReseller} onChange={(e) => setAsReseller(e.target.checked)} />
              Register as a reseller
            </label>
            {asReseller && <Field label="Store name"><Input {...form.register("storeName")} /></Field>}
          </>
        )}
        <Button className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating..." : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">Already registered? <Link to="/login" className="font-semibold text-brand-700">Login</Link></p>
    </AuthCard>
  );
}

export function AuthCallbackPage() {
  const { completeTokenLogin } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing Google sign-in...");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setMessage("Missing sign-in token");
      navigate("/login?google=failed", { replace: true });
      return;
    }
    completeTokenLogin(token)
      .then((me) => {
        toast.success("Logged in with Google");
        navigate(me.user.role === "admin" ? "/admin" : "/app", { replace: true });
      })
      .catch(() => {
        toast.error("Google sign-in failed");
        navigate("/login?google=failed", { replace: true });
      });
  }, [completeTokenLogin, navigate, params]);

  return (
    <div className="container-page flex min-h-[50vh] items-center justify-center">
      <p className="text-slate-500">{message}</p>
    </div>
  );
}

const LIVE_SITE = "https://linkboost-growth.onrender.com";

function googleJsOrigins(origin: string) {
  return [...new Set([
    origin.replace(/\/$/, ""),
    LIVE_SITE,
    "http://localhost:5173",
  ].filter(Boolean))];
}

function googleRedirectUris(origin: string, redirectUri?: string) {
  const bases = googleJsOrigins(origin);
  const uris = bases.flatMap((base) => [
    base,
    `${base}/login`,
    `${base}/register`,
    `${base}/api/auth/google/callback`,
  ]);
  if (redirectUri) uris.unshift(redirectUri);
  return [...new Set(uris)];
}
function GoogleSignIn({ forceHelp = false }: { forceHelp?: boolean }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const buttonHost = useRef<HTMLDivElement>(null);
  const config = useQuery({
    queryKey: ["google-config"],
    queryFn: () => api<{
      enabled: boolean;
      clientId: string | null;
      redirectEnabled: boolean;
      origin?: string;
      redirectUri?: string;
    }>("/auth/google/config"),
  });
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const enabled = Boolean(config.data?.enabled && config.data.clientId);
  const origin = (config.data?.origin || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const redirectUri = config.data?.redirectUri || `${origin}/api/auth/google/callback`;
  const clientId = config.data?.clientId;

  useEffect(() => {
    if (forceHelp) setShowHelp(true);
  }, [forceHelp]);

  useEffect(() => {
    if (!clientId || !buttonHost.current) return;
    let cancelled = false;
    const mount = () => {
      const gis = window.google?.accounts?.id;
      const el = buttonHost.current;
      if (!gis || !el || cancelled) return false;
      el.innerHTML = "";
      gis.initialize({
        client_id: clientId,
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: async (response) => {
          if (!response.credential) {
            setShowHelp(true);
            toast.error("Google did not return a sign-in token. Add the JavaScript origin below in Cloud Console.");
            return;
          }
          setBusy(true);
          try {
            const me = await loginWithGoogle({ credential: response.credential });
            toast.success("Logged in with Google");
            navigate(me.user.role === "admin" ? "/admin" : "/app");
          } catch (e) {
            setShowHelp(true);
            toast.error(e instanceof ApiError ? e.message : "Google sign-in failed");
          } finally {
            setBusy(false);
          }
        },
      });
      gis.renderButton(el, {
        theme: "outline",
        size: "large",
        type: "standard",
        text: "continue_with",
        shape: "pill",
        width: Math.max(280, Math.min(400, el.clientWidth || 384)),
        logo_alignment: "left",
      });
      return true;
    };
    if (mount()) return;
    const timer = window.setInterval(() => {
      if (mount()) window.clearInterval(timer);
    }, 50);
    const stop = window.setTimeout(() => {
      window.clearInterval(timer);
      if (!cancelled) setShowHelp(true);
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [clientId, loginWithGoogle, navigate]);

  if (!enabled && !config.isLoading) return null;

  return (
    <>
      <div ref={buttonHost} className="flex min-h-10 w-full justify-center [&>div]:w-full" />
      {busy && <p className="mt-2 text-center text-sm text-slate-500">Signing in…</p>}
      {config.isLoading && <p className="text-center text-sm text-slate-500">Loading Google sign-in…</p>}
      {showHelp && <GoogleConsoleHelp origin={origin} redirectUri={redirectUri} />}
      <Divider />
    </>
  );
}

function GoogleConsoleHelp({ origin, redirectUri }: { origin: string; redirectUri: string }) {
  const origins = googleJsOrigins(origin);
  const uris = googleRedirectUris(origin, redirectUri);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
      <p className="font-semibold">Google is blocking this site until these URLs are on the Web client in Cloud Console. Use the same client as GOOGLE_CLIENT_ID. Save, wait one minute, then refresh.</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide">Authorized JavaScript origins</p>
      {origins.map((value) => <CopyRow key={value} value={value} onCopy={() => copy(value)} />)}
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide">Authorized redirect URIs</p>
      {uris.map((uri) => <CopyRow key={uri} value={uri} onCopy={() => copy(uri)} />)}
    </div>
  );
}

function CopyRow({ value, onCopy }: { value: string; onCopy: () => void }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <code className="flex-1 break-all rounded-lg bg-white/80 px-2 py-1 font-mono text-xs dark:bg-slate-950/60">{value}</code>
      <button type="button" className="shrink-0 text-xs font-semibold text-brand-700" onClick={onCopy}>Copy</button>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      or
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <BrandLogo className="mb-5" variant="full" to="/" />
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{title}</h1>
        <p className="mb-6 text-sm text-muted">{subtitle}</p>
        {children}
      </Card>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: { credential?: string }) => void;
            ux_mode?: "popup" | "redirect";
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (parent: HTMLElement, options: {
            theme?: "outline" | "filled_blue" | "filled_black";
            size?: "large" | "medium" | "small";
            type?: "standard" | "icon";
            text?: "signin_with" | "signup_with" | "continue_with" | "signin";
            shape?: "rectangular" | "pill" | "circle" | "square";
            width?: number;
            logo_alignment?: "left" | "center";
          }) => void;
          prompt: (cb?: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDismissedMoment: () => boolean }) => void) => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (res: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
          initCodeClient?: (config: {
            client_id: string;
            scope: string;
            ux_mode?: "popup" | "redirect";
            callback: (res: { code?: string; error?: string }) => void;
          }) => { requestCode: () => void };
        };
      };
    };
  }
}
