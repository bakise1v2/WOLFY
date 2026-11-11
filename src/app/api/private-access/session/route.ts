import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PRIVATE_ACCESS_COOKIE, parseAccessSessionCookieValue } from "@/lib/private-access";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PRIVATE_ACCESS_COOKIE)?.value;
  const session = await parseAccessSessionCookieValue(raw);

  if (!session) {
    return NextResponse.json({ ok: false, session: null }, { status: 401 });
  }

  return NextResponse.json({ ok: true, session });
}
