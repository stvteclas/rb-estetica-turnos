import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Hash de contraseñas con scrypt (nativo de Node, sin dependencias externas).
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const attempt = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (attempt.length !== stored.length) return false;
  return timingSafeEqual(attempt, stored);
}
