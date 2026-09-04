import { minutesToTime } from "@/lib/format";

const DOW = [
  { v: 1, l: "Lun" },
  { v: 2, l: "Mar" },
  { v: 3, l: "Mié" },
  { v: 4, l: "Jue" },
  { v: 5, l: "Vie" },
  { v: 6, l: "Sáb" },
  { v: 0, l: "Dom" },
];

export interface ServiceFormValues {
  name?: string;
  category?: string;
  price?: number;
  packPrice?: number | null;
  packSessions?: number | null;
  duration?: number;
  description?: string | null;
  availableDays?: number[];
  startMin?: number;
  endMin?: number;
  active?: boolean;
  depositAmount?: number | null;
  prepInstructions?: string | null;
  dayHours?: { dayOfWeek: number; startMin: number; endMin: number }[];
  requiresDateConfirmation?: boolean;
}

export default function ServiceForm({
  action,
  defaults,
  submitLabel,
  showActiveToggle,
}: {
  action: (formData: FormData) => void;
  defaults?: ServiceFormValues;
  submitLabel: string;
  showActiveToggle?: boolean;
}) {
  const d = defaults || {};
  const customDayHours = d.dayHours || [];
  // Si el servicio todavía no tiene horario personalizado por día, usamos
  // availableDays/startMin/endMin (el horario viejo, único) como punto de
  // partida para precargar cada día — así al editar por primera vez con el
  // formulario nuevo no aparece todo vacío.
  const legacyDays = new Set(d.availableDays || []);
  function dayDefault(v: number) {
    const custom = customDayHours.find((x) => x.dayOfWeek === v);
    if (custom) return { enabled: true, start: custom.startMin, end: custom.endMin };
    if (customDayHours.length === 0 && legacyDays.has(v)) {
      return { enabled: true, start: d.startMin ?? 840, end: d.endMin ?? 1080 };
    }
    return { enabled: false, start: d.startMin ?? 840, end: d.endMin ?? 1080 };
  }

  return (
    <form action={action} className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div className="field">
        <label>Nombre</label>
        <input name="name" defaultValue={d.name} required />
      </div>
      <div className="field">
        <label>Categoría</label>
        <select name="category" defaultValue={d.category || "facial"}>
          <option value="facial">Facial</option>
          <option value="corporal">Corporal</option>
          <option value="depilacion">Depilación</option>
          <option value="cejas">Cejas</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="field">
        <label>Precio de sesión ($)</label>
        <input type="number" name="price" min={0} defaultValue={d.price} required />
      </div>
      <div className="field">
        <label>Duración (min)</label>
        <input type="number" name="duration" min={5} step={5} defaultValue={d.duration || 30} required />
      </div>

      <div className="field">
        <label>Precio de pack (opcional)</label>
        <input type="number" name="packPrice" min={0} defaultValue={d.packPrice ?? ""} />
      </div>
      <div className="field">
        <label>Sesiones del pack (opcional)</label>
        <input type="number" name="packSessions" min={0} defaultValue={d.packSessions ?? ""} />
      </div>

      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>Descripción</label>
        <textarea name="description" rows={2} defaultValue={d.description || ""} />
      </div>

      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>Días y horario en que se ofrece</label>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Tildá los días en que atiende este servicio y cargá el horario de cada uno — pueden ser distintos entre sí (ej. lunes solo a la mañana, martes solo a la tarde).
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DOW.map((day) => {
            const dd = dayDefault(day.v);
            return (
              <div key={day.v} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, fontSize: 14, width: 70 }}>
                  <input type="checkbox" name={`day_enabled_${day.v}`} defaultChecked={dd.enabled} />
                  {day.l}
                </label>
                <input type="time" name={`day_start_${day.v}`} defaultValue={minutesToTime(dd.start)} style={{ width: 130 }} />
                <span className="muted" style={{ fontSize: 13 }}>a</span>
                <input type="time" name={`day_end_${day.v}`} defaultValue={minutesToTime(dd.end)} style={{ width: 130 }} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="field" style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
        <label style={{ fontWeight: 700 }}>Agenda</label>
        <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
          Activá esto si este servicio NO atiende todas las semanas los días de arriba (ej. Depilación: trabaja viernes y sábados, pero no todos). Con la agenda activada, cada fecha puntual hay que confirmarla desde "Agenda" en la lista de Servicios — si un viernes no se confirma ahí, no aparece disponible para reservar aunque el horario semanal lo incluya.
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
          <input type="checkbox" name="requiresDateConfirmation" defaultChecked={d.requiresDateConfirmation === true} />
          Este servicio no atiende todas las semanas — confirmar fecha por fecha en la Agenda
        </label>
      </div>

      <div className="field" style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
        <label style={{ fontWeight: 700 }}>Seña</label>
        <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
          Monto que el bot de WhatsApp le pide a la clienta para confirmar un turno de este servicio. Dejalo vacío para usar el monto por defecto del negocio.
        </div>
        <input type="number" name="depositAmount" min={0} step={100} placeholder="Monto por defecto" defaultValue={d.depositAmount ?? ""} style={{ maxWidth: 220 }} />
      </div>

      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label style={{ fontWeight: 700 }}>Consejos</label>
        <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
          Indicaciones de preparación/cuidados que el bot le manda a la clienta cuando confirma la seña y en el recordatorio previo al turno.
        </div>
        <textarea name="prepInstructions" rows={4} defaultValue={d.prepInstructions || ""} />
      </div>

      {showActiveToggle && (
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
            <input type="checkbox" name="active" defaultChecked={d.active !== false} />
            Visible para reservar online
          </label>
        </div>
      )}

      <div style={{ gridColumn: "1 / -1" }}>
        <button className="btn btn-primary btn-sm" type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
