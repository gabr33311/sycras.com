import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { usePrefs } from "@/lib/prefs";
import { isBreachedPassword } from "@/lib/password-breached";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova palavra-passe — SYCRAS" },
      { name: "description", content: "Define uma nova palavra-passe para a tua conta SYCRAS." },
      { property: "og:title", content: "Nova palavra-passe — SYCRAS" },
      { property: "og:description", content: "Define uma nova palavra-passe para a tua conta." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const COPY = {
  pt: {
    title: "Nova palavra-passe",
    desc: "Escolhe uma nova palavra-passe para entrar na tua conta.",
    newPass: "Nova palavra-passe",
    confirm: "Confirmar palavra-passe",
    submit: "Guardar palavra-passe",
    rules: "Mínimo 8 caracteres, com maiúscula, minúscula e número.",
    weak: "A palavra-passe tem de ter 8 caracteres, maiúscula, minúscula e número.",
    breached: "Esta palavra-passe apareceu em fugas de dados de outros sites. Escolhe outra.",
    mismatch: "As palavras-passe não coincidem.",
    noSession: "Link inválido ou expirado. Pede um novo email de reposição.",
    done: "Palavra-passe atualizada.",
    fail: "Não foi possível atualizar a palavra-passe.",
    back: "Voltar a entrar",
  },
  en: {
    title: "New password",
    desc: "Choose a new password to sign in to your account.",
    newPass: "New password",
    confirm: "Confirm password",
    submit: "Save password",
    rules: "At least 8 characters, with uppercase, lowercase and a number.",
    weak: "Password needs 8 characters, uppercase, lowercase and a number.",
    breached: "This password appeared in data breaches on other sites. Choose another one.",
    mismatch: "Passwords do not match.",
    noSession: "Invalid or expired link. Request a new reset email.",
    done: "Password updated.",
    fail: "Could not update the password.",
    back: "Back to sign in",
  },
  "pt-BR": {
    title: "Nova senha",
    desc: "Escolha uma nova senha para entrar na sua conta.",
    newPass: "Nova senha",
    confirm: "Confirmar senha",
    submit: "Salvar senha",
    rules: "Mínimo de 8 caracteres, com maiúscula, minúscula e número.",
    weak: "A senha precisa ter 8 caracteres, maiúscula, minúscula e número.",
    breached: "Esta senha apareceu em vazamentos de dados de outros sites. Escolha outra.",
    mismatch: "As senhas não coincidem.",
    noSession: "Link inválido ou expirado. Peça um novo e-mail de redefinição.",
    done: "Senha atualizada.",
    fail: "Não foi possível atualizar a senha.",
    back: "Voltar para o login",
  },
  es: {
    title: "Nueva contraseña",
    desc: "Elige una nueva contraseña para entrar en tu cuenta.",
    newPass: "Nueva contraseña",
    confirm: "Confirmar contraseña",
    submit: "Guardar contraseña",
    rules: "Mínimo 8 caracteres, con mayúscula, minúscula y número.",
    weak: "La contraseña debe tener 8 caracteres, mayúscula, minúscula y número.",
    breached: "Esta contraseña apareció en filtraciones de datos de otros sitios. Elige otra.",
    mismatch: "Las contraseñas no coinciden.",
    noSession: "Enlace no válido o caducado. Pide un nuevo email de recuperación.",
    done: "Contraseña actualizada.",
    fail: "No se ha podido actualizar la contraseña.",
    back: "Volver a entrar",
  },
  fr: {
    title: "Nouveau mot de passe",
    desc: "Choisissez un nouveau mot de passe pour vous connecter à votre compte.",
    newPass: "Nouveau mot de passe",
    confirm: "Confirmer le mot de passe",
    submit: "Enregistrer le mot de passe",
    rules: "8 caractères minimum, avec majuscule, minuscule et chiffre.",
    weak: "Le mot de passe doit contenir 8 caractères, une majuscule, une minuscule et un chiffre.",
    breached: "Ce mot de passe est apparu dans des fuites de données d'autres sites. Choisissez-en un autre.",
    mismatch: "Les mots de passe ne correspondent pas.",
    noSession: "Lien invalide ou expiré. Demandez un nouvel e-mail de réinitialisation.",
    done: "Mot de passe mis à jour.",
    fail: "Impossible de mettre à jour le mot de passe.",
    back: "Retour à la connexion",
  },
  it: {
    title: "Nuova password",
    desc: "Scegli una nuova password per accedere al tuo account.",
    newPass: "Nuova password",
    confirm: "Conferma password",
    submit: "Salva password",
    rules: "Minimo 8 caratteri, con maiuscola, minuscola e numero.",
    weak: "La password deve avere 8 caratteri, una maiuscola, una minuscola e un numero.",
    breached: "Questa password è comparsa in fughe di dati di altri siti. Scegline un'altra.",
    mismatch: "Le password non coincidono.",
    noSession: "Link non valido o scaduto. Richiedi una nuova email di reimpostazione.",
    done: "Password aggiornata.",
    fail: "Impossibile aggiornare la password.",
    back: "Torna all’accesso",
  },
  de: {
    title: "Neues Passwort",
    desc: "Wähle ein neues Passwort für dein Konto.",
    newPass: "Neues Passwort",
    confirm: "Passwort bestätigen",
    submit: "Passwort speichern",
    rules: "Mindestens 8 Zeichen, mit Groß- und Kleinbuchstaben und einer Zahl.",
    weak: "Das Passwort braucht 8 Zeichen, Groß- und Kleinbuchstaben und eine Zahl.",
    breached: "Dieses Passwort tauchte in Datenlecks anderer Seiten auf. Wähle ein anderes.",
    mismatch: "Die Passwörter stimmen nicht überein.",
    noSession: "Ungültiger oder abgelaufener Link. Fordere eine neue E-Mail zum Zurücksetzen an.",
    done: "Passwort aktualisiert.",
    fail: "Das Passwort konnte nicht aktualisiert werden.",
    back: "Zurück zur Anmeldung",
  },
} as const;

function strong(v: string) {
  return v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v);
}

function ResetPasswordPage() {
  const { lang } = usePrefs();
  const c = COPY[lang];
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!strong(password)) {
      toast.error(c.weak);
      return;
    }
    if (password !== confirm) {
      toast.error(c.mismatch);
      return;
    }
    if (!ready) {
      toast.error(c.noSession);
      return;
    }
    setBusy(true);
    // A password from a known data breach is the first one attackers try.
    if (await isBreachedPassword(password)) {
      setBusy(false);
      toast.error(c.breached);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message || c.fail);
      return;
    }
    toast.success(c.done);
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="surface animate-enter w-full max-w-sm p-6">
        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border bg-card">
          <KeyRound className="size-5" strokeWidth={2.6} />
        </div>
        <h1 className="text-xl font-bold">{c.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="np">{c.newPass}</Label>
            <Input
              id="np"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <p className="text-[11px] font-medium text-muted-foreground">{c.rules}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp">{c.confirm}</Label>
            <Input
              id="cp"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {c.submit}
          </Button>
        </form>

        <button
          className="mt-5 w-full text-center text-sm font-bold text-muted-foreground hover:text-foreground"
          onClick={() => navigate({ to: "/auth", search: { mode: undefined, next: undefined } })}
        >
          {c.back}
        </button>
      </div>
    </div>
  );
}
