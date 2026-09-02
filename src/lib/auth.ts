import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "./db";

/**
 * Values that ship in .env.example or are obvious stand-ins. Length alone is
 * not enough: the documented placeholder is 46 characters, so a deployment that
 * copied .env.example would otherwise sign tokens with a publicly known secret.
 */
const PLACEHOLDER_SECRET = /your-super-secret|change-me|change-in-production|^secret$|^changeme|fallback-dev-secret|placeholder|example/i;

/**
 * Decide the signing secret. Pure and exported so the rules can be tested
 * directly, rather than by mutating process.env (which bundlers inline).
 */
export function resolveJwtSecret(
  secret: string | undefined,
  nodeEnv: string | undefined
): string {
  const isProduction = nodeEnv === "production";
  const isPlaceholder = !!secret && PLACEHOLDER_SECRET.test(secret);
  const longEnough = !!secret && secret.length >= 32;

  if (secret && longEnough && !isPlaceholder) return secret;

  // Never let a misconfigured deployment sign tokens with a guessable constant.
  if (isProduction) {
    throw new Error(
      !secret
        ? "JWT_SECRET is required in production"
        : isPlaceholder
          ? "JWT_SECRET is still a placeholder value — generate a real random secret for production"
          : "JWT_SECRET must be at least 32 characters in production"
    );
  }

  if (secret) return secret;

  console.warn(
    "[auth] JWT_SECRET is not set - using an insecure development fallback."
  );
  return "fallback-dev-secret-change-me";
}

let cachedSecret: Uint8Array | null = null;

/**
 * Resolve the signing key lazily.
 *
 * Evaluating this at module load broke `next build`: the "Collecting page data"
 * step imports every route with NODE_ENV=production, so a build with no
 * JWT_SECRET in scope threw before any request existed. A build should not
 * require runtime secrets — this defers the check to first actual use, where a
 * misconfigured deployment still fails loudly.
 */
function jwtSecret(): Uint8Array {
  if (!cachedSecret) {
    cachedSecret = new TextEncoder().encode(
      resolveJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV)
    );
  }
  return cachedSecret;
}

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
    .sign(jwtSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
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
