import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, Input, PasswordInput, Select } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/api/client";
import { storedReferralCode, persistReferralCode } from "@/pages/customer/AffiliatePages";
import { BrandLogo } from "@/components/BrandLogo";
import { activeStoreSlug, persistPanelSlug, storedPanelSlug, panelAuthPath } from "@/utils/panel";
import type { PanelStore, PublicSettings } from "@/types";
import { RecaptchaBox } from "@/components/auth/RecaptchaBox";

const loginSchema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Password is required") });
const registerSchema = z.object({
  fullName: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  gender: z.string().refine((value): value is "male" | "female" => value === "male" || value === "female", {
    message: "Select male or female",
  }),
  asReseller: z.boolean().optional(),
  storeName: z.string().optional(),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const storeSlug = params.get("store") || activeStoreSlug();
  if (storeSlug) persistPanelSlug(storeSlug);
  const store = useStorePreview(storeSlug);
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [recaptchaReset, setRecaptchaReset] = useState(0);
  const [website, setWebsite] = useState("");
  const recaptcha = usePublicRecaptcha();

  useEffect(() => {
    const google = params.get("google");
    if (google === "unconfigured") toast.error("Google sign-in is not configured yet. Ask the admin to add Google OAuth keys.");
    if (google === "denied") toast.error("Google sign-in was cancelled.");
    if (google === "failed") toast.error("Google sign-in failed. Try again or use email and password.");
    if (google === "captcha") toast.error("Tick I’m not a robot, then Continue with Google.");
  }, [params]);

  return (
    <AuthCard
      title={store.data ? `Sign in to ${store.data.store_name}` : "Welcome back"}
      subtitle={store.data ? "Use the account you created on this storefront." : "Sign in to LinkBoost Growth SMM"}
      store={store.data}
    >
      {store.data && (
        <p className="mb-4 rounded-xl px-3 py-2 text-sm text-white" style={{ background: store.data.brand_color }}>
          You’re signing in as a customer of {store.data.store_name}. Services and prices on this panel belong to this reseller.
        </p>
      )}
      {recaptcha?.enabled && recaptcha.siteKey && (
        <div className="mb-4">
          <RobotCheck
            siteKey={recaptcha.siteKey}
            onToken={setRecaptchaToken}
            resetNonce={recaptchaReset}
            hint="Tick the box before Continue with Google or logging in."
          />
        </div>
      )}
      <GoogleSignIn
        forceHelp={["failed", "denied", "captcha"].includes(params.get("google") || "")}
        recaptchaToken={recaptchaToken}
        recaptchaRequired={Boolean(recaptcha?.enabled)}
      />
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            if (recaptcha?.enabled && !recaptchaToken) {
              toast.error("Tick I’m not a robot, then login.");
              return;
            }
            const me = await login(values.email, values.password, {
              recaptchaToken: recaptchaToken || undefined,
              website: website || undefined,
            });
            toast.success("Logged in");
            navigate(me.user.role === "admin" ? "/admin" : "/app");
          } catch (e) {
            setRecaptchaToken("");
            setRecaptchaReset((n) => n + 1);
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
        <div className="h-0 overflow-hidden opacity-0" aria-hidden="true">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>
        <div className="-mt-2 text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700">Forgot password?</Link>
        </div>
        <Button className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Signing in..." : "Login"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">No account? <Link to={panelAuthPath("/register", storeSlug)} className="font-semibold text-brand-700">Register</Link></p>
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
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [website, setWebsite] = useState("");
  const recaptcha = usePublicRecaptcha();

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
              if (recaptcha?.enabled && !recaptchaToken) {
                toast.error("Tick I’m not a robot, then send the reset link.");
                return;
              }
              const data = await api<{ emailSent: boolean; resetUrl?: string; message: string }>("/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({
                  email: values.email,
                  recaptchaToken: recaptchaToken || undefined,
                  website: website || undefined,
                }),
              });
              setResult(data);
              toast.success(data.emailSent ? "Check your email for a reset link" : data.resetUrl ? "Use the reset link on this page" : "Request received");
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Could not start password reset");
            }
          })}
        >
          {recaptcha?.enabled && recaptcha.siteKey && (
            <RobotCheck
              siteKey={recaptcha.siteKey}
              onToken={setRecaptchaToken}
              hint="Tick the box before sending a reset link."
            />
          )}
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register("email")} />
          </Field>
          <div className="h-0 overflow-hidden opacity-0" aria-hidden="true">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
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
  const [params] = useSearchParams();
  const urlRef = params.get("ref");
  if (urlRef) persistReferralCode(urlRef);
  const invitedBy = urlRef || storedReferralCode();
  const storeSlug = params.get("store") || registerStoreSlugFromPage();
  if (storeSlug) persistPanelSlug(storeSlug);
  const store = useStorePreview(storeSlug);
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { fullName: "", email: "", password: "", phone: "", whatsappNumber: "", gender: "", storeName: "" } });
  const [website, setWebsite] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const recaptcha = usePublicRecaptcha();
  return (
    <AuthCard
      title={store.data ? `Join ${store.data.store_name}` : "Create your account"}
      subtitle={store.data ? "This account belongs to this reseller’s panel — not the main marketplace." : "Start growing in minutes"}
      store={store.data}
    >
      {store.data && (
        <p className="mb-4 rounded-xl px-3 py-2 text-sm text-white" style={{ background: store.data.brand_color }}>
          You’re creating a customer account on {store.data.store_name}. You’ll see this reseller’s services and prices after you log in.
        </p>
      )}
      {invitedBy && !store.data && (
        <p className="mb-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          You were invited with code <span className="font-mono font-semibold">{invitedBy}</span>. You will be linked to that affiliate when you register.
        </p>
      )}
      {recaptcha?.enabled && recaptcha.siteKey && (
        <div className="mb-4">
          <RobotCheck
            siteKey={recaptcha.siteKey}
            onToken={setRecaptchaToken}
            hint="Tick the box before Continue with Google or creating an account."
          />
        </div>
      )}
      <GoogleSignIn recaptchaToken={recaptchaToken} recaptchaRequired={Boolean(recaptcha?.enabled)} />
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            if (recaptcha?.enabled && !recaptchaToken) {
              toast.error("Complete the Google verification to create an account");
              return;
            }
            const me = await register({
              fullName: values.fullName.trim(),
              email: values.email.trim(),
              password: values.password,
              phone: values.phone?.trim() || undefined,
              whatsappNumber: values.whatsappNumber?.trim() || undefined,
              gender: values.gender,
              asReseller: false,
              storeName: values.storeName?.trim() || undefined,
              referralCode: invitedBy,
              storeSlug,
              recaptchaToken: recaptchaToken || undefined,
              website: website || undefined,
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
        <Field label="Gender" error={form.formState.errors.gender?.message}>
          <Select {...form.register("gender")} value={form.watch("gender")} onChange={(e) => form.setValue("gender", e.target.value, { shouldValidate: true, shouldDirty: true })}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register("password")} />
        </Field>
        <div className="h-0 overflow-hidden opacity-0" aria-hidden="true">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-slate-500">Use at least 8 characters. Phone and WhatsApp are optional. Gender sets your dashboard avatar.</p>
        <Button className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating..." : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">Already registered? <Link to={panelAuthPath("/login", storeSlug)} className="font-semibold text-brand-700">Login</Link></p>
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

const LIVE_GOOGLE_CALLBACK = "https://linkboostgrowth.site/api/auth/google/callback";

function usePublicRecaptcha() {
  const publicSettings = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => api<PublicSettings>("/settings/public"),
  });
  return publicSettings.data?.security;
}

