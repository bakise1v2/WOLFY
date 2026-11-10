"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  Moon,
  Users,
  Play,
  Settings,
  LogOut,
  Shield,
  User,
} from "lucide-react";

export default function HomePage() {
  const { user, loading, isAdmin, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-300">Chargement du village...</div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="w-6 h-6 text-accent" />
            <span className="font-bold text-lg tracking-tight">Jeux Société</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-violet-300 hidden sm:inline">
              {user.displayName}
              {isAdmin && (
                <span className="ml-2 text-xs bg-primary/30 text-accent px-2 py-0.5 rounded-full">
                  Admin
                </span>
              )}
            </span>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg hover:bg-muted text-violet-300 hover:text-white transition-colors"
              title="Déconnexion"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Bienvenue, {user.displayName}
          </h1>
          <p className="text-violet-300/80">
            Le village t&apos;attend sous la lune...
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/salon"
            className="group bg-card border border-border rounded-2xl p-6 hover:border-primary/60 transition-all card-glow hover:scale-[1.02]"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/30 transition-colors">
              <Play className="w-6 h-6 text-accent" />
            </div>
            <h2 className="font-semibold text-lg mb-1">Salon privé</h2>
            <p className="text-sm text-violet-300/70">
              Rejoindre ou créer une partie
            </p>
          </Link>

          <Link
            href="/joueurs"
            className="group bg-card border border-border rounded-2xl p-6 hover:border-primary/60 transition-all card-glow hover:scale-[1.02]"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/30 transition-colors">
              <Users className="w-6 h-6 text-accent" />
            </div>
            <h2 className="font-semibold text-lg mb-1">Joueurs</h2>
            <p className="text-sm text-violet-300/70">
              Voir les membres du groupe
            </p>
          </Link>

          <Link
            href="/profil"
            className="group bg-card border border-border rounded-2xl p-6 hover:border-primary/60 transition-all card-glow hover:scale-[1.02]"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/30 transition-colors">
              <User className="w-6 h-6 text-accent" />
            </div>
            <h2 className="font-semibold text-lg mb-1">Mon profil</h2>
            <p className="text-sm text-violet-300/70">
              Informations de compte
            </p>
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              className="group bg-card border border-primary/40 rounded-2xl p-6 hover:border-primary transition-all card-glow hover:scale-[1.02] sm:col-span-2 lg:col-span-1"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/30 flex items-center justify-center mb-4 group-hover:bg-primary/40 transition-colors">
                <Shield className="w-6 h-6 text-accent" />
              </div>
              <h2 className="font-semibold text-lg mb-1 flex items-center gap-2">
                Administration
                <Settings size={16} className="text-violet-400" />
              </h2>
              <p className="text-sm text-violet-300/70">
                Comptes, parties et contrôles
              </p>
            </Link>
          )}
        </div>

        <div className="mt-12 text-center text-sm text-violet-500/60">
          <p>8 joueurs · 2 administrateurs · Accès strictement privé</p>
        </div>
      </main>
    </div>
  );
}
