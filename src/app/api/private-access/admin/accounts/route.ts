import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getPrivateAccessProfiles,
  PRIVATE_ACCESS_COOKIE,
  parseAccessSessionCookieValue,
  rotatePrivateAccessCode,
  setPrivateAccessActive,
} from "@/lib/private-access";

async function getAdminSession() {
  const cookieStore = await cookies();
  const session = await parseAccessSessionCookieValue(
    cookieStore.get(PRIVATE_ACCESS_COOKIE)?.value
  );
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  }

  try {
    return NextResponse.json({ accounts: await getPrivateAccessProfiles() });
  } catch (error) {
    console.error("[private-access] account list failed", error);
    return NextResponse.json({ error: "Impossible de charger les comptes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      accountId?: unknown;
      action?: unknown;
    };
    if (typeof body.accountId !== "string" || typeof body.action !== "string") {
      return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    if (body.action === "rotate") {
      const code = await rotatePrivateAccessCode(body.accountId);
      return NextResponse.json({ code });
    }

    if (body.action === "revoke" || body.action === "activate") {
      if (body.action === "revoke" && body.accountId === session.userId) {
        return NextResponse.json({ error: "Tu ne peux pas révoquer ta propre session admin" }, { status: 400 });
      }
      await setPrivateAccessActive(body.accountId, body.action === "activate");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec de la gestion du compte";
    if (message === "Compte introuvable" || message.startsWith("Impossible de révoquer")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[private-access] account update failed", error);
    return NextResponse.json({ error: "Impossible de modifier ce compte" }, { status: 500 });
  }
}
