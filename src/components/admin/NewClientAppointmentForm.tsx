"use client";

import { useRef, useState, useTransition } from "react";
import { getAvailableDateKeys, getAvailability } from "@/lib/actions/public";
import { formatDateHuman, minutesToTime, todayKeyART } from "@/lib/format";

/** Botón "+ Nuevo turno" en la ficha de la clienta (/admin/clientas/[id]).
 * A diferencia de ManualAppointmentForm (pantalla de Turnos), acá la clienta
 * ya se conoce — no hace falta reescribir nombre/teléfono — así que el
 * formulario es más corto: solo servicio, fecha y hora. Pedido de Romina
 * (02/09/2026): poder darle un turno a la misma clienta para la siguiente
 * fecha directo desde su historial.
 *
 * Actualizado 05/09/2026 (pedido de Romina vía Google Form): fecha y hora
 * ahora se eligen de listas con la disponibilidad real del servicio (mismo
 * criterio que la reserva pública, ver BookingWizard.tsx / getAvailableDateKeys
 * y getAvailability en @/lib/actions/public), en vez de tener que revisar la
 * grilla de Turnos a mano antes de cargar el turno. */
export default function NewClientAppointmentForm({
  action,
  services,
}: {
  action: (formData: FormData) => Promise<void> | void;
  services: { id: string; name: string; duration: number }[];
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const today = todayKeyART();

  const [serviceId, setServiceId] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[] | null>(null);
  const [loadingDates, setLoadingDates] = useState(false);
  const [dateKey, setDateKey] = useState("");
  const [slots, setSlots] = useState<number[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  async function onServiceChange(id: string) {
    setServiceId(id);
    setDateKey("");
    setSlots(null);
    setAvailableDates(null);
    if (!id) return;
    setLoadingDates(true);
    const keys = await getAvailableDateKeys(id);
    setLoadingDates(false);
    setAvailableDates(keys);
  }

  async function onDateChange(key: string) {
    setDateKey(key);
    setSlots(null);
    if (!key || !serviceId) return;
    setLoadingSlots(true);
    const res = await getAvailability(serviceId, key);
    setLoadingSlots(false);
    setSlots(res.ok ? res.slots : []);
  }

  function resetSelection() {
    setServiceId("");
    setDateKey("");
    setSlots(null);
    setAvailableDates(null);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      formRef.current?.reset();
      resetSelection();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)} style={{ marginBottom: 20 }}>
        + Nuevo turno
      </button>
    );
  }

  return (
    <div className="card pad" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ fontSize: 15 }}>Nuevo turno para esta clienta</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); resetSelection(); }}>
          Cancelar
        </button>
      </div>
      <form
        ref={formRef}
        action={handleSubmit}
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}
      >
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Servicio</label>
          <select
            name="serviceId"
            required
            value={serviceId}
            onChange={(e) => onServiceChange(e.target.value)}
          >
            <option value="" disabled>Elegí un servicio…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.duration} min)</option>
            ))}
          </select>
        </div>

        {!manualMode && (
          <>
            <div className="field">
              <label>Fecha (solo se muestran fechas con disponibilidad real)</label>
              <select
                name="date"
                required
                value={dateKey}
                disabled={!serviceId || loadingDates}
                onChange={(e) => onDateChange(e.target.value)}
              >
                <option value="" disabled>
                  {!serviceId ? "Elegí un servicio primero" : loadingDates ? "Buscando fechas disponibles…" : "Elegí una fecha…"}
                </option>
                {availableDates?.map((key) => (
                  <option key={key} value={key}>{formatDateHuman(key)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Hora (solo horarios libres ese día)</label>
              <select
                name="startTime"
                required
                disabled={!dateKey || loadingSlots}
                defaultValue=""
              >
                <option value="" disabled>
                  {!dateKey ? "Elegí una fecha primero" : loadingSlots ? "Buscando horarios…" : "Elegí un horario…"}
                </option>
                {slots?.map((m) => (
                  <option key={m} value={minutesToTime(m)}>{minutesToTime(m)}</option>
                ))}
              </select>
              {!loadingSlots && dateKey && slots?.length === 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  No hay horarios libres ese día para este servicio.
                </p>
              )}
            </div>
          </>
        )}
        {manualMode && (
          <>
            <div className="field">
              <label>Fecha</label>
              <input type="date" name="date" defaultValue={today} required />
            </div>
            <div className="field">
              <label>Hora</label>
              <input type="time" name="startTime" required />
            </div>
          </>
        )}
        <div style={{ gridColumn: "1 / -1", marginTop: -4 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setManualMode((v) => !v)}
          >
            {manualMode ? "Volver a fechas/horarios sugeridos" : "Cargar fecha/hora fuera de lo sugerido"}
          </button>
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Notas</label>
          <textarea name="notes" rows={2} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <button className="btn btn-primary btn-sm" type="submit" disabled={isPending}>
            {isPending ? "Cargando..." : "Confirmar turno"}
          </button>
        </div>
      </form>
    </div>
  );
}
