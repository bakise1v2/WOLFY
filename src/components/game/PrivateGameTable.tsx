"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type RoleName = "Villager" | "Werewolf" | "WhiteWolfKing" | "Seer" | "Witch" | "Hunter" | "Guard" | "Idiot";
type GamePhase = "night_wolf" | "night_guard" | "night_witch" | "night_seer" | "day_speech" | "day_vote" | "hunter" | "ended";
type GamePlayer = { user_id: string; pseudo: string; seat: number; alive: boolean; role?: RoleName };
type GameSnapshot = {
  day: number;
  phase: GamePhase;
  testMode: boolean;
  players: GamePlayer[];
  speeches: Array<{ user_id: string; pseudo: string; content: string; day: number; created_at: string }>;
  speechTurnUserId: string | null;
  votes: Record<string, number>;
  voteCount: number;
  nightResult: { deaths: number[]; wolfTarget: number | null } | null;
  privateInfo: {
    role: RoleName;
    seerHistory: Array<{ pseudo: string; role: string; day: number }>;
    wolfTarget: number | null;
    wolfAllies: string[];
    potionStatus: { healUsed: boolean; poisonUsed: boolean; victimSeat: number | null } | null;
    hasActed: boolean;
  };
  winner: "village" | "wolf" | null;
};
type GameRoom = {
  id: string;
  code: string;
  status: "waiting" | "running" | "completed";
  participants: Array<{ user_id: string; pseudo: string }>;
};

const phaseLabels: Record<GamePhase, string> = {
  night_wolf: "La nuit — choix des loups",
  night_guard: "La nuit — choix du gardien",
  night_witch: "La nuit — choix de la sorcière",
  night_seer: "La nuit — choix de la voyante",
  day_speech: "Le jour — tour de parole",
  day_vote: "Le jour — vote du village",
  hunter: "Dernier tir du chasseur",
  ended: "Partie terminée",
};

const roleLabels: Record<RoleName, string> = {
  Villager: "Villageois",
  Werewolf: "Loup-garou",
  WhiteWolfKing: "Roi loup blanc",
  Seer: "Voyante",
  Witch: "Sorcière",
  Hunter: "Chasseur",
  Guard: "Gardien",
  Idiot: "Idiot du village",
};

