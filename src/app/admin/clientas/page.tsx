import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function ClientasPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  requireAdminPage();
  const q = searchParams.q?.trim() || "";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
        ],
      }
    : undefined;

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { appointments: true } } },
    }),
    prisma.client.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qParam = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 24 }}>Clientas</h1>
        <form method="get" style={{ display: "flex", gap: 8 }}>
          <input name="q" defaultValue={q} placeholder="Buscar por nombre o teléfono" />
          <button className="btn btn-ghost btn-sm" type="submit">Buscar</button>
        </form>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Turnos</th>
              <th>Último diagnóstico</th>
              <th>Origen</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/admin/clientas/${c.id}`}>{c.name}</Link></td>
                <td>{c.phone}</td>
                <td className="muted">{c.email || "—"}</td>
                <td>{c._count.appointments}</td>
                <td className="muted">{c.lastDiagnosis || "—"}</td>
                <td className="muted">{c.source === "tuturno" ? "tuturno" : c.source === "manual" ? "manual" : "online"}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr><td colSpan={6} className="muted">No se encontraron clientas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {total} clientas · página {page}/{totalPages}
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          {page > 1 && (
            <Link href={`/admin/clientas?page=${page - 1}${qParam}`} className="btn btn-ghost btn-sm">
              Anterior
            </Link>
          )}
          {page < totalPages && (
            <Link href={`/admin/clientas?page=${page + 1}${qParam}`} className="btn btn-ghost btn-sm">
              Siguiente
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
