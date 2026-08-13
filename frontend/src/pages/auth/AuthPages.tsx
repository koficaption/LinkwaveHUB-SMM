import { useEffect, useState } from "react";
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
      <GoogleSignIn />
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

function GoogleSignIn() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const config = useQuery({
    queryKey: ["google-config"],
    queryFn: () => api<{ enabled: boolean; clientId: string | null; redirectEnabled: boolean }>("/auth/google/config"),
  });
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(config.data?.enabled && config.data.clientId);

  useEffect(() => {
    if (!enabled || document.getElementById("google-gsi")) return;
    const script = document.createElement("script");
    script.id = "google-gsi";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.head.appendChild(script);
  }, [enabled]);

  const finish = async (payload: { accessToken?: string; credential?: string }) => {
    const me = await loginWithGoogle(payload);
    toast.success("Logged in with Google");
    navigate(me.user.role === "admin" ? "/admin" : "/app");
  };

  const onClick = async () => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (oauth2 && config.data?.clientId) {
      setBusy(true);
      oauth2.initTokenClient({
        client_id: config.data.clientId,
        scope: "openid email profile",
        callback: async (response) => {
          try {
            if (response.error === "popup_closed_by_user" || response.error === "access_denied") {
              throw new Error("Google sign-in was cancelled");
            }
            if (response.error || !response.access_token) {
              window.location.assign(`${window.location.origin}/api/auth/google/start`);
              return;
            }
            await finish({ accessToken: response.access_token });
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Google sign-in failed");
          } finally {
            setBusy(false);
          }
        },
      }).requestAccessToken();
      return;
    }
    window.location.assign(`${window.location.origin}/api/auth/google/start`);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || config.isLoading}
        className="btn w-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <GoogleMark />
        {busy ? "Connecting..." : "Continue with Google"}
      </button>
      <Divider />
    </>
  );
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
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
          initialize: (config: { client_id: string; callback: (res: { credential: string }) => void }) => void;
          prompt: (cb?: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDismissedMoment: () => boolean }) => void) => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (res: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}
