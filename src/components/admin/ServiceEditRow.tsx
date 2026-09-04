"use client";

import { useRef, useTransition } from "react";
import ServiceForm, { ServiceFormValues } from "./ServiceForm";

export default function ServiceEditRow({
  action,
  defaults,
}: {
  action: (formData: FormData) => Promise<void> | void;
  defaults: ServiceFormValues;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await action(formData);
      if (detailsRef.current) {
        detailsRef.current.open = false;
      }
    });
  }

  return (
    <details ref={detailsRef} className="edit-row" style={{ marginTop: 12 }}>
      <summary>Editar</summary>
      <div style={{ marginTop: 12 }}>
        <ServiceForm
          action={handleSubmit}
          submitLabel={isPending ? "Guardando..." : "Guardar cambios"}
          showActiveToggle
          defaults={defaults}
        />
      </div>
    </details>
  );
}
