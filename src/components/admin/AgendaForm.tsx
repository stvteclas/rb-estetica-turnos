"use client";

import { useTransition } from "react";
import { minutesToTime } from "@/lib/format";

export interface AgendaDateVM {
  dateKey: string;
  label: string;
  enabled: boolean;
  startMin: number;
  endMin: number;
}

export default function AgendaForm({
  action,
  dates,
}: {
  action: (formData: FormData) => Promise<void> | void;
  dates: AgendaDateVM[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
    });
  }

  return (
    <form action={handleSubmit}>
      <div className="card pad">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dates.map((d) => (
            <div key={d.dateKey} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input type="hidden" name="dates" value={d.dateKey} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, fontSize: 14, width: 220, textTransform: "capitalize" }}>
                <input type="checkbox" name={`date_enabled_${d.dateKey}`} defaultChecked={d.enabled} />
                {d.label}
              </label>
              <input type="time" name={`date_start_${d.dateKey}`} defaultValue={minutesToTime(d.startMin)} style={{ width: 130 }} />
              <span className="muted" style={{ fontSize: 13 }}>a</span>
              <input type="time" name={`date_end_${d.dateKey}`} defaultValue={minutesToTime(d.endMin)} style={{ width: 130 }} />
            </div>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={isPending} style={{ marginTop: 16 }}>
          {isPending ? "Guardando..." : "Guardar agenda"}
        </button>
      </div>
    </form>
  );
}
