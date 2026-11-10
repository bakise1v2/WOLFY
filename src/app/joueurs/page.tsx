"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { ArrowLeft, Users, Shield, Loader2 } from "lucide-react";

interface UserRow {
  id: string;
  displayName: string;
  role: string;
  disabled: boolean;
}

export default function JoueursPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setUsers(data.filter((u: UserRow) => !u.disabled));
        }
      });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-400" />
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
          <Users size={20} className="text-accent" />
          <h1 className="font-bold text-lg">Joueurs</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <p className="text-sm text-violet-400 mb-4">
          {users.length} membre{users.length > 1 ? "s" : ""} actif
          {users.length > 1 ? "s" : ""}
        </p>
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between"
            >
              <span className="font-medium">{u.displayName}</span>
              {u.role === "admin" && (
                <span className="text-xs bg-primary/30 text-accent px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Shield size={12} /> Admin
                </span>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
