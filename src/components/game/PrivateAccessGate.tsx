"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessSession } from "@/lib/private-access";

interface PrivateAccessGateProps {
  onSuccess: (session: AccessSession) => void;
}

export function PrivateAccessGate({ onSuccess }: PrivateAccessGateProps) {
  const [code, setCode] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || pseudo.trim().length < 2 || pseudo.trim().length > 24) {
      setError("Saisis ton code privé et un pseudo de 2 à 24 caractères.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/private-access/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pseudo }),
      });

      const payload = (await response.json()) as { error?: string; session?: AccessSession };

      if (!response.ok || !payload.session) {
        setError(payload.error ?? "Code invalide.");
        setLoading(false);
        return;
      }

      onSuccess(payload.session);
    } catch {
      setError("Vérification impossible. Réessaie dans quelques instants.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827,_#020617_55%,_#01030a)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl rounded-3xl border border-slate-700/80 bg-slate-950/80 p-6 shadow-2xl shadow-slate-950/60 backdrop-blur-md">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-violet-300">Private access</p>
              <h1 className="mt-3 text-3xl font-semibold text-white">Wolfcha Club</h1>
            </div>
            <div className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
              10 comptes + 2 secours
            </div>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Admins</div>
              <div className="mt-2 text-2xl font-bold text-amber-300">2</div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Joueurs</div>
              <div className="mt-2 text-2xl font-bold text-sky-300">8</div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Secours</div>
              <div className="mt-2 text-2xl font-bold text-emerald-300">2</div>
            </div>
          </div>

          <p className="mb-5 text-sm leading-6 text-slate-300">
            Accès réservé au club privé. Entre ton code privé et le pseudo qui sera affiché dans les salons.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="private-pseudo" className="text-sm font-medium text-slate-200">
                Pseudo
              </label>
              <Input
                id="private-pseudo"
                value={pseudo}
                onChange={(event) => setPseudo(event.target.value)}
                placeholder="Ton pseudo"
                autoComplete="nickname"
                maxLength={24}
                required
                className="border-slate-700 bg-slate-900/80 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="private-code" className="text-sm font-medium text-slate-200">
                Code privé
              </label>
              <Input
                id="private-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Entrez votre code"
                required
                autoComplete="one-time-code"
                className="border-slate-700 bg-slate-900/80 text-white placeholder:text-slate-500"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-500">
              {loading ? "Vérification..." : "Entrer dans le salon"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
