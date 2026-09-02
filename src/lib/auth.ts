import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "./db";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.length >= 32) return secret;

  // Never let a misconfigured deployment sign tokens with a public constant.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      secret
        ? "JWT_SECRET must be at least 32 characters in production"
        : "JWT_SECRET is required in production"
    );
  }

  if (secret) return secret;

  console.warn(
    "[auth] JWT_SECRET is not set - using an insecure development fallback."
  );
  return "fallback-dev-secret-change-me";
}

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret());

const COOKIE_NAME = "travel-planner-token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
};

export type JwtPayload = SessionUser;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: SessionUser): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  const days = parseInt(expiresIn.replace("d", ""), 10) || 7;

  return new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
    },
  });

  return user;
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireVerifiedAuth(): Promise<SessionUser> {
  const session = await requireAuth();
  if (!session.emailVerified) {
    throw new Error("Email not verified");
  }
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (session.role !== Role.ADMIN) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/travel-planner-token=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}

export async function getSessionFromRequest(
  request: Request
): Promise<SessionUser | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
    },
  });

  return user;
}
