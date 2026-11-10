"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  UserPlus,
  Ban,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: string;
  disabled: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "player" as "player" | "admin",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
  };

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace("/login");
      else if (!isAdmin) router.replace("/");
      else loadUsers();
    }
  }, [user, loading, isAdmin, router]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMessage(`Compte créé : ${form.displayName}`);
      setForm({ email: "", password: "", displayName: "", role: "player" });
      loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de création");
    } finally {
      setCreating(false);
    }
  };

  const toggleDisabled = async (id: string, currentlyDisabled: boolean) => {
    try {
      await fetch("/api/admin/toggle-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, disabled: !currentlyDisabled }),
      });
      loadUsers();
    } catch {
      setError("Impossible de modifier le compte.");
    }
  };

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg hover:bg-muted text-violet-300">
            <ArrowLeft size={20} />
          </Link>
          <Shield className="text-accent" size={20} />
          <h1 className="font-bold text-lg">Administration</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <UserPlus size={18} className="text-accent" />
            Créer un compte (max 10 au total)
          </h2>
          <form onSubmit={createUser} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Pseudonyme"
                required
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="px-4 py-2.5 rounded-xl bg-muted border border-border text-white focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
              <input
                type="email"
                placeholder="E-mail"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="px-4 py-2.5 rounded-xl bg-muted border border-border text-white focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
              <input
                type="password"
                placeholder="Mot de passe (min 8)"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="px-4 py-2.5 rounded-xl bg-muted border border-border text-white focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as "player" | "admin" })
                }
                className="px-4 py-2.5 rounded-xl bg-muted border border-border text-white focus:outline-none focus:ring-2 focus:ring-primary/60"
              >
                <option value="player">Joueur</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating || users.length >= 10}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary hover:bg-violet-600 disabled:opacity-50 font-medium"
            >
              {creating ? "Création..." : "Créer le compte"}
            </button>
          </form>
          {message && <p className="mt-3 text-sm text-green-400">{message}</p>}
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          {users.length >= 10 && (
            <p className="mt-2 text-sm text-amber-400">Limite de 10 comptes atteinte.</p>
          )}
        </section>

        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold mb-4">Comptes ({users.length}/10)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-violet-400 border-b border-border">
                  <th className="pb-2 pr-2">Pseudo</th>
                  <th className="pb-2 pr-2">E-mail</th>
                  <th className="pb-2 pr-2">Rôle</th>
                  <th className="pb-2 pr-2">Statut</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-2">{u.displayName}</td>
                    <td className="py-2.5 pr-2 text-violet-300">{u.email}</td>
                    <td className="py-2.5 pr-2">
                      {u.role === "admin" ? (
                        <span className="text-accent">Admin</span>
                      ) : (
                        "Joueur"
                      )}
                    </td>
                    <td className="py-2.5 pr-2">
                      {u.disabled ? (
                        <span className="text-red-400">Désactivé</span>
                      ) : (
                        <span className="text-green-400">Actif</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {u.id !== user?.id && (
                        <button
                          onClick={() => toggleDisabled(u.id, u.disabled)}
                          className="p-1.5 rounded-lg hover:bg-muted"
                          title={u.disabled ? "Réactiver" : "Désactiver"}
                        >
                          {u.disabled ? (
                            <CheckCircle size={16} className="text-green-400" />
                          ) : (
                            <Ban size={16} className="text-red-400" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-xs text-violet-500/70 text-center">
          Les permissions administrateur sont vérifiées côté serveur.
        </p>
      </main>
    </div>
  );
}
