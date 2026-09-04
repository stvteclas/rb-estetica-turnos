"use client";

import { useRef, useState, useTransition } from "react";

/** Botón "+ Nuevo turno" en la ficha de la clienta (/admin/clientas/[id]).
 * A diferencia de ManualAppointmentForm (pantalla de Turnos), acá la clienta
 * ya se conoce — no hace falta reescribir nombre/teléfono — así que el
 * formulario es más corto: solo servicio, fecha y hora. Pedido de Romina
 * (02/09/2026): poder darle un turno a la misma clienta para la siguiente
 * fecha directo desde su historial. */
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

  const today = new Date().toISOString().slice(0, 10);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      formRef.current?.reset();
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <form
        ref={formRef}
        action={handleSubmit}
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}
      >
        <div className="field">
          <label>Servicio</label>
          <select name="serviceId" required>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.duration} min)</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Duración (min) — opcional, si no usa la del servicio</label>
          <input type="number" name="duration" min={5} step={5} placeholder="Ej: 45" />
        </div>
        <div className="field">
          <label>Fecha</label>
          <input type="date" name="date" defaultValue={today} required />
        </div>
        <div className="field">
          <label>Hora</label>
          <input type="time" name="startTime" required />
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
