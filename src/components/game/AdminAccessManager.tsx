"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicAccessProfile } from "@/lib/private-access";

type AccountAction = "rotate" | "revoke" | "activate";

export function AdminAccessManager() {
  const [accounts, setAccounts] = useState<PublicAccessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<{ label: string; value: string } | null>(null);

  const loadAccounts = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/private-access/admin/accounts", { cache: "no-store" });
    const payload = (await response.json()) as {
      error?: string;
      accounts?: PublicAccessProfile[];
    };
    if (!response.ok || !payload.accounts) {
      throw new Error(payload.error ?? "Impossible de charger les comptes.");
    }
    setAccounts(payload.accounts);
  }, []);

  useEffect(() => {
    loadAccounts()
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Impossible de charger les comptes.");
      })
      .finally(() => setLoading(false));
  }, [loadAccounts]);

  const performAction = async (account: PublicAccessProfile, action: AccountAction) => {
    setBusyAccountId(account.id);
    setError(null);
    setNewCode(null);
    try {
      const response = await fetch("/api/private-access/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, action }),
      });
      const payload = (await response.json()) as { error?: string; code?: string };
      if (!response.ok) throw new Error(payload.error ?? "Action impossible.");

      if (payload.code) {
        setNewCode({ label: account.label, value: payload.code });
      }
      await loadAccounts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible.");
    } finally {
      setBusyAccountId(null);
    }
  };

  const copyCode = async () => {
    if (!newCode) return;
    try {
      await navigator.clipboard.writeText(newCode.value);
    } catch {
      setError("Copie impossible. Sélectionne puis copie le code affiché.");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Gestion des accès</h2>
        <p className="mt-1 text-sm text-slate-400">
          Renouvelle un code pour l’afficher une seule fois, ou révoque/réactive un accès.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {newCode && (
        <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4">
          <p className="text-sm font-medium text-emerald-200">
            Nouveau code de {newCode.label} — copie-le maintenant, il ne sera plus réaffiché.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-slate-950 px-3 py-2 text-sm text-white">{newCode.value}</code>
            <button
              type="button"
              onClick={copyCode}
              className="rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-900/40"
            >
              Copier
            </button>
            <button
              type="button"
              onClick={() => setNewCode(null)}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Masquer
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-6 text-sm text-slate-400">Chargement des comptes…</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-white">{account.label}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  {account.role === "admin" ? "Administrateur" : account.role === "player" ? "Joueur" : "Secours"}
                  {" · "}
                  <span className={account.active ? "text-emerald-300" : "text-red-300"}>
                    {account.active ? "Actif" : "Révoqué"}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyAccountId !== null}
                  onClick={() => performAction(account, "rotate")}
                  className="rounded-lg border border-violet-500/40 px-3 py-2 text-xs text-violet-200 hover:bg-violet-900/40 disabled:opacity-50"
                >
                  {busyAccountId === account.id ? "Patiente…" : "Renouveler le code"}
                </button>
                {account.active ? (
                  <button
                    type="button"
                    disabled={busyAccountId !== null || account.role === "admin"}
                    onClick={() => performAction(account, "revoke")}
                    className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-200 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    Révoquer
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyAccountId !== null}
                    onClick={() => performAction(account, "activate")}
                    className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-950/40 disabled:opacity-50"
                  >
                    Réactiver
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Les 12 comptes restent fixes (2 admins, 8 joueurs, 2 secours). Seuls les condensats sont enregistrés dans le fichier local privé.
      </p>
    </section>
  );
}
