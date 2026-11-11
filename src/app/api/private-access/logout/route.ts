import { NextResponse } from "next/server";
import { PRIVATE_ACCESS_COOKIE } from "@/lib/private-access";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: PRIVATE_ACCESS_COOKIE,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
