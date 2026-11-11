import { NextResponse } from "next/server";
import { PRIVATE_ACCESS_COOKIE, verifyPrivateAccessCode, getAccessSessionCookieValue } from "@/lib/private-access";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: unknown; pseudo?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const pseudo = typeof body?.pseudo === "string" ? body.pseudo.trim() : "";

    if (!code) {
      return NextResponse.json({ error: "Code requis" }, { status: 400 });
    }
    if (pseudo.length < 2 || pseudo.length > 24 || /[\u0000-\u001f\u007f]/u.test(pseudo)) {
      return NextResponse.json({ error: "Le pseudo doit contenir entre 2 et 24 caractères." }, { status: 400 });
    }

    const session = await verifyPrivateAccessCode(code, pseudo);
    if (!session) {
      return NextResponse.json({ error: "Code invalide" }, { status: 401 });
    }

    const response = NextResponse.json({
      ok: true,
      session,
      message: session.role === "admin" ? "Accès administrateur" : session.role === "reserve" ? "Accès de secours" : "Accès joueur",
    });

    response.cookies.set({
      name: PRIVATE_ACCESS_COOKIE,
      value: await getAccessSessionCookieValue(session),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 12 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("[private-access] verification failed", error);
    return NextResponse.json({ error: "Vérification impossible" }, { status: 500 });
  }
}
