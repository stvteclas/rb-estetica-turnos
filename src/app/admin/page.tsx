import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import { dateToKey, formatDateHuman, keyToDate } from "@/lib/format";
import AppointmentCard from "@/components/admin/AppointmentCard";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  requireAdminPage();

  const todayKey = dateToKey(new Date());
  const today = keyToDate(todayKey);

  const [appointments, services] = await Promise.all([
    // Pedido de Romina (03/09/2026): los turnos cancelados ya no aparecen acá
    // (solo quedan en el histórico de la clienta, ver /admin/clientas/[id]).
    prisma.appointment.findMany({
      where: { date: today, status: { not: "cancelado" } },
      include: { client: true, service: true, payments: { orderBy: { createdAt: "asc" } } },
      orderBy: { startMin: "asc" },
    }),
    // Pedido de Romina (03/09/2026): agendar el próximo turno de la clienta
    // desde el mismo popup donde registra lo trabajado hoy — hace falta la
    // lista de servicios acá también, no solo en /admin/turnos.
    prisma.service.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, duration: true } }),
  ]);

  const confirmadas = appointments.filter((a) => a.status !== "cancelado");

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Turnos de hoy</h1>
      <p className="muted" style={{ marginBottom: 20 }}>{formatDateHuman(todayKey)} · {confirmadas.length} turno(s)</p>

      {appointments.length === 0 && <p className="muted">No hay turnos cargados para hoy.</p>}
      {appointments.map((a) => (
        <AppointmentCard
          key={a.id}
          services={services}
          appt={{
            id: a.id,
            date: dateToKey(a.date),
            startMin: a.startMin,
            endMin: a.endMin,
            status: a.status,
            depositStatus: a.depositStatus,
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
