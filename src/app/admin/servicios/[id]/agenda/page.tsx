import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import { updateServiceAgenda } from "@/lib/actions/admin";
import { dateToKey, formatDateHuman, keyToDate } from "@/lib/format";
import AgendaForm, { AgendaDateVM } from "@/components/admin/AgendaForm";

export const dynamic = "force-dynamic";

const WEEKS_AHEAD = 10; // cuánto adelante se puede confirmar agenda (~2 meses y medio)

export default async function ServiceAgendaPage({ params }: { params: { id: string } }) {
  requireAdminPage();

  const service = await prisma.service.findUnique({
    where: { id: params.id },
    include: { dayHours: true, openDates: { orderBy: { date: "asc" } } },
  });
  if (!service) notFound();

  const openByDate = new Map(service.openDates.map((o) => [dateToKey(o.date), o]));

  // Días de la semana que atiende este servicio y su horario por defecto —
  // de ServiceDayHours si ya se cargó, si no del horario viejo (availableDays
  // + un solo rango) por compatibilidad.
  const weekdayDefaults = new Map<number, { startMin: number; endMin: number }>();
  if (service.dayHours.length > 0) {
    for (const d of service.dayHours) weekdayDefaults.set(d.dayOfWeek, { startMin: d.startMin, endMin: d.endMin });
  } else {
    for (const d of service.availableDays) weekdayDefaults.set(d, { startMin: service.startMin, endMin: service.endMin });
  }

  const dates: AgendaDateVM[] = [];
  if (weekdayDefaults.size > 0) {
    const today = keyToDate(dateToKey(new Date()));
    for (let i = 0; i < WEEKS_AHEAD * 7; i++) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
      const weekday = d.getUTCDay();
      const defaults = weekdayDefaults.get(weekday);
      if (!defaults) continue;
      const dateKey = dateToKey(d);
      const existing = openByDate.get(dateKey);
      dates.push({
        dateKey,
        label: formatDateHuman(dateKey),
        enabled: Boolean(existing),
        startMin: existing?.startMin ?? defaults.startMin,
        endMin: existing?.endMin ?? defaults.endMin,
      });
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <a href="/admin/servicios" className="btn-ghost" style={{ fontSize: 13, textDecoration: "underline" }}>
          ← Volver a Servicios
        </a>
      </div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Agenda — {service.name}</h1>

      {!service.requiresDateConfirmation && (
        <div className="card pad" style={{ marginBottom: 20, background: "var(--surface-2)" }}>
          Este servicio todavía NO tiene activada la agenda por fecha — hoy atiende automáticamente todos los días de
          su horario habitual, sin necesitar confirmación. Para poder elegir puntualmente qué fechas atiende (ej. no
          todos los viernes), activá <strong>"Este servicio no atiende todas las semanas"</strong> en Servicios →
          Editar → Agenda. Mientras tanto, lo que confirmes acá abajo no tiene efecto.
        </div>
      )}

      {weekdayDefaults.size === 0 ? (
        <p className="muted">
          Este servicio todavía no tiene ningún día de la semana configurado (Servicios → Editar → "Días y horario en
          que se ofrece"). Configurá primero esos días para que acá aparezcan las fechas a confirmar.
        </p>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 16 }}>
            Tildá las fechas puntuales en que vas a atender este servicio (próximas {WEEKS_AHEAD} semanas). Las que no
            tildes no van a aparecer disponibles para reservar, ni en la web ni en el bot de WhatsApp.
          </p>
          <AgendaForm action={updateServiceAgenda.bind(null, service.id)} dates={dates} />
        </>
      )}
    </div>
  );
}
