import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPrivateAccessProfiles, PRIVATE_ACCESS_COOKIE, parseAccessSessionCookieValue } from "@/lib/private-access";
import { AdminAccessManager } from "@/components/game/AdminAccessManager";
import { AdminPrivateGames } from "@/components/game/PrivateGames";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PRIVATE_ACCESS_COOKIE)?.value;
  const session = await parseAccessSessionCookieValue(raw);

  if (!session || session.role !== "admin") {
    redirect("/");
  }

  const profiles = await getPrivateAccessProfiles();
  const admins = profiles.filter((profile) => profile.role === "admin");
  const players = profiles.filter((profile) => profile.role === "player");
  const reserves = profiles.filter((profile) => profile.role === "reserve");

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-violet-300">Private Board</p>
            <h1 className="mt-2 text-3xl font-semibold">Panneau d’administration</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Retour au jeu
            </Link>
            <div className="rounded-full border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-sm text-violet-200">
              {session.name}
            </div>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Administrateurs</div>
            <div className="mt-3 text-3xl font-bold text-amber-300">{admins.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Joueurs</div>
            <div className="mt-3 text-3xl font-bold text-sky-300">{players.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Codes de secours</div>
            <div className="mt-3 text-3xl font-bold text-emerald-300">{reserves.length}</div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
            <h2 className="mb-4 text-xl font-semibold">Comptes actifs</h2>
            <div className="space-y-3">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2">
                  <div>
                    <div className="font-medium text-white">{profile.label}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{profile.role}</div>
                  </div>
                  <span className="rounded-full border border-slate-600 px-2 py-1 text-xs text-slate-300">
                    {profile.role === "admin" ? "Admin" : profile.role === "reserve" ? "Secours" : "Joueur"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5">
            <h2 className="mb-4 text-xl font-semibold">Sécurité</h2>
            <ul className="space-y-3 text-sm text-slate-300">
              <li>• Vérification serveur avant accès au salon.</li>
              <li>• Maximum 10 comptes principaux et 2 codes de secours.</li>
              <li>• Les codes sont stockés sous forme de condensat SHA-256.</li>
              <li>• Les rôles secrets et cartes restent côté serveur.</li>
              <li>• Le panneau est réservé aux comptes administrateurs.</li>
            </ul>
          </section>
        </div>

        <div className="mt-6">
          <AdminPrivateGames />
        </div>

        <div className="mt-6">
          <AdminAccessManager />
        </div>

        <section className="mt-6 rounded-2xl border border-amber-700/50 bg-amber-950/20 p-5">
          <h2 className="text-lg font-semibold text-amber-200">Limites actuelles</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Les parties privées démarrent avec 5 à 10 membres, administrateurs compris. Les salons et leur état sont stockés sur cette instance locale en développement; une base Supabase est nécessaire pour les partager en production.
          </p>
        </section>
      </div>
    </main>
  );
}
