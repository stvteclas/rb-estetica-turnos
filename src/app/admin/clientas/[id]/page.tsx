import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import { updateClient, createAppointmentForClient } from "@/lib/actions/admin";
import { dateToKey, formatDateHuman, formatMoney, minutesToTime, STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { toWhatsAppNumber } from "@/lib/phone";
import { notFound } from "next/navigation";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import NewClientAppointmentForm from "@/components/admin/NewClientAppointmentForm";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  requireAdminPage();
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      appointments: {
        include: { service: true },
        orderBy: { date: "desc" },
      },
    },
  });
  if (!client) notFound();

  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, duration: true },
  });

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{client.name}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        <a
          href={`https://wa.me/${toWhatsAppNumber(client.phone)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#25D366", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <WhatsAppIcon size={18} /> Abrir chat de WhatsApp
        </a>
      </p>

      <div className="card pad" style={{ marginBottom: 24 }}>
        <form action={updateClient.bind(null, client.id)} className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label>Nombre</label>
            <input name="name" defaultValue={client.name} required />
          </div>
          <div className="field">
            <label>Teléfono</label>
            <input name="phone" defaultValue={client.phone} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" name="email" defaultValue={client.email || ""} />
          </div>
          <div className="field">
            <label>Fecha de nacimiento</label>
            <input type="date" name="birthDate" defaultValue={client.birthDate ? dateToKey(client.birthDate) : ""} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Último diagnóstico</label>
            <textarea name="lastDiagnosis" rows={2} defaultValue={client.lastDiagnosis || ""} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Notas generales</label>
            <textarea name="notes" rows={2} defaultValue={client.notes || ""} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary btn-sm" type="submit">Guardar</button>
          </div>
        </form>
      </div>

      <NewClientAppointmentForm action={createAppointmentForClient.bind(null, client.id)} services={services} />

      <h3 style={{ fontSize: 16, marginBottom: 12 }}>Historial de tratamientos</h3>
      {client.appointments.length === 0 && <p className="muted">Todavía no tiene turnos registrados.</p>}
      {client.appointments.map((a) => (
        <div key={a.id} className="card pad" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <strong style={{ textTransform: "capitalize" }}>{formatDateHuman(dateToKey(a.date))}</strong>
              {" · "}
              {minutesToTime(a.startMin)} · {a.service.name} · {formatMoney(a.service.price)}
            </div>
            <span className={`pill badge-${a.status}`}>{STATUS_LABELS[a.status] || a.status}</span>
          </div>
          {a.diagnosis && <p className="muted" style={{ marginTop: 6 }}>Diagnóstico/tratamiento: {a.diagnosis}</p>}
          {a.paymentMethod && (
            <p className="muted" style={{ marginTop: 6 }}>
              Pago: {PAYMENT_METHOD_LABELS[a.paymentMethod] || a.paymentMethod}
            </p>
          )}
          {a.notes && <p className="muted" style={{ marginTop: 6 }}>Nota de la reserva: {a.notes}</p>}
        </div>
      ))}
    </div>
  );
}
