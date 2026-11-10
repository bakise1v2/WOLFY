"use client";

import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

export function useAuth() {
  const { data: session, status } = useSession();

  return {
    user: session?.user
      ? {
          id: (session.user as any).id as string,
          email: session.user.email!,
          displayName: session.user.name!,
          role: (session.user as any).role as "player" | "admin",
        }
      : null,
    loading: status === "loading",
    isAdmin: (session?.user as any)?.role === "admin",
    signIn: async (email: string, password: string) => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        throw new Error("E-mail ou mot de passe incorrect.");
      }
    },
    signOut: async () => {
      await signOut({ redirect: false });
    },
  };
}
