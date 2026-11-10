import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
    }

    const count = await prisma.user.count();
    if (count >= 10) {
      return NextResponse.json({ error: "Limite de 10 comptes atteinte" }, { status: 400 });
    }

    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const { email: rawEmail, password, displayName, role } =
      body as Record<string, unknown>;
    const email = normalizeEmail(rawEmail);

    if (
      !email ||
      typeof password !== "string" ||
      typeof displayName !== "string" ||
      !displayName.trim() ||
      (role !== "player" && role !== "admin")
    ) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Mot de passe trop court (min 8)" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      return NextResponse.json({ error: "Cet e-mail existe déjà" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName: displayName.trim(),
        role,
      },
    });

    return NextResponse.json({ success: true, id: user.id });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
