"use client";

import { useRef, useState, useTransition } from "react";

export interface DiagnosisVM {
  id: string;
  text: string;
  createdAt: string; // ISO
}

/** Historial de diagnósticos de una clienta — pedido de Pablo (15/09/2026):
 * antes había un solo campo "último diagnóstico" que Romina podía borrar sin
 * querer (vaciando el textarea de la ficha o el de "Editar turno" y
 * guardando). Ahora cada diagnóstico es un registro que se agrega, nunca se
 * edita ni se borra — por eso este componente NO tiene botón de editar ni
 * de quitar, a propósito. Se usa tanto en el popup del turno (mientras
 * Romina atiende, con appointmentId) como en la ficha de la clienta (sin
 * appointmentId). */
export default function DiagnosisHistory({
  action,
  diagnoses,
}: {
  action: (formData: FormData) => Promise<void> | void;
  diagnoses: DiagnosisVM[];
}) {
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      formRef.current?.reset();
      setAdding(false);
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>
          Historial de diagnósticos{diagnoses.length > 0 ? ` (${diagnoses.length})` : ""}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancelar" : "+ Agregar diagnóstico"}
        </button>
      </div>

      {diagnoses.length === 0 && !adding && (
        <p className="muted" style={{ fontSize: 13 }}>Todavía no tiene diagnósticos cargados.</p>
      )}

      {diagnoses.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: adding ? 10 : 0 }}>
          {diagnoses.map((d) => (
            <div
              key={d.id}
              className="muted"
              style={{ fontSize: 13, background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px", whiteSpace: "pre-wrap" }}
            >
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>
                {new Date(d.createdAt).toLocaleString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {d.text}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <form ref={formRef} action={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea name="text" rows={3} required placeholder="Diagnóstico / tratamiento realizado…" autoFocus />
          <div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar diagnóstico"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
