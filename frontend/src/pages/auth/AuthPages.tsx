import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, Input } from "@/components/ui";
import { ApiError } from "@/api/client";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  asReseller: z.boolean().optional(),
  storeName: z.string().optional(),
});

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to LinkWaveHub">
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
        <Field label="Email"><Input type="email" {...form.register("email")} /></Field>
        <Field label="Password"><Input type="password" {...form.register("password")} /></Field>
        <Button className="w-full" disabled={form.formState.isSubmitting}>Login</Button>
      </form>
      <DemoAccounts />
      <p className="mt-4 text-center text-sm">No account? <Link to="/register" className="font-semibold text-brand-700">Register</Link></p>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [asReseller, setAsReseller] = useState(false);
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { fullName: "", email: "", password: "", phone: "", storeName: "" } });
  return (
    <AuthCard title="Create your account" subtitle="Start growing in minutes">
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          try {
            const me = await register({ ...values, asReseller, storeName: values.storeName });
            toast.success("Account created");
            navigate(me.user.role === "admin" ? "/admin" : "/app");
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Registration failed");
          }
        })}
      >
        <Field label="Full name"><Input {...form.register("fullName")} /></Field>
        <Field label="Email"><Input type="email" {...form.register("email")} /></Field>
        <Field label="Phone"><Input {...form.register("phone")} /></Field>
        <Field label="Password"><Input type="password" {...form.register("password")} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={asReseller} onChange={(e) => setAsReseller(e.target.checked)} />
          Register as a reseller
        </label>
        {asReseller && <Field label="Store name"><Input {...form.register("storeName")} /></Field>}
        <Button className="w-full" disabled={form.formState.isSubmitting}>Create account</Button>
      </form>
      <p className="mt-4 text-center text-sm">Already registered? <Link to="/login" className="font-semibold text-brand-700">Login</Link></p>
    </AuthCard>
  );
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="mb-6 text-sm text-slate-500">{subtitle}</p>
        {children}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

function DemoAccounts() {
  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <p className="font-semibold">Demo accounts</p>
      <p>Admin: admin@linkwavehub.com / Admin@12345</p>
      <p>Reseller: reseller@linkwavehub.com / Reseller@12345</p>
      <p>Customer: customer@linkwavehub.com / Customer@12345</p>
    </div>
  );
}
