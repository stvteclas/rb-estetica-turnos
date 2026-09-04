import { NextRequest, NextResponse } from "next/server";

// Chequeo rápido de "¿hay cookie de sesión?" para redirigir antes de tocar la
// página. La verificación real (firma + expiración) se hace en el server
// component / route handler con Node crypto, que no corre en el runtime Edge
// de este middleware.
const COOKIE_NAME = "rb_admin_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminApi = pathname.startsWith("/api/admin") && pathname !== "/api/admin/login";
  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";

  if (!isAdminApi && !isAdminPage) return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get(COOKIE_NAME)?.value);
  if (hasCookie) return NextResponse.next();

  if (isAdminApi) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