export function PrivateGameTable({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [selectedSeat, setSelectedSeat] = useState("");
  const [speech, setSpeech] = useState("");
  const [witchChoice, setWitchChoice] = useState<"pass" | "save" | "poison">("pass");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/private-games/${encodeURIComponent(roomId)}`, { cache: "no-store" });
    const payload = (await response.json()) as { error?: string; room?: GameRoom; viewerId?: string; game?: GameSnapshot | null };
    if (!response.ok || !payload.room) throw new Error(payload.error ?? "Impossible de charger la partie.");
    setRoom(payload.room);
    setViewerId(payload.viewerId ?? "");
    setGame(payload.game ?? null);
    setError(null);
  }, [roomId]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        await refresh();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Impossible de charger la partie.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void poll();
    const intervalId = window.setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const alivePlayers = useMemo(() => game?.players.filter((player) => player.alive) ?? [], [game]);
  const viewer = game?.players.find((player) => player.user_id === viewerId);
  const submitAction = async (action: Record<string, unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/private-games/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Action impossible.");
      setSelectedSeat("");
      setSpeech("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible.");
      await refresh().catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const seatOptions = (excludeSelf = false) => alivePlayers
    .filter((player) => !excludeSelf || player.user_id !== viewerId)
    .map((player) => (
      <option key={player.seat} value={player.seat}>
        {player.seat + 1}. {player.pseudo}{player.role ? ` — ${roleLabels[player.role]}` : ""}
      </option>
    ));

  if (loading && !room) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">Chargement de la partie…</main>;
  }
  if (!room) {
    return <main className="min-h-screen bg-slate-950 p-8 text-slate-200">{error ?? "Salon introuvable."}</main>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#111827,_#020617_55%,_#01030a)] px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-300">Partie privée · code {room.code}</p>
            <h1 className="mt-2 text-3xl font-semibold">Table du village</h1>
          </div>
          <Link href="/" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Retour aux salons</Link>
        </header>

        {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>}

        {!game ? (
          <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
            <h2 className="text-xl font-semibold">En attente du lancement</h2>
            <p className="mt-2 text-slate-300">{room.participants.length}/5 joueurs minimum inscrits, 10 maximum. L’administrateur peut lancer dès 5 joueurs.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {room.participants.map((player) => <span key={player.user_id} className="rounded-full bg-slate-800 px-3 py-1 text-sm">{player.pseudo}</span>)}
            </div>
          </section>
        ) : (
          <>
            <section className="mb-6 rounded-2xl border border-violet-500/30 bg-slate-900/80 p-5">
              {game.testMode && (
                <p className="mb-4 rounded-lg border border-sky-500/40 bg-sky-950/30 px-3 py-2 text-sm text-sky-200">
                  Mode test : les IA simulées jouent automatiquement. Cette partie sert à vérifier les actions et les tours.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">Jour {game.day}</p>
                  <h2 className="mt-1 text-xl font-semibold">{phaseLabels[game.phase]}</h2>
                </div>
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-2">
                  <span className="text-xs uppercase tracking-wider text-amber-200">Ton rôle</span>
                  <p className="font-semibold text-white">{roleLabels[game.privateInfo.role]}</p>
                </div>
              </div>
              {game.privateInfo.role === "Seer" && game.privateInfo.seerHistory.length > 0 && (
                <p className="mt-3 text-sm text-violet-200">
                  Tes visions : {game.privateInfo.seerHistory.map((entry) => `${entry.pseudo} (${entry.role})`).join(" · ")}
                </p>
              )}
              {game.privateInfo.wolfAllies.length > 0 && (
                <p className="mt-3 text-sm text-red-200">Tes alliés loups : {game.privateInfo.wolfAllies.join(", ")}</p>
              )}
              {game.phase === "ended" && (
                <p className="mt-4 text-2xl font-bold text-emerald-200">
                  {game.winner === "village" ? "Victoire du village !" : "Victoire des loups !"}
                </p>
              )}
            </section>

            {game.nightResult && (
              <section className="mb-6 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                <h3 className="font-semibold">Résultat de la nuit</h3>
                <p className="mt-1 text-sm text-slate-300">
                  {game.nightResult.deaths.length
                    ? `Joueur(s) éliminé(s) : ${game.nightResult.deaths.map((seat) => game.players.find((player) => player.seat === seat)?.pseudo ?? `Place ${seat + 1}`).join(", ")}`
                    : "Personne n’a été éliminé cette nuit."}
                </p>
              </section>
            )}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
              <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
                <h3 className="mb-4 text-lg font-semibold">Joueurs</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {game.players.map((player) => (
                    <div key={player.user_id} className={`rounded-xl border px-3 py-2 ${player.alive ? "border-slate-700 bg-slate-950/50" : "border-red-900/50 bg-red-950/20 opacity-70"}`}>
                      <p className="font-medium">{player.seat + 1}. {player.pseudo}{player.alive ? "" : " · éliminé"}</p>
                      {player.role && <p className="text-xs text-violet-200">{roleLabels[player.role]}</p>}
                    </div>
                  ))}
                </div>

                <h3 className="mb-3 mt-6 text-lg font-semibold">Débats</h3>
                <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  {game.speeches.length === 0 && <p className="text-sm text-slate-500">Aucune prise de parole pour l’instant.</p>}
                  {game.speeches.map((message, index) => (
                    <article key={`${message.created_at}-${index}`} className="rounded-lg bg-slate-900 px-3 py-2">
                      <p className="text-xs font-semibold text-violet-200">Jour {message.day} · {message.pseudo}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{message.content}</p>
                    </article>
                  ))}
                </div>
              </section>

              <aside className="space-y-5">
                <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
                  <h3 className="text-lg font-semibold">Action</h3>
                  {game.phase === "ended" ? (
                    <p className="mt-3 text-sm text-slate-400">La partie est terminée.</p>
                  ) : viewer && !viewer.alive && !(game.phase === "hunter" && game.privateInfo.role === "Hunter") ? (
                    <p className="mt-3 text-sm text-slate-400">Tu as été éliminé. Tu peux suivre la partie en spectateur.</p>
                  ) : game.privateInfo.hasActed ? (
                    <p className="mt-3 text-sm text-emerald-200">Ton action est enregistrée. En attente des autres joueurs…</p>
                  ) : game.phase === "night_wolf" && (game.privateInfo.role === "Werewolf" || game.privateInfo.role === "WhiteWolfKing") ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-slate-300">Choisis ensemble avec les autres loups qui sera éliminé.</p>
                      <select value={selectedSeat} onChange={(event) => setSelectedSeat(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                        <option value="">Choisir une cible</option>{seatOptions()}
                      </select>
                      <ActionButton disabled={!selectedSeat} busy={submitting} onClick={() => void submitAction({ type: "wolf_vote", targetSeat: Number(selectedSeat) })}>Voter</ActionButton>
                    </div>
                  ) : game.phase === "night_guard" && game.privateInfo.role === "Guard" ? (
                    <TargetAction selectedSeat={selectedSeat} onSelect={setSelectedSeat} options={seatOptions()} busy={submitting} onSubmit={(targetSeat) => void submitAction({ type: "guard", targetSeat })} allowPass />
                  ) : game.phase === "night_witch" && game.privateInfo.role === "Witch" ? (
                    <div className="mt-3 space-y-3">
                      {game.privateInfo.potionStatus?.victimSeat !== null && game.privateInfo.potionStatus?.victimSeat !== undefined && (
                        <p className="text-sm text-amber-200">La cible des loups : {game.players.find((player) => player.seat === game.privateInfo.potionStatus?.victimSeat)?.pseudo}</p>
                      )}
                      <select value={witchChoice} onChange={(event) => setWitchChoice(event.target.value as typeof witchChoice)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                        <option value="pass">Ne pas utiliser de potion</option>
                        {!game.privateInfo.potionStatus?.healUsed && game.privateInfo.potionStatus?.victimSeat !== null && <option value="save">Utiliser la potion de vie</option>}
                        {!game.privateInfo.potionStatus?.poisonUsed && <option value="poison">Utiliser la potion de mort</option>}
                      </select>
                      {witchChoice === "poison" && <select value={selectedSeat} onChange={(event) => setSelectedSeat(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"><option value="">Choisir une cible</option>{seatOptions()}</select>}
                      <ActionButton
                        disabled={witchChoice === "poison" && !selectedSeat}
                        busy={submitting}
                        onClick={() => void submitAction({
                          type: "witch",
                          save: witchChoice === "save",
                          poisonSeat: witchChoice === "poison" && selectedSeat ? Number(selectedSeat) : null,
                        })}
                      >
                        Confirmer
                      </ActionButton>
                    </div>
                  ) : game.phase === "night_seer" && game.privateInfo.role === "Seer" ? (
                    <TargetAction selectedSeat={selectedSeat} onSelect={setSelectedSeat} options={seatOptions(true)} busy={submitting} onSubmit={(targetSeat) => void submitAction({ type: "seer", targetSeat })} />
                  ) : game.phase === "day_speech" && game.speechTurnUserId !== viewerId ? (
                    <p className="mt-3 text-sm text-slate-400">
                      {game.players.find((player) => player.user_id === game.speechTurnUserId)?.pseudo ?? "Un joueur"} parle. Prépare ton tour.
                    </p>
                  ) : game.phase === "day_vote" ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-slate-300">{game.voteCount}/{alivePlayers.length} votes enregistrés.</p>
                      <select value={selectedSeat} onChange={(event) => setSelectedSeat(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                        <option value="">Choisir un joueur</option>{seatOptions(true)}
                      </select>
                      <ActionButton disabled={!selectedSeat} busy={submitting} onClick={() => void submitAction({ type: "vote", targetSeat: Number(selectedSeat) })}>Voter</ActionButton>
                    </div>
                  ) : game.phase === "hunter" && game.privateInfo.role === "Hunter" ? (
                    <TargetAction selectedSeat={selectedSeat} onSelect={setSelectedSeat} options={seatOptions()} busy={submitting} onSubmit={(targetSeat) => void submitAction({ type: "hunter", targetSeat })} allowPass />
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">Aucune action à faire pour ton rôle. Attends que les joueurs concernés agissent.</p>
                  )}

                  {game.phase === "day_speech" && game.speechTurnUserId === viewerId && (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitAction({ type: "speech", content: speech });
                      }}
                    >
                      <textarea value={speech} onChange={(event) => setSpeech(event.target.value)} maxLength={1000} rows={4} placeholder="Écris ton intervention…" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                      <ActionButton disabled={!speech.trim()} busy={submitting}>Envoyer ma parole</ActionButton>
                    </form>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function ActionButton({
  children,
  disabled,
  busy,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  busy: boolean;
  onClick?: () => void;
}) {
  return (
    <button type={onClick ? "button" : "submit"} disabled={disabled || busy} onClick={onClick} className="w-full rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? "Envoi…" : children}
    </button>
  );
}

function TargetAction({
  selectedSeat,
  onSelect,
  options,
  busy,
  onSubmit,
  allowPass = false,
}: {
  selectedSeat: string;
  onSelect: (seat: string) => void;
  options: React.ReactNode;
  busy: boolean;
  onSubmit: (seat: number | null) => void;
  allowPass?: boolean;
}) {
  return (
    <div className="mt-3 space-y-3">
      <select value={selectedSeat} onChange={(event) => onSelect(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
        <option value="">Choisir un joueur{allowPass ? " ou passer" : ""}</option>{options}
      </select>
      <ActionButton disabled={!allowPass && !selectedSeat} busy={busy} onClick={() => onSubmit(selectedSeat ? Number(selectedSeat) : null)}>
        {selectedSeat ? "Confirmer le choix" : "Passer"}
      </ActionButton>
    </div>
  );
}
