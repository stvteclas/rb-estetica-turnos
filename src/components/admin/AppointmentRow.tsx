import { updateAppointment } from "@/lib/actions/admin";
import { minutesToTime, formatMoney, STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { toWhatsAppNumber } from "@/lib/phone";
import Link from "next/link";
import WhatsAppIcon from "@/components/WhatsAppIcon";

export interface AppointmentRowVM {
  id: string;
  startMin: number;
  endMin: number;
  status: string;
  paymentMethod: string | null;
  diagnosis: string | null;
  notes: string | null;
  source: string;
  client: { id: string; name: string; phone: string };
  service: { name: string; price: number };
}

export default function AppointmentRow({ appt }: { appt: AppointmentRowVM }) {
  return (
    <div className="card pad" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            {minutesToTime(appt.startMin)}–{minutesToTime(appt.endMin)} · {appt.service.name}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            <Link href={`/admin/clientas/${appt.client.id}`}>{appt.client.name}</Link>
            {" · "}
            <a href={`https://wa.me/${toWhatsAppNumber(appt.client.phone)}`}>{appt.client.phone}</a>
            {" · "}
            {formatMoney(appt.service.price)}
            {appt.source === "manual" && " · cargado a mano"}
            {appt.paymentMethod && ` · Pago: ${PAYMENT_METHOD_LABELS[appt.paymentMethod] || appt.paymentMethod}`}
          </div>
          {appt.notes && <div className="muted" style={{ marginTop: 4 }}>Nota: {appt.notes}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span className={`pill badge-${appt.status}`}>{STATUS_LABELS[appt.status] || appt.status}</span>
          <a
            href={`https://wa.me/${toWhatsAppNumber(appt.client.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ color: "#25D366" }}
          >
            <WhatsAppIcon /> Abrir chat
          </a>
        </div>
      </div>

      <details className="edit-row" style={{ marginTop: 12 }}>
        <summary>Editar turno</summary>
        <form action={updateAppointment.bind(null, appt.id)} className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
      </details>
    </div>
  );
}
