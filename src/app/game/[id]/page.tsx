"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function GamePage() {
  const params = useParams();
  const id = params?.id as string;
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/salon"
            className="p-2 rounded-lg hover:bg-muted text-violet-300"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-bold text-lg leading-tight">Partie</h1>
            <p className="text-xs text-violet-400 font-mono">{id}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 text-center">
        <div className="bg-card border border-border rounded-2xl p-8">
          <p className="text-violet-300 mb-2">
            Le moteur de jeu (rôles, phases, votes) est en cours de finalisation.
          </p>
          <p className="text-sm text-violet-500">
            Firebase a été complètement retiré. La partie utilisera Prisma.
          </p>
        </div>
      </main>
    </div>
  );
}
