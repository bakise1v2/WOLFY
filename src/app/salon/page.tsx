"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { ArrowLeft, Plus, DoorOpen, Users, Loader2 } from "lucide-react";

export default function SalonPage() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg hover:bg-muted text-violet-300">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-bold text-lg">Salon privé</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <section className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <DoorOpen size={18} className="text-accent" />
            Rejoindre avec un code
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="flex-1 px-4 py-2.5 rounded-xl bg-muted border border-border text-white tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
            <button
              onClick={() => setError("Fonctionnalité de partie en cours de finalisation (API).")}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-violet-600 font-medium"
            >
              Entrer
            </button>
          </div>
        </section>

        {isAdmin && (
          <section className="bg-card border border-primary/40 rounded-2xl p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Plus size={18} className="text-accent" />
              Créer une nouvelle partie
            </h2>
            <button
              onClick={() => setError("Fonctionnalité de partie en cours de finalisation (API).")}
              className="w-full py-3 rounded-xl bg-primary hover:bg-violet-600 font-medium flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Créer la partie
            </button>
          </section>
        )}

        {error && (
          <div className="text-sm text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <section>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Users size={18} className="text-accent" />
            Parties en cours / en attente
          </h2>
          <p className="text-violet-400/70 text-sm">
            Le moteur de partie (création, rejoindre, rôles, votes) est en place côté types et sera branché sur les API Prisma dans la prochaine étape.
          </p>
        </section>
      </main>
    </div>
  );
}
