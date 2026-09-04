"use client";

import { useRef, useState, useTransition } from "react";

export default function OverrideForm({ action }: { action: (formData: FormData) => Promise<void> | void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState("open");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      formRef.current?.reset();
      setType("open");
      if (detailsRef.current) detailsRef.current.open = false;
    });
  }

  return (
    <details ref={detailsRef} className="edit-row card pad" style={{ marginBottom: 24 }}>
      <summary>+ Abrir o cerrar una fecha puntual</summary>
      <form ref={formRef} action={handleSubmit} className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div className="field">
          <label>Fecha</label>
          <input type="date" name="date" required />
        </div>
        <div className="field">
          <label>Qué hacer</label>
          <select name="type" required value={type} onChange={(e) => setType(e.target.value)}>
            <option value="open">Abrir horario extra ese día</option>
            <option value="closed">Cerrar todo el día</option>
          </select>
        </div>
        <div className="field">
          <label>Desde (solo si abre)</label>
          <input type="time" name="startTime" defaultValue="09:00" disabled={type !== "open"} />
        </div>
        <div className="field">
          <label>Hasta (solo si abre)</label>
          <input type="time" name="endTime" defaultValue="19:00" disabled={type !== "open"} />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Motivo (opcional, solo interno)</label>
          <input name="reason" placeholder="Ej: vacaciones, turno extra por demanda" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <button className="btn btn-primary btn-sm" type="submit">
            {isPending ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </details>
  );
}
