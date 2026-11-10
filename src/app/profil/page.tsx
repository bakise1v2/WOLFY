"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { ArrowLeft, User, Mail, Shield } from "lucide-react";

export default function ProfilPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-violet-300">
        Chargement...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg hover:bg-muted text-violet-300">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-bold text-lg">Mon profil</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-card border border-border rounded-2xl p-6 card-glow">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/30 flex items-center justify-center">
              <User size={32} className="text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{user.displayName}</h2>
              <p className="text-sm text-violet-300 flex items-center gap-1">
                {user.role === "admin" ? (
                  <>
                    <Shield size={14} /> Administrateur
                  </>
                ) : (
                  "Joueur"
                )}
              </p>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3 text-violet-200">
              <Mail size={16} className="text-violet-400" />
              {user.email}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
