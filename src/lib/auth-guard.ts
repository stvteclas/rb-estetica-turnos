import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionToken } from "./session";

/** Devuelve el id del admin logueado, o null si no hay sesión válida. */
export function getAdminSession(): { id: string } | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

/** Para usar al principio de cada página server component de /admin/**
 * (excepto /admin/login): corta con un redirect si no hay sesión válida. */
export function requireAdminPage(): { id: string } {
  const session = getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}
