import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { emailHasAccount } from "@/lib/booking.functions";
import { Captcha } from "@/components/captcha";
import { needsSecondStep, passwordLogin } from "@/lib/password-login";
import { isBreachedPassword } from "@/lib/password-breached";
import { getInvite, setInvite } from "@/lib/invite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { FormError } from "@/components/ui-bits";
import { SycrasLogo } from "@/components/sycras-logo";
import { cn } from "@/lib/utils";
import { usePrefs } from "@/lib/prefs";
import { LegalLinks } from "@/components/legal-page";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "register" ? ("register" as const) : undefined,
    // Same-origin path to return to after signing in (e.g. a public booking page).
    // "//host" and "/\host" are protocol-relative URLs to other sites, so they're rejected.
    next:
      typeof search["next"] === "string" && /^\/(?![/\\])/.test(search["next"] as string)
        ? (search["next"] as string)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — SYCRAS" },
      {
        name: "description",
        content: "Entra na tua conta SYCRAS para gerir marcações, clientes e a tua página pública.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const PASSWORD_RULES = [
  { label: "onb.auth.rule.min", test: (v: string) => v.length >= 8 },
  { label: "onb.auth.rule.upper", test: (v: string) => /[A-Z]/.test(v) },
  { label: "onb.auth.rule.lower", test: (v: string) => /[a-z]/.test(v) },
  { label: "onb.auth.rule.number", test: (v: string) => /[0-9]/.test(v) },
  { label: "onb.auth.rule.symbol", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];
const emailSchema = z.string().trim().email().max(255);
/** Length of the confirmation code in the email (Supabase default). */
const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

type Mode = "login" | "register" | "verify" | "forgot" | "mfa";

/** Maps Supabase auth errors to clear messages. */
function authMessage(err: unknown, t: (k: string) => string): string {
  const message = err instanceof Error ? err.message : "";
  const status = (err as { status?: number })?.status;
  if (message.includes("Invalid login credentials")) return t("onb.auth.err.invalidLogin");
  if (/already registered|User already/i.test(message)) return t("auth.err.exists");
  if (/weak password/i.test(message)) return t("onb.auth.err.weakPassword");
  if (/expired|invalid/i.test(message) && /token|otp/i.test(message)) return t("auth.err.code");
  if (status === 429 || /rate limit|after \d+ seconds/i.test(message))
    return t("onb.auth.err.rateLimit");
  // Supabase could not send the email (usually the SMTP / sender settings).
  if (/sending .*email|smtp/i.test(message)) return t("auth.err.emailSend");
  console.error("[auth]", status, message);
  return t("onb.auth.err.generic");
}

function AuthPage() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { mode: initialMode, next } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(initialMode ?? "login");
  const [email, setEmail] = useState("");

  // Returns the signed-in user to where they came from, or the pro dashboard.
  function goAfterAuth(fallback: "/dashboard" | "/onboarding" = "/dashboard") {
    if (next) {
      navigate({ href: next });
      return;
    }
    navigate({ to: fallback });
  }

  // Already signed in (or the email link was opened in this browser): move on.
  // Signed in: the two-step code first when the account has one, then on.
  function signedIn() {
    void needsSecondStep().then((more) => (more ? setMode("mfa") : goAfterAuth()));
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // MFA_CHALLENGE_VERIFIED is handled by the code step itself.
      if (session && event !== "MFA_CHALLENGE_VERIFIED") signedIn();
      if (event === "SIGNED_OUT") setMode("login");
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) signedIn();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  const redirectTo = () =>
    typeof window === "undefined" ? undefined : `${window.location.origin}${next ?? "/onboarding"}`;

  return (
    <AuthShell>
      {mode === "login" && (
        <LoginForm
          email={email}
          setEmail={setEmail}
          onRegister={() => setMode("register")}
          onForgot={() => setMode("forgot")}
          onNeedsVerify={() => setMode("verify")}
          onDone={signedIn}
        />
      )}
      {mode === "mfa" && <SecondStep onDone={() => goAfterAuth()} />}
      {mode === "register" && (
        <RegisterForm
          email={email}
          setEmail={setEmail}
          redirectTo={redirectTo}
          onLogin={() => setMode("login")}
          onSent={() => setMode("verify")}
          onDone={() => goAfterAuth("/onboarding")}
        />
      )}
      {mode === "verify" && (
        <VerifyCode
          email={email}
          redirectTo={redirectTo}
          onChangeEmail={() => setMode("register")}
          onDone={() => goAfterAuth("/onboarding")}
        />
      )}
      {mode === "forgot" && (
        <ForgotForm email={email} setEmail={setEmail} onBack={() => setMode("login")} />
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t("auth.terms")} <LegalLinks className="font-semibold" />
      </p>
    </AuthShell>
  );
}

/** Coloured side panel on desktop, the logo above the card on phones. */
function AuthShell({ children }: { children: ReactNode }) {
  const { t } = usePrefs();
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-brand bg-[linear-gradient(150deg,var(--brand),color-mix(in_oklch,var(--brand)_70%,#38a3ff))] p-12 text-brand-foreground lg:flex lg:flex-col lg:justify-between">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl"
        />
        <Link
          to="/"
          className="relative flex items-center gap-2.5 text-sm font-bold tracking-[0.14em]"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15">
            <SycrasLogo className="size-6" onColor />
          </span>
          SYCRAS
        </Link>
        <div className="relative max-w-md">
          <p className="font-display text-4xl font-bold leading-[1.1] tracking-tight">
            {t("auth.side.title")}
          </p>
          <ul className="mt-8 space-y-3.5">
            {["auth.side.b1", "auth.side.b2", "auth.side.b3"].map((k) => (
              <li key={k} className="flex items-start gap-3 text-[15px] font-medium">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Check className="size-3" strokeWidth={3.5} />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs opacity-80">{t("home.reassure")}</p>
      </aside>

      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <Link
          to="/"
          className="mb-8 flex items-center gap-2.5 text-sm font-bold tracking-[0.14em] lg:hidden"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand">
            <SycrasLogo className="size-6" onColor />
          </span>
          SYCRAS
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  const { t } = usePrefs();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className="pr-12"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function LoginForm({
  email,
  setEmail,
  onRegister,
  onForgot,
  onNeedsVerify,
  onDone,
}: {
  email: string;
  setEmail: (v: string) => void;
  onRegister: () => void;
  onForgot: () => void;
  onNeedsVerify: () => void;
  onDone: () => void;
}) {
  const { t } = usePrefs();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailSchema.safeParse(email).success) {
      setError(t("onb.auth.err.email"));
      return;
    }
    if (!password) {
      setError(t("auth.err.password"));
      return;
    }
    setBusy(true);
    try {
      const res = await passwordLogin(email, password, captcha);
      if (res.code === "ok") {
        onDone();
        return;
      }
      // Each token works once: get a new one for the next try.
      setCaptchaKey((k) => k + 1);
      if (res.code === "unconfirmed") {
        // Unconfirmed account: send a fresh code and go straight to the code step.
        await supabase.auth.resend({ type: "signup", email: email.trim() }).catch(() => null);
        onNeedsVerify();
        return;
      }
      if (res.code === "invalid") {
        const known = await emailHasAccount({ data: { email: email.trim() } }).catch(() => null);
        setError(
          known?.known && !known.registered
            ? t("onb.auth.err.noAccount")
            : res.left <= 2
              ? t("auth.err.triesLeft").replace("{n}", String(res.left))
              : t("onb.auth.err.invalidLogin"),
        );
        return;
      }
      if (res.code === "locked") {
        setError(t("auth.err.locked").replace("{n}", String(res.minutes)));
        return;
      }
      if (res.code === "captcha") {
        setError(t("auth.err.captcha"));
        return;
      }
      setError(res.code === "rate_limit" ? t("onb.auth.err.rateLimit") : t("onb.auth.err.generic"));
    } catch (err) {
      setError(authMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface animate-enter p-6 sm:p-7">
      <CardHeader title={t("onb.auth.title.login")} subtitle={t("onb.auth.subtitle.other")} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("onb.auth.email")}</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("onb.auth.email.placeholder")}
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("onb.auth.password")}</Label>
            <button
              type="button"
              onClick={onForgot}
              className="text-xs font-semibold text-brand-ink underline-offset-4 hover:underline"
            >
              {t("onb.auth.forgotPassword")}
            </button>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>
        <Captcha onToken={setCaptcha} resetKey={captchaKey} />
        <FormError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {t("onb.auth.submit.login")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("onb.auth.noAccount")}{" "}
        <button
          type="button"
          onClick={onRegister}
          className="font-bold text-brand-ink underline-offset-4 hover:underline"
        >
          {t("onb.auth.createAccount")}
        </button>
      </p>
    </section>
  );
}

function RegisterForm({
  email,
  setEmail,
  redirectTo,
  onLogin,
  onSent,
  onDone,
}: {
  email: string;
  setEmail: (v: string) => void;
  redirectTo: () => string | undefined;
  onLogin: () => void;
  onSent: () => void;
  onDone: () => void;
}) {
  const { t } = usePrefs();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  // Invite code: from the invite link, or typed here; used when the business is created.
  const [invite, setInviteCode] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  useEffect(() => {
    const saved = getInvite();
    if (saved) {
      setInviteCode(saved);
      setShowInvite(true);
    }
  }, []);
  const passwordOk = PASSWORD_RULES.every((r) => r.test(password));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExists(false);
    if (name.trim().length < 2) {
      setError(t("auth.err.name"));
      return;
    }
    if (!emailSchema.safeParse(email).success) {
      setError(t("onb.auth.err.email"));
      return;
    }
    if (!passwordOk) {
      setError(t("auth.err.passwordRules"));
      return;
    }
    setBusy(true);
    try {
      // A password from a known data breach is the first one attackers try.
      if (await isBreachedPassword(password)) {
        setError(t("auth.err.breached"));
        return;
      }
      setInvite(invite);
      const redirect = redirectTo();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          ...(redirect ? { emailRedirectTo: redirect } : {}),
          ...(captcha ? { captchaToken: captcha } : {}),
          data: { full_name: name.trim() },
        },
      });
      setCaptchaKey((k) => k + 1);
      if (signUpError) throw signUpError;
      // Email already registered (Supabase returns a user with no identities).
      if (data.user && data.user.identities?.length === 0) {
        setExists(true);
        return;
      }
      // Email confirmation switched off in the project: already signed in.
      if (data.session) {
        onDone();
        return;
      }
      onSent();
    } catch (err) {
      const message = authMessage(err, t);
      if (message === t("auth.err.exists")) setExists(true);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface animate-enter p-6 sm:p-7">
      <StepDots current={1} />
      <CardHeader title={t("onb.auth.title.register")} subtitle={t("onb.auth.subtitle.register")} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("auth.yourName")}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("onb.auth.name.placeholder")}
            maxLength={80}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("onb.auth.email")}</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("onb.auth.email.placeholder")}
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("onb.auth.password")}</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder={t("onb.auth.password.placeholder")}
          />
          {/* Each rule turns green as it's met. */}
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li
                  key={r.label}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    ok
                      ? "bg-st-confirmed/12 text-st-confirmed-fg"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {ok && <Check className="size-3" strokeWidth={3.5} />}
                  {t(r.label)}
                </li>
              );
            })}
          </ul>
        </div>
        {exists ? (
          <div className="rounded-xl border border-border bg-muted p-3.5 text-sm">
            <p className="font-semibold">{t("auth.err.exists")}</p>
            <button
              type="button"
              onClick={onLogin}
              className="mt-1 font-bold text-brand-ink underline-offset-4 hover:underline"
            >
              {t("auth.loginInstead")}
            </button>
          </div>
        ) : (
          <FormError message={error} />
        )}
        {showInvite ? (
          <div className="space-y-1.5">
            <Label htmlFor="invite">{t("ref.signup.label")}</Label>
            <Input
              id="invite"
              value={invite}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={16}
            />
            <p className="text-xs text-muted-foreground">{t("ref.signup.hint")}</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="text-sm font-semibold text-brand-ink underline-offset-4 hover:underline"
          >
            {t("ref.signup.have")}
          </button>
        )}
        <Captcha onToken={setCaptcha} resetKey={captchaKey} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {t("auth.continue")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("auth.haveAccount")}{" "}
        <button
          type="button"
          onClick={onLogin}
          className="font-bold text-brand-ink underline-offset-4 hover:underline"
        >
          {t("onb.auth.submit.login")}
        </button>
      </p>
    </section>
  );
}

