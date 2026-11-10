import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
    }

    const { id, disabled } = await req.json();
    if (!id || typeof disabled !== "boolean") {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    if (id === (session.user as any).id) {
      return NextResponse.json({ error: "Vous ne pouvez pas vous désactiver vous-même" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id },
      data: { disabled },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
