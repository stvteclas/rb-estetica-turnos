export interface ClientFormValues {
  name?: string;
  phone?: string;
  email?: string | null;
  birthDate?: string;
  notes?: string | null;
}

export default function ClientForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  defaults?: ClientFormValues;
  submitLabel: string;
}) {
  const d = defaults || {};
  return (
    <form action={action} className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div className="field">
        <label>Nombre</label>
        <input name="name" defaultValue={d.name} required />
      </div>
      <div className="field">
        <label>Teléfono</label>
        <input name="phone" defaultValue={d.phone} required />
      </div>
      <div className="field">
        <label>Email</label>
        <input type="email" name="email" defaultValue={d.email || ""} />
      </div>
      <div className="field">
        <label>Fecha de nacimiento</label>
        <input type="date" name="birthDate" defaultValue={d.birthDate || ""} />
      </div>
      <div className="field" style={{ gridColumn: "1 / -1" }}>
        <label>Notas generales</label>
        <textarea name="notes" rows={2} defaultValue={d.notes || ""} />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <button className="btn btn-primary btn-sm" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
