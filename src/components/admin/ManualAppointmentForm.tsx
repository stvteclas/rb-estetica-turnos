"use client";

import { useRef, useState, useTransition } from "react";
import { getAvailableDateKeys, getAvailability } from "@/lib/actions/public";
import { formatDateHuman, minutesToTime } from "@/lib/format";

export default function ManualAppointmentForm({
  action,
  selectedKey,
  services,
}: {
  action: (formData: FormData) => Promise<void> | void;
  selectedKey: string;
  services: { id: string; name: string; duration: number }[];
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  // Pedido de Romina (Google Form, 05/09/2026): que le figuren las fechas y
  // horarios disponibles al cargar un turno, en vez de tener que revisar la
  // grilla a mano. Reusa getAvailableDateKeys/getAvailability (ya existían
  // para la reserva pública, ver BookingWizard.tsx) — mismo criterio de
  // disponibilidad (horario del servicio, Agenda de fechas puntuales,
  // turnos ya tomados).
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

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      formRef.current?.reset();
      setServiceId("");
      setDateKey("");
      setSlots(null);
      setAvailableDates(null);
      if (detailsRef.current) {
        detailsRef.current.open = false;
      }
    });
  }

  return (
    <details ref={detailsRef} className="edit-row card pad" style={{ marginBottom: 24 }}>
      <summary>+ Cargar turno manual</summary>
      <form
        ref={formRef}
        action={handleSubmit}
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}
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
              <input type="date" name="date" defaultValue={selectedKey} required />
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

        <div className="field">
          <label>Nombre de la clienta</label>
          <input name="name" required />
        </div>
        <div className="field">
          <label>Teléfono</label>
          <input name="phone" required />
        </div>
        <div className="field">
          <label>Email (opcional)</label>
          <input type="email" name="email" />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Notas</label>
          <textarea name="notes" rows={2} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <button className="btn btn-primary btn-sm" type="submit">
            {isPending ? "Cargando..." : "Cargar turno"}
          </button>
        </div>
      </form>
    </details>
  );
}