/** Step 2 of sign-up: the 6-digit code from the email (the link in it also works). */
function VerifyCode({
  email,
  redirectTo,
  onChangeEmail,
  onDone,
}: {
  email: string;
  redirectTo: () => string | undefined;
  onChangeEmail: () => void;
  onDone: () => void;
}) {
  const { t } = usePrefs();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  async function verify(value: string) {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: value,
        type: "signup",
      });
      if (otpError) throw otpError;
      toast.success(t("auth.verified"));
      onDone();
    } catch (err) {
      setError(t("auth.err.code"));
      setCode("");
      console.error("[auth] code verification failed", err);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const redirect = redirectTo();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          ...(redirect ? { emailRedirectTo: redirect } : {}),
          ...(captcha ? { captchaToken: captcha } : {}),
        },
      });
      setCaptchaKey((k) => k + 1);
      if (resendError) throw resendError;
      toast.success(t("onb.auth.success.resent"));
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(authMessage(err, t));
    }
  }

  return (
    <section className="surface animate-enter p-6 text-center sm:p-7">
      <StepDots current={2} />
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand/12 dark:bg-brand/25 text-brand-ink">
        <MailCheck className="size-7" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
        {t("auth.verify.title")}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {t("auth.verify.body")} <span className="font-bold text-foreground">{email}</span>
      </p>

      <div className="mt-6 flex justify-center">
        <InputOTP
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(v) => {
            setCode(v.replace(/\D/g, ""));
            setError(null);
          }}
          onComplete={(v) => void verify(v)}
          inputMode="numeric"
          autoFocus
          disabled={busy}
        >
          <InputOTPGroup className="gap-2">
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="size-12 rounded-xl border bg-card text-xl font-bold shadow-none first:rounded-l-xl last:rounded-r-xl sm:size-13"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="mt-4 min-h-6">
        {busy ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("auth.verify.checking")}
          </p>
        ) : (
          <FormError message={error} className="text-left" />
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{t("auth.verify.linkTip")}</p>

      <div className="mt-6 flex flex-col gap-2">
        {wait <= 0 && <Captcha onToken={setCaptcha} resetKey={captchaKey} />}
        <Button variant="outline" onClick={() => void resend()} disabled={wait > 0}>
          {wait > 0 ? t("auth.verify.resendIn").replace("{s}", String(wait)) : t("onb.auth.resend")}
        </Button>
        <Button variant="ghost" onClick={onChangeEmail}>
          <ArrowLeft /> {t("auth.verify.changeEmail")}
        </Button>
      </div>
    </section>
  );
}

