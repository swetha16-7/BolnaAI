import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/server/validation/schemas";
import { prisma } from "@/lib/server/db";
import { setSessionCookie } from "@/lib/server/auth/session";
import { verifyPassword } from "@/lib/server/auth/password";
import { InvalidRequestError, parseJsonRequest } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const body = await parseJsonRequest(request);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: "Login data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const { password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.trim().toLowerCase() },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    await setSessionCookie(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
