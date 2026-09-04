import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import { addOverride, removeOverride, addBreak, removeBreak } from "@/lib/actions/admin";
import BreakForm from "@/components/admin/BreakForm";
import OverrideForm from "@/components/admin/OverrideForm";
import { dateToKey, formatDateHuman, minutesToTime, keyToDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const DOW_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default async function HorariosPage() {
  requireAdminPage();

  const overrides = await prisma.dateOverride.findMany({
    where: { date: { gte: keyToDate(dateToKey(new Date())) } },
    orderBy: { date: "asc" },
  });

  const services = await prisma.service.findMany({ where: { active: true }, include: { dayHours: true } });
  const breaks = await prisma.businessBreak.findMany({ orderBy: { startMin: "asc" } });

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Horarios y excepciones</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        El horario habitual de cada tratamiento se configura en <a href="/admin/servicios">Servicios</a>. Acá podés
        abrir una fecha puntual fuera de ese horario (para todos los tratamientos) o cerrar un día completo
        (vacaciones, feriado).
      </p>

      <div className="card pad" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Horario habitual por tratamiento</h3>
        {services.map((s) => (
          <div key={s.id} className="muted" style={{ marginBottom: 6 }}>
            <strong style={{ color: "var(--text)" }}>{s.name}:</strong>{" "}
            {s.dayHours.length === 0
              ? "sin días asignados"
              : s.dayHours
                  .slice()
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map((d) => `${DOW_LABEL[d.dayOfWeek]} ${minutesToTime(d.startMin)}-${minutesToTime(d.endMin)}`)
                  .join(" · ")}
            {s.requiresDateConfirmation && " · requiere confirmar fecha por fecha (ver Agenda en Servicios)"}
          </div>
        ))}
      </div>

      <div className="card pad" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Pausas (ej: almuerzo)</h3>
        <p className="muted" style={{ marginBottom: 12 }}>
          Durante una pausa no se ofrecen turnos, ni en la reserva online ni en el bot de WhatsApp.
        </p>
        {breaks.length === 0 && <p className="muted" style={{ marginBottom: 12 }}>No hay pausas configuradas.</p>}
        {breaks.map((b) => (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <strong>{b.label || "Pausa"}:</strong>{" "}
              {minutesToTime(b.startMin)}–{minutesToTime(b.endMin)}{" "}
              <span className="muted">
                ({b.daysOfWeek.length === 0
                  ? "todos los días"
                  : b.daysOfWeek.slice().sort().map((d) => DOW_LABEL[d]).join(", ")})
              </span>
            </div>
            <form action={removeBreak.bind(null, b.id)}>
              <button className="btn btn-ghost btn-sm" type="submit">Quitar</button>
            </form>
          </div>
        ))}
        <BreakForm action={addBreak} />
      </div>

      <OverrideForm action={addOverride} />

      {overrides.length === 0 && <p className="muted">No hay excepciones cargadas.</p>}
      {overrides.map((o) => {
        const key = dateToKey(o.date);
        return (
          <div key={o.id} className="card pad" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{formatDateHuman(key)}</div>
              <div className="muted">
                {o.type === "closed"
                  ? "Cerrado todo el día"
                  : `Abierto de ${minutesToTime(o.startMin!)} a ${minutesToTime(o.endMin!)} (todos los tratamientos)`}
                {o.reason && ` · ${o.reason}`}
              </div>
            </div>
            <form action={removeOverride.bind(null, o.id)}>
              <button className="btn btn-ghost btn-sm" type="submit">Quitar</button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
