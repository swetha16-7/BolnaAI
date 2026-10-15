import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/auth/password";
import { assertSessionConfiguration, setSessionCookie } from "@/lib/server/auth/session";
import { InvalidRequestError, parseJsonRequest } from "@/lib/server/http";

const registerSchema = z.object({
  name: z.string().trim().min(2),
  organizationName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = await parseJsonRequest(request);
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: "Registration data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const { name, organizationName, password } = parsed.data;
    const normalizedEmail = parsed.data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "User already exists." }, { status: 409 });
    }

    assertSessionConfiguration();
    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          name: organizationName ?? `${name.trim()}'s workspace`,
          slug: `org-${randomUUID()}`,
        },
      });

      return transaction.user.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: "ADMIN",
          memberships: {
            create: {
              organizationId: organization.id,
              role: "OWNER",
            },
          },
        },
      });
    });

    await setSessionCookie(user.id);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Registration failed. Check server configuration and try again." }, { status: 500 });
  }
}