function RobotCheck({
  siteKey,
  onToken,
  hint,
  resetNonce = 0,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  hint: string;
  resetNonce?: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">I’m not a robot</p>
      <p className="text-xs text-slate-500">{hint}</p>
      <RecaptchaBox siteKey={siteKey} onToken={onToken} resetNonce={resetNonce} />
    </div>
  );
}

function GoogleSignIn({
  forceHelp = false,
  recaptchaToken = "",
  recaptchaRequired = false,
  onRecaptchaToken,
  showRecaptcha = false,
}: {
  forceHelp?: boolean;
  recaptchaToken?: string;
  recaptchaRequired?: boolean;
  onRecaptchaToken?: (token: string) => void;
  showRecaptcha?: boolean;
}) {
  const [params] = useSearchParams();
  const [starting, setStarting] = useState(false);
  const recaptcha = usePublicRecaptcha();
  const config = useQuery({
    queryKey: ["google-config"],
    queryFn: () => api<{
      enabled: boolean;
      clientId: string | null;
      redirectEnabled: boolean;
      redirectUri?: string;
    }>("/auth/google/config"),
  });
  const enabled = Boolean(config.data?.enabled);
  const redirectUri = config.data?.redirectUri || LIVE_GOOGLE_CALLBACK;
  const urlRef = params.get("ref");
  if (urlRef) persistReferralCode(urlRef);
  const ref = urlRef || storedReferralCode();
  const storeSlug = params.get("store") || activeStoreSlug();

  if (!enabled && !config.isLoading) return null;

  async function startGoogle() {
    if (recaptchaRequired && !recaptchaToken) {
      toast.error("Tick I’m not a robot, then Continue with Google.");
      return;
    }
    setStarting(true);
    try {
      const data = await api<{ url: string }>("/auth/google/start", {
        method: "POST",
        body: JSON.stringify({
          recaptchaToken: recaptchaToken || undefined,
          ref: ref || undefined,
          storeSlug: storeSlug || undefined,
        }),
      });
      window.location.href = data.url;
    } catch (error) {
      setStarting(false);
      toast.error(errorMessage(error, "Google sign-in failed"));
    }
  }

  return (
    <>
      {showRecaptcha && recaptcha?.enabled && recaptcha.siteKey && onRecaptchaToken && (
        <div className="mb-4">
          <RobotCheck
            siteKey={recaptcha.siteKey}
            onToken={onRecaptchaToken}
            hint="Tick the box before Continue with Google."
          />
        </div>
      )}
      <button
        type="button"
        onClick={startGoogle}
        disabled={starting}
        className="btn flex w-full items-center justify-center gap-3 border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <GoogleMark />
        {starting ? "Opening Google..." : "Continue with Google"}
      </button>
      {forceHelp && (
        <p className="mt-3 text-center text-sm text-slate-500">
          Continue with Google failed. This is Google login, not the I’m not a robot box.
          Use email and password, or add this exact URI on the Google Cloud <strong>OAuth</strong> Web client (APIs &amp; Services → Credentials), not on reCAPTCHA:
          {" "}<code className="break-all font-mono text-xs">{redirectUri}</code>
        </p>
      )}
      <Divider />
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.7 7.4l6.3 5.3C38.2 37.3 44 31.5 44 24c0-1.2-.1-2.3-.4-3.5z" />
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

function useStorePreview(slug?: string | null) {
  return useQuery({
    queryKey: ["store-preview", slug],
    queryFn: async () => {
      const payload = await api<{ store: PanelStore }>(`/store/${slug}?limit=1`);
      return payload.store;
    },
    enabled: Boolean(slug),
  });
}

function registerStoreSlugFromPage() {
  return activeStoreSlug() || storedPanelSlug();
}

function AuthCard({
  title,
  subtitle,
  children,
  store,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  store?: PanelStore | null;
}) {
  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <Card className="w-full max-w-md">
        {store ? (
          <Link to={`/store/${store.store_slug}`} className="mb-5 block">
            <p className="text-2xl font-extrabold" style={{ color: store.brand_color }}>{store.store_name}</p>
            {store.tagline && <p className="mt-1 text-sm text-muted">{store.tagline}</p>}
          </Link>
        ) : (
          <BrandLogo className="mb-5" variant="full" to="/" />
        )}
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
