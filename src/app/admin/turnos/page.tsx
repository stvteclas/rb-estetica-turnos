import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import { dateToKey, formatDateHuman, keyToDate, minutesToTime } from "@/lib/format";
import { getWindowForDate, getAvailableSlots, toBusyIntervals, breaksForDate } from "@/lib/slots";
import AppointmentCard from "@/components/admin/AppointmentCard";
import DateStrip from "@/components/admin/DateStrip";
import { createManualAppointment } from "@/lib/actions/admin";
import ManualAppointmentForm from "@/components/admin/ManualAppointmentForm";

export const dynamic = "force-dynamic";

export default async function TurnosPage({ searchParams }: { searchParams: { date?: string } }) {
  requireAdminPage();

  const todayKey = dateToKey(new Date());
  const selectedKey = searchParams.date || todayKey;
  const selectedDate = keyToDate(selectedKey);

  // Rango visible en la tira de fechas (2 días antes y después de la fecha
  // seleccionada) — lo usamos para marcar con un punto los días que tienen turnos.
  const rangeStart = keyToDate(selectedKey);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 2);
  const rangeEnd = keyToDate(selectedKey);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 3); // exclusivo

  const [appointments, rangeAppointments, services, override, breaks, openDatesToday] = await Promise.all([
    // Pedido de Romina (03/09/2026): los turnos cancelados ya no aparecen acá
    // (solo quedan en el histórico de la clienta, ver /admin/clientas/[id]).
    prisma.appointment.findMany({
      where: { date: selectedDate, status: { not: "cancelado" } },
      include: { client: true, service: true, payments: { orderBy: { createdAt: "asc" } } },
      orderBy: { startMin: "asc" },
    }),
    prisma.appointment.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd }, status: { not: "cancelado" } },
      select: { date: true },
    }),
    prisma.service.findMany({ where: { active: true }, include: { dayHours: true }, orderBy: { name: "asc" } }),
    prisma.dateOverride.findUnique({ where: { date: selectedDate } }),
    prisma.businessBreak.findMany({ where: { active: true } }),
    prisma.serviceOpenDate.findMany({ where: { date: selectedDate } }),
  ]);
  const openDateByService = new Map(openDatesToday.map((o) => [o.serviceId, o]));

  // Disponibilidad del día, servicio por servicio (cada uno puede tener su
  // propio horario), descontando turnos ya tomados y pausas configuradas.
  const busyToday = [...toBusyIntervals(appointments), ...breaksForDate(breaks, selectedDate)];
  const availabilityByService = services
    .map((s) => {
      const window = getWindowForDate(s, selectedDate, override, s.dayHours, openDateByService.get(s.id) || null);
      if (!window) return { service: s, slots: [] as number[], open: false };
      const slots = getAvailableSlots({ window, duration: s.duration, busy: busyToday, date: selectedDate });
      return { service: s, slots, open: true };
    })
    .filter((a) => a.open);

  const countByDate: Record<string, number> = {};
  for (const a of rangeAppointments) {
    const key = dateToKey(a.date);
    countByDate[key] = (countByDate[key] || 0) + 1;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 24 }}>Turnos</h1>
        {selectedKey !== todayKey && (
          <a className="btn btn-ghost btn-sm" href="/admin/turnos">Ir a hoy</a>
        )}
      </div>

      <DateStrip selectedKey={selectedKey} countByDate={countByDate} basePath="/admin/turnos" />

      <ManualAppointmentForm action={createManualAppointment} selectedKey={selectedKey} services={services} />

      <div className="card pad" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Turnos disponibles — {formatDateHuman(selectedKey)}</h3>
        {availabilityByService.length === 0 && (
          <p className="muted">Ningún tratamiento atiende este día.</p>
        )}
        {availabilityByService.map(({ service, slots }) => (
          <div key={service.id} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{service.name}</div>
            {slots.length === 0 ? (
              <span className="muted">Sin horarios libres</span>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {slots.map((m) => (
                  <span
                    key={m}
                    style={{
                      background: "var(--accent-soft, #e8d9c9)",
                      color: "var(--text)",
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 13,
                    }}
                  >
                    {minutesToTime(m)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 15, color: "var(--text-soft)", marginBottom: 10, textTransform: "capitalize" }}>
        {formatDateHuman(selectedKey)}
      </h3>

      {appointments.length === 0 && <p className="muted">No hay turnos para esta fecha.</p>}

      {appointments.map((a) => (
        <AppointmentCard
          key={a.id}
          services={services.map((s) => ({ id: s.id, name: s.name, duration: s.duration }))}
          appt={{
            id: a.id,
            date: dateToKey(a.date),
            startMin: a.startMin,
            endMin: a.endMin,
            status: a.status,
            depositStatus: a.depositStatus,
            // Pedido de Romina (04/09/2026): estado del botón de recordatorio manual.
            reminder48SentAt: a.reminder48SentAt ? a.reminder48SentAt.toISOString() : null,
            paymentMethod: a.paymentMethod,
            diagnosis: a.diagnosis,
            notes: a.notes,
            source: a.source,
            client: { id: a.client.id, name: a.client.name, phone: a.client.phone },
            service: { name: a.service.name, price: a.service.price },
            payments: a.payments.map((p) => ({
              id: p.id,
              amount: p.amount,
              method: p.method,
              source: p.source,
              createdAt: p.createdAt.toISOString(),
            })),
          }}
        />
      ))}
    </div>
  );
}
