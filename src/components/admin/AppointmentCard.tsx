"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateAppointment, quickUpdateAppointment, registerPayment, deletePayment, createAppointmentForClient, sendManualReminder } from "@/lib/actions/admin";
import { minutesToTime, formatMoney, STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { toWhatsAppNumber } from "@/lib/phone";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import NewClientAppointmentForm from "@/components/admin/NewClientAppointmentForm";

export interface PaymentVM {
  id: string;
  amount: number;
  method: string;
  source: string;
  createdAt: string;
}

export interface AppointmentRowVM {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  status: string;
  paymentMethod: string | null;
  diagnosis: string | null;
  notes: string | null;
  source: string;
  // Pedido de Romina (03/09/2026): distinguir con otro color los turnos que
  // ya tienen la seña pagada (confirmada por el bot), no solo el estado.
  depositStatus: string;
  // Pedido de Romina (04/09/2026): saber si ya se le mandó el recordatorio
  // de 48hs, para mostrar el botón de WhatsApp en dos estados en la grilla.
  reminder48SentAt: string | null;
  client: { id: string; name: string; phone: string };
  service: { name: string; price: number };
  payments: PaymentVM[];
}

const STATUS_OPTIONS = [
  { v: "confirmado", l: "Confirmado" },
  { v: "atendido", l: "Atendido" },
  { v: "ausente", l: "Ausente" },
  { v: "cancelado", l: "Cancelado" },
];

const PAYMENT_OPTIONS = [
  { v: "efectivo", l: "Efectivo" },
  { v: "tarjeta", l: "Tarjeta" },
  { v: "transferencia", l: "Transferencia" },
  { v: "descuento", l: "Descuento" },
];

function ChoiceButton({
  active,
  disabled,
  onClick,
  children,
  danger,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="btn btn-sm"
      style={{
        background: active ? (danger ? "var(--danger)" : "var(--accent)") : "var(--surface-2)",
        color: active ? "#fff" : "var(--text)",
        border: "1px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

function cardBackground(status: string, depositStatus: string): string {
  if (status === "cancelado" || status === "ausente") return "var(--danger-bg)";
  if (status === "atendido") return "var(--success-bg)";
  // Pedido de Romina (03/09/2026): turno confirmado con la seña ya pagada —
  // color propio para identificarlo de un vistazo en la lista del día.
  if (depositStatus === "pagado") return "var(--paid-bg)";
  return "var(--surface)";
}

/** Botón de WhatsApp en la grilla de turnos del día (pedido de Romina,
 * 04/09/2026): manda a demanda, turno por turno, el mismo recordatorio de
 * 48hs que manda el cron automático — pensado como respaldo para cuando el
 * cron (que corre una vez al día) no le llega a algún turno. Verde =
 * todavía no se mandó; gris con puntito verde = ya se mandó (se puede
 * volver a apretar para reenviar). */
function ReminderButton({
  appointmentId,
  clientName,
  sentAt,
}: {
  appointmentId: string;
  clientName: string;
  sentAt: string | null;
}) {
  const [localSentAt, setLocalSentAt] = useState(sentAt);
  const [sending, setSending] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation(); // no abrir el popup del turno al tocar este botón
    if (sending) return;

    const already = localSentAt
      ? `Ya se le mandó el ${new Date(localSentAt).toLocaleString("es-AR")}. `
      : "";
    const ok = window.confirm(`${already}¿Enviar el recordatorio de 48hs a ${clientName} por WhatsApp?`);
    if (!ok) return;

    setSending(true);
    sendManualReminder(appointmentId)
      .then(() => setLocalSentAt(new Date().toISOString()))
      .catch((err) => {
        console.error("No se pudo mandar el recordatorio manual:", err);
        window.alert("No se pudo mandar el recordatorio. Probá de nuevo en un momento.");
      })
      .finally(() => setSending(false));
  }

  const sent = !!localSentAt;
  const title = sent
    ? `Recordatorio de 48hs ya enviado — ${new Date(localSentAt!).toLocaleString("es-AR")}. Click para reenviar.`
    : "Enviar recordatorio de 48hs por WhatsApp";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={sending}
      title={title}
      aria-label={title}
      style={{
        position: "relative",
        width: 32,
        height: 32,
        borderRadius: 9,
        border: sent ? "1px solid var(--border)" : "none",
        background: sent ? "var(--surface)" : "#25D366",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: sending ? "default" : "pointer",
        opacity: sending ? 0.6 : 1,
        boxShadow: sent ? "none" : "0 1px 3px rgba(37,211,102,.4)",
        padding: 0,
      }}
    >
      <WhatsAppIcon size={16} color={sent ? "#9aa39a" : "#fff"} />
      {sent && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: "#25D366",
            border: "2px solid var(--surface)",
          }}
        />
      )}
    </button>
  );
}