/** After the password, for accounts with two-step verification: the code from the authenticator app. */
function SecondStep({ onDone }: { onDone: () => void }) {
  const { t } = usePrefs();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(value: string) {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp.find((x) => x.status === "verified");
      if (!factor) throw new Error("no factor");
      const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: value,
      });
      if (mfaError) throw mfaError;
      onDone();
    } catch {
      setError(t("auth.mfa.wrong"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface animate-enter p-6 text-center sm:p-7">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand/12 dark:bg-brand/25 text-brand-ink">
        <ShieldCheck className="size-7" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">{t("auth.mfa.title")}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{t("auth.mfa.body")}</p>

      <div className="mt-6 flex justify-center">
        <InputOTP
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(v) => {
            setCode(v.replace(/\D/g, ""));
            setError(null);
          }}
          onComplete={(v) => void verify(v)}
          inputMode="numeric"
          autoFocus
          disabled={busy}
        >
          <InputOTPGroup className="gap-2">
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="size-12 rounded-xl border bg-card text-xl font-bold shadow-none first:rounded-l-xl last:rounded-r-xl sm:size-13"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="mt-4 min-h-6">
        {busy ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("auth.verify.checking")}
          </p>
        ) : (
          <FormError message={error} className="text-left" />
        )}
      </div>

      <Button variant="ghost" className="mt-4" onClick={() => void supabase.auth.signOut()}>
        <ArrowLeft /> {t("auth.mfa.other")}
      </Button>
    </section>
  );
}

