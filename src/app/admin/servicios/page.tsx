import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import { createService, updateService, deleteService } from "@/lib/actions/admin";
import ServiceForm from "@/components/admin/ServiceForm";
import ServiceEditRow from "@/components/admin/ServiceEditRow";
import { CATEGORY_LABELS, formatMoney, minutesToTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const DOW_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function scheduleSummary(dayHours: { dayOfWeek: number; startMin: number; endMin: number }[]): string {
  if (dayHours.length === 0) return "sin días asignados";
  return dayHours
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((d) => `${DOW_LABEL[d.dayOfWeek]} ${minutesToTime(d.startMin)}-${minutesToTime(d.endMin)}`)
    .join(" · ");
}

export default async function ServiciosPage() {
  requireAdminPage();
  const services = await prisma.service.findMany({
    include: { dayHours: true },
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Servicios</h1>

      {services.map((s) => (
        <div key={s.id} className="card pad" style={{ marginBottom: 12, opacity: s.active ? 1 : 0.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div>
              <span className={`pill pill-${s.category}`}>{CATEGORY_LABELS[s.category] || s.category}</span>
              <div style={{ fontWeight: 700, marginTop: 6 }}>{s.name} {!s.active && "(oculto)"}</div>
              <div className="muted">
                {formatMoney(s.price)} · {s.duration} min
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                {scheduleSummary(s.dayHours)}
                {s.requiresDateConfirmation && " · requiere confirmar fecha por fecha (Agenda)"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {s.requiresDateConfirmation && (
                <a href={`/admin/servicios/${s.id}/agenda`} className="btn btn-ghost btn-sm">
                  Agenda
                </a>
              )}
              <form action={deleteService.bind(null, s.id)}>
                <button className="btn btn-danger btn-sm" type="submit">
                  {s.active ? "Eliminar" : "Eliminar definitivamente"}
                </button>
              </form>
            </div>
          </div>
          <ServiceEditRow
            action={updateService.bind(null, s.id)}
            defaults={{
              name: s.name,
              category: s.category,
              price: s.price,
              packPrice: s.packPrice,
              packSessions: s.packSessions,
              duration: s.duration,
              description: s.description,
              availableDays: s.availableDays,
              startMin: s.startMin,
              endMin: s.endMin,
              active: s.active,
              depositAmount: s.depositAmount,
              prepInstructions: s.prepInstructions,
              dayHours: s.dayHours.map((d) => ({ dayOfWeek: d.dayOfWeek, startMin: d.startMin, endMin: d.endMin })),
              requiresDateConfirmation: s.requiresDateConfirmation,
            }}
          />
        </div>
      ))}

      <details className="edit-row card pad">
        <summary>+ Agregar servicio</summary>
        <div style={{ marginTop: 12 }}>
          <ServiceForm action={createService} submitLabel="Crear servicio" />
        </div>
      </details>
    </div>
  );
}
