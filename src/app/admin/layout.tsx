import Link from "next/link";
import { getAdminSession } from "@/lib/auth-guard";
import { logoutAdmin } from "@/lib/actions/admin";

const NAV = [
  { href: "/admin", label: "Hoy" },
  { href: "/admin/turnos", label: "Turnos" },
  { href: "/admin/clientas", label: "Clientas" },
  { href: "/admin/servicios", label: "Servicios" },
  { href: "/admin/horarios", label: "Horarios" },
  { href: "/admin/perfil", label: "Mi cuenta" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = getAdminSession();

  if (!session) {
    // La página (ej. /admin/login) se encarga de pedir credenciales.
    return <>{children}</>;
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/admin" className="wordmark">
            <span className="rb">RB</span>
            <span className="full">ESTÉTICA — EQUIPO</span>
          </Link>
          <form action={logoutAdmin}>
            <button className="btn btn-ghost btn-sm" type="submit">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="container-wide" style={{ paddingTop: 28 }}>
        <nav className="admin-nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </>
  );
}
