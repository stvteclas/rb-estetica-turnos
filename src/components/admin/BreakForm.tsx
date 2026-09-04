"use client";

import { useRef, useTransition } from "react";

const DOW_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function BreakForm({ action }: { action: (formData: FormData) => Promise<void> | void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      formRef.current?.reset();
      if (detailsRef.current) detailsRef.current.open = false;
    });
  }

  return (
    <details ref={detailsRef} className="edit-row" style={{ marginTop: 12 }}>
      <summary>+ Agregar pausa</summary>
      <form ref={formRef} action={handleSubmit} className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div className="field">
          <label>Nombre (opcional)</label>
          <input name="label" placeholder="Ej: Almuerzo" />
        </div>
        <div />
        <div className="field">
          <label>Desde</label>
          <input type="time" name="startTime" defaultValue="13:00" required />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input type="time" name="endTime" defaultValue="14:00" required />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Días (ninguno tildado = todos los días)</label>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {DOW_LABEL.map((label, d) => (
              <label key={d} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, fontSize: 14 }}>
                <input type="checkbox" name="daysOfWeek" value={d} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <button className="btn btn-primary btn-sm" type="submit">
            {isPending ? "Guardando..." : "Guardar pausa"}
          </button>
        </div>
      </form>
    </details>
  );
}
