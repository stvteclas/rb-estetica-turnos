import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "rb_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    throw new Error(
      "Falta la variable de entorno AUTH_SECRET (definila en Vercel → Settings → Environment Variables)."
    );
  }
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function createSessionToken(adminId: string): string {
  const payload = JSON.stringify({ id: adminId, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): { id: string } | null {
  if (!token) return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = sign(b64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as {
      id: string;
      exp: number;
    };
    if (Date.now() > payload.exp) return null;
    return { id: payload.id };
  } catch {
    return null;
  }
}

export { COOKIE_NAME, MAX_AGE_SECONDS };
