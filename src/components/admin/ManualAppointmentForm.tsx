"use client";

import { useRef, useTransition } from "react";

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

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      formRef.current?.reset();
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
          <input type="date" name="date" defaultValue={selectedKey} required />
        </div>
        <div className="field">
          <label>Hora</label>
          <input type="time" name="startTime" required />
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
