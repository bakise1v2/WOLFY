"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccessSession } from "@/lib/private-access";

type PrivateGameParticipant = {
  user_id: string;
  pseudo: string;
  role: "admin" | "player" | "reserve";
};

type PrivateGameRoom = {
  id: string;
  code: string;
  status: "waiting" | "running" | "completed";
  created_at: string;
  participants: PrivateGameParticipant[];
};

type MemberRoom = PrivateGameRoom & { pseudo: string };

function roomStatusLabel(status: PrivateGameRoom["status"]) {
  if (status === "waiting") return "En attente des joueurs";
  if (status === "running") return "Partie en cours";
  return "Partie terminée";
}

export function PrivateGameLobby({
  session,
  onPlaySolo,
}: {
  session: AccessSession;
  onPlaySolo: () => void;
}) {
  const [code, setCode] = useState("");
  const [memberships, setMemberships] = useState<MemberRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMemberships = useCallback(async () => {
    const response = await fetch("/api/private-games", { cache: "no-store" });
    const payload = (await response.json()) as { error?: string; memberships?: MemberRoom[] };
    if (!response.ok || !payload.memberships) {
      throw new Error(payload.error ?? "Impossible de charger tes salons.");
    }
    setMemberships(payload.memberships);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await loadMemberships();
        if (active) setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Impossible de charger tes salons.");
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadMemberships]);

  const joinRoom = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/private-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Impossible de rejoindre ce salon.");
      setCode("");
      await loadMemberships();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de rejoindre ce salon.");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const response = await fetch("/api/private-access/logout", { method: "POST" });
    if (!response.ok) {
      setError("Impossible de fermer la session.");
      return;
    }
    window.location.reload();
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827,_#020617_55%,_#01030a)] px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300">Wolfcha Club</p>
            <h1 className="mt-2 text-3xl font-semibold">Rejoindre une partie</h1>
            <p className="mt-2 text-sm text-slate-400">Connecté en tant que {session.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {session.role === "admin" && (
              <a href="/admin" className="rounded-lg border border-violet-500/40 px-3 py-2 text-sm text-violet-200 hover:bg-violet-900/40">
                Administration
              </a>
            )}
            <button type="button" onClick={onPlaySolo} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              Jouer contre l’IA
            </button>
            <button type="button" onClick={() => void logout()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
              Déconnexion
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
          <h2 className="text-xl font-semibold">Code de la partie</h2>
          <p className="mt-1 text-sm text-slate-400">Demande le code à l’administrateur qui a créé le salon.</p>
          <form onSubmit={joinRoom} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, ""))}
              placeholder="Ex. A1B2C3D4E5F6A7B8"
              maxLength={16}
              autoComplete="off"
              required
              aria-label="Code de la partie"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500"
            />
            <button type="submit" disabled={loading || code.length !== 16} className="rounded-lg bg-violet-600 px-5 py-2 font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "Connexion…" : "Rejoindre"}
            </button>
          </form>
          {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-xl font-semibold">Mes salons</h2>
          {memberships.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
              Tu n’as pas encore rejoint de partie.
            </p>
          ) : (
            <div className="space-y-3">
              {memberships.map((room) => (
                <article key={room.id} className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-lg font-semibold tracking-widest text-violet-200">{room.code}</code>
                    <span className="rounded-full border border-amber-500/40 px-3 py-1 text-xs text-amber-200">{roomStatusLabel(room.status)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{room.participants.length} joueur(s) dans le salon</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {room.participants.map((participant) => (
                      <span key={participant.user_id} className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200">
                        {participant.pseudo}{participant.user_id === session.userId ? " (toi)" : ""}
                      </span>
                    ))}
                  </div>
                  {room.status === "waiting" ? (
                    <p className="mt-3 text-xs text-slate-500">
                      {room.participants.length}/5 joueurs minimum (10 maximum). L’administrateur peut lancer à partir de 5 joueurs.
                    </p>
                  ) : (
                    <a href={`/private-game/${room.id}`} className="mt-3 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500">
                      {room.status === "running" ? "Entrer dans la partie" : "Voir la partie"}
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export function AdminPrivateGames() {
  const [rooms, setRooms] = useState<PrivateGameRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [startingRoomId, setStartingRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    const response = await fetch("/api/private-games", { cache: "no-store" });
    const payload = (await response.json()) as { error?: string; rooms?: PrivateGameRoom[] };
    if (!response.ok || !payload.rooms) throw new Error(payload.error ?? "Impossible de charger les salons.");
    setRooms(payload.rooms);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await loadRooms();
        if (active) setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Impossible de charger les salons.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadRooms]);

  const createRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/private-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Impossible de créer le salon.");
      await loadRooms();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de créer le salon.");
    } finally {
      setCreating(false);
    }
  };

  const startRoom = async (room: PrivateGameRoom) => {
    setStartingRoomId(room.id);
    setError(null);
    try {
      const response = await fetch("/api/private-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", code: room.code }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Impossible de lancer la partie.");
      window.location.assign(`/private-game/${room.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de lancer la partie.");
    } finally {
      setStartingRoomId(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => current === code ? null : current), 2000);
    } catch {
      setError("Copie impossible. Sélectionne puis copie le code affiché.");
    }
  };

  return (
    <section className="rounded-2xl border border-violet-500/30 bg-slate-900/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Parties privées</h2>
          <p className="mt-1 text-sm text-slate-400">Crée un salon et partage son code aux membres.</p>
        </div>
        <button type="button" disabled={creating} onClick={() => void createRoom()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {creating ? "Création…" : "Créer une partie"}
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}
      {loading ? (
        <p className="py-6 text-sm text-slate-400">Chargement des parties…</p>
      ) : rooms.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-400">Aucune partie créée.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rooms.map((room) => (
            <article key={room.id} className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400">{roomStatusLabel(room.status)}</p>
                  <code className="mt-1 block text-lg font-semibold tracking-widest text-violet-200">{room.code}</code>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void copyCode(room.code)} className="rounded-lg border border-violet-500/40 px-3 py-2 text-sm text-violet-200 hover:bg-violet-900/40">
                    {copiedCode === room.code ? "Copié" : "Copier le code"}
                  </button>
                  {room.status === "waiting" && (
                    <button
                      type="button"
                      disabled={startingRoomId !== null || room.participants.length < 5}
                      onClick={() => void startRoom(room)}
                      title={room.participants.length < 5 ? "Il faut au moins 5 joueurs inscrits." : undefined}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {startingRoomId === room.id ? "Lancement…" : `Lancer (${room.participants.length}/5)`}
                    </button>
                  )}
                  {room.status !== "waiting" && (
                    <a href={`/private-game/${room.id}`} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500">
                      Entrer dans la partie
                    </a>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-400">{room.participants.length} joueur(s) connecté(s)</p>
              {room.participants.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {room.participants.map((participant) => (
                    <span key={participant.user_id} className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-200">{participant.pseudo}</span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">L’administrateur est inscrit comme joueur. Il faut 5 à 10 membres, administrateurs compris, pour lancer la partie.</p>
    </section>
  );
}