function ForgotForm({
  email,
  setEmail,
  onBack,
}: {
  email: string;
  setEmail: (v: string) => void;
  onBack: () => void;
}) {
  const { t } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailSchema.safeParse(email).success) {
      setError(t("onb.auth.err.email"));
      return;
    }
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
        ...(captcha ? { captchaToken: captcha } : {}),
      });
      setCaptchaKey((k) => k + 1);
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      setError(authMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section className="surface animate-enter p-6 text-center sm:p-7">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand/12 dark:bg-brand/25 text-brand-ink">
          <MailCheck className="size-7" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
          {t("auth.forgot.sentTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("auth.forgot.sentBody")} <span className="font-bold text-foreground">{email}</span>
        </p>
        <Button variant="ghost" className="mt-6 w-full" onClick={onBack}>
          <ArrowLeft /> {t("onb.auth.backToLogin2")}
        </Button>
      </section>
    );
  }

  return (
    <section className="surface animate-enter p-6 sm:p-7">
      <CardHeader title={t("onb.auth.title.forgot")} subtitle={t("auth.forgot.subtitle")} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("onb.auth.email")}</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("onb.auth.email.placeholder")}
            autoComplete="email"
          />
        </div>
        <Captcha onToken={setCaptcha} resetKey={captchaKey} />
        <FormError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {t("onb.auth.submit.forgot")}
        </Button>
      </form>
      <Button variant="ghost" className="mt-3 w-full" onClick={onBack}>
        <ArrowLeft /> {t("onb.auth.backToLogin2")}
      </Button>
    </section>
  );
}

/** "1 Conta · 2 Email · 3 Negócio" — the three stages of getting started. */
function StepDots({ current }: { current: 1 | 2 | 3 }) {
  const { t } = usePrefs();
  const labels = [t("auth.stage.account"), t("auth.stage.email"), t("auth.stage.business")];
  return (
    <ol className="mb-6 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                done && "bg-st-confirmed text-white",
                active && "bg-brand text-brand-foreground",
                !done && !active && "bg-muted",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3.5} /> : n}
            </span>
            <span className={cn("truncate", active && "text-foreground")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
