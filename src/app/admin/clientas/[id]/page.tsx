import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import { updateClient, deleteClient, createAppointmentForClient, addDiagnosis } from "@/lib/actions/admin";
import { dateToKey, formatDateHuman, formatMoney, minutesToTime, STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { toWhatsAppNumber } from "@/lib/phone";
import { notFound } from "next/navigation";
import Link from "next/link";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import ClientForm from "@/components/admin/ClientForm";
import DeleteClientButton from "@/components/admin/DeleteClientButton";
import NewClientAppointmentForm from "@/components/admin/NewClientAppointmentForm";
import DiagnosisHistory from "@/components/admin/DiagnosisHistory";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  existe: "Ese teléfono ya estaba cargado. Esta es la ficha.",
  datos: "Faltan nombre o teléfono.",
  telefono: "Ese teléfono ya lo tiene otra clienta.",
};

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { aviso?: string; error?: string };
}) {
  requireAdminPage();
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      appointments: {
        include: { service: true },
        orderBy: { date: "desc" },
      },
      diagnoses: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) notFound();

  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, duration: true },
  });

  const notice = searchParams.aviso || searchParams.error;

  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        <Link href="/admin/clientas" className="muted" style={{ fontSize: 13 }}>
          ← Clientas
        </Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ fontSize: 24 }}>{client.name}</h1>
        <DeleteClientButton action={deleteClient.bind(null, client.id)} />
      </div>
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

      {notice && AVISOS[notice] && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          {AVISOS[notice]}
        </div>
      )}

      <div className="card pad" style={{ marginBottom: 24 }}>
        <ClientForm
          action={updateClient.bind(null, client.id)}
          submitLabel="Guardar"
          defaults={{
            name: client.name,
            phone: client.phone,
            email: client.email,
            birthDate: client.birthDate ? dateToKey(client.birthDate) : "",
            notes: client.notes,
          }}
        />
      </div>

      <NewClientAppointmentForm action={createAppointmentForClient.bind(null, client.id)} services={services} />

      <div className="card pad" style={{ marginBottom: 24 }}>
        <DiagnosisHistory
          action={addDiagnosis.bind(null, client.id, null)}
          diagnoses={client.diagnoses.map((d) => ({ id: d.id, text: d.text, createdAt: d.createdAt.toISOString() }))}
        />
      </div>

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