export default function AppointmentCard({
  appt,
  services = [],
}: {
  appt: AppointmentRowVM;
  // Pedido de Romina (03/09/2026): poder agendarle el próximo turno a la
  // clienta desde el mismo lugar donde registra lo trabajado en el turno
  // actual, sin tener que ir a la ficha de la clienta aparte.
  services?: { id: string; name: string; duration: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalPagado = appt.payments.reduce((sum, p) => sum + p.amount, 0);

  function close() {
    setOpen(false);
    setEditing(false);
    setRegisteringPayment(false);
  }

  function submitPayment(formData: FormData) {
    startTransition(async () => {
      await registerPayment(appt.id, formData);
      setRegisteringPayment(false);
    });
  }

  function removePayment(paymentId: string) {
    startTransition(async () => {
      await deletePayment(paymentId, appt.id);
    });
  }

  function setStatus(status: string) {
    startTransition(async () => {
      await quickUpdateAppointment(appt.id, { status });
    });
  }

  function togglePayment(method: string) {
    startTransition(async () => {
      await quickUpdateAppointment(appt.id, { paymentMethod: appt.paymentMethod === method ? null : method });
    });
  }

  return (
    <>
      <div
        className="card pad"
        style={{ marginBottom: 12, cursor: "pointer", background: cardBackground(appt.status, appt.depositStatus) }}
        onClick={() => setOpen(true)}
      >
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {minutesToTime(appt.startMin)}–{minutesToTime(appt.endMin)} · {appt.service.name}
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{appt.client.name}</span>
              <span className="muted">
                {" · "}
                {appt.client.phone}
                {" · "}
                {formatMoney(appt.service.price)}
                {appt.source === "manual" && " · cargado a mano"}
                {appt.paymentMethod && ` · Pago: ${PAYMENT_METHOD_LABELS[appt.paymentMethod] || appt.paymentMethod}`}
                {totalPagado > 0 && ` · Cobrado: ${formatMoney(totalPagado)}`}
                {appt.depositStatus === "pagado" && " · Seña pagada"}
              </span>
            </div>
            {appt.notes && <div className="muted" style={{ marginTop: 4 }}>Nota: {appt.notes}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span className={`pill badge-${appt.status}`}>{STATUS_LABELS[appt.status] || appt.status}</span>
            <ReminderButton appointmentId={appt.id} clientName={appt.client.name} sentAt={appt.reminder48SentAt} />
          </div>
        </div>
      </div>

      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(46, 32, 22, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card pad"
            style={{ maxWidth: 440, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 19 }}>{appt.client.name}</h3>
                <div className="muted" style={{ marginTop: 2 }}>
                  {minutesToTime(appt.startMin)}–{minutesToTime(appt.endMin)} · {appt.service.name} · {formatMoney(appt.service.price)}
                </div>
              </div>
              <span className={`pill badge-${appt.status}`}>{STATUS_LABELS[appt.status] || appt.status}</span>
            </div>

            <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
              <Link href={`/admin/clientas/${appt.client.id}`} onClick={close} className="btn-ghost" style={{ fontSize: 13, textDecoration: "underline" }}>
                Ver ficha de la clienta
              </Link>
              <a
                href={`https://wa.me/${toWhatsAppNumber(appt.client.phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#25D366", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <WhatsAppIcon size={15} /> Abrir chat
              </a>
            </div>

            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)", marginBottom: 6 }}>Estado</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUS_OPTIONS.map((o) => (
                  <ChoiceButton
                    key={o.v}
                    active={appt.status === o.v}
                    disabled={isPending}
                    danger={o.v === "cancelado"}
                    onClick={() => setStatus(o.v)}
                  >
                    {o.l}
                  </ChoiceButton>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)", marginBottom: 6 }}>Medio de pago</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PAYMENT_OPTIONS.map((o) => (
                  <ChoiceButton key={o.v} active={appt.paymentMethod === o.v} disabled={isPending} onClick={() => togglePayment(o.v)}>
                    {o.l}
                  </ChoiceButton>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>
                  Pagos registrados{totalPagado > 0 ? ` — cobrado ${formatMoney(totalPagado)}` : ""}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRegisteringPayment((v) => !v)}>
                  {registeringPayment ? "Cancelar" : "+ Registrar pago"}
                </button>
              </div>

              {appt.payments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                  {appt.payments.map((p) => (
                    <div key={p.id} className="muted" style={{ fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>
                        {formatMoney(p.amount)} · {PAYMENT_METHOD_LABELS[p.method] || p.method}
                        {p.source === "bot" && " · seña confirmada por el bot"}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePayment(p.id)}
                        disabled={isPending}
                        style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12 }}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {registeringPayment && (
                <form
                  action={submitPayment}
                  style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", background: "var(--surface-2)", padding: 10, borderRadius: 8 }}
                >
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Método</label>
                    <select name="method" defaultValue="efectivo">
                      {PAYMENT_OPTIONS.map((o) => (
                        <option key={o.v} value={o.v}>{o.l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Monto recibido</label>
                    <input type="number" name="amount" min={1} step={1} required style={{ width: 130 }} />
                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" disabled={isPending}>Guardar</button>
                </form>
              )}
            </div>

            {appt.diagnosis && (
              <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>
                Último diagnóstico: {appt.diagnosis}
              </div>
            )}

            {services.length > 0 && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)", marginBottom: 6 }}>
                  Agendar próximo turno para {appt.client.name}
                </div>
                <NewClientAppointmentForm
                  action={createAppointmentForClient.bind(null, appt.client.id)}
                  services={services}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((e) => !e)}>
                {editing ? "Ocultar edición" : "Editar turno"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={close}>
                Cerrar
              </button>
            </div>

            {editing && (
              <form
                action={updateAppointment.bind(null, appt.id)}
                className="grid"
                style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}
              >
                <div className="field">
                  <label>Estado</label>
                  <select name="status" defaultValue={appt.status}>
                    <option value="confirmado">Confirmado</option>
                    <option value="atendido">Atendido</option>
                    <option value="ausente">Ausente (no vino)</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div className="field">
                  <label>Medio de pago (si atendió)</label>
                  <select name="paymentMethod" defaultValue={appt.paymentMethod || ""}>
                    <option value="">— Sin especificar —</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="descuento">Descuento</option>
                  </select>
                </div>
                <div className="field">
                  <label>Fecha</label>
                  <input type="date" name="date" defaultValue={appt.date} required />
                </div>
                <div className="field">
                  <label>Hora inicio</label>
                  <input type="time" name="startTime" defaultValue={minutesToTime(appt.startMin)} required />
                </div>
                <div className="field">
                  <label>Hora fin</label>
                  <input type="time" name="endTime" defaultValue={minutesToTime(appt.endMin)} required />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Diagnóstico / tratamiento realizado (para el seguimiento de la clienta)</label>
                  <textarea name="diagnosis" rows={2} defaultValue={appt.diagnosis || ""} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <button className="btn btn-primary btn-sm" type="submit">Guardar cambios</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
