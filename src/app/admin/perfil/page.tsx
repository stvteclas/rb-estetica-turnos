import { requireAdminPage } from "@/lib/auth-guard";
import { changePassword, getBusinessSettings, updateBusinessSettings } from "@/lib/actions/admin";

const ERRORS: Record<string, string> = {
  actual: "La contraseña actual no es correcta.",
  corta: "La nueva contraseña tiene que tener al menos 4 caracteres.",
  nocoincide: "La confirmación no coincide con la nueva contraseña.",
};

export default async function PerfilPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  requireAdminPage();
  const settings = await getBusinessSettings();

  return (
    <div style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Mi cuenta</h1>

      <div className="card pad">
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Cambiar contraseña</h3>
        <form action={changePassword}>
          <div className="field">
            <label>Contraseña actual</label>
            <input type="password" name="currentPassword" required autoComplete="current-password" />
          </div>
          <div className="field">
            <label>Nueva contraseña</label>
            <input type="password" name="newPassword" required autoComplete="new-password" minLength={4} />
          </div>
          <div className="field">
            <label>Repetir nueva contraseña</label>
            <input type="password" name="confirmPassword" required autoComplete="new-password" minLength={4} />
          </div>

          {searchParams.error && (
            <div className="error-box" style={{ marginBottom: 16 }}>
              {ERRORS[searchParams.error] || "No se pudo cambiar la contraseña."}
            </div>
          )}
          {searchParams.ok && <div className="success-box" style={{ marginBottom: 16 }}>Contraseña actualizada.</div>}

          <button className="btn btn-primary btn-sm" type="submit">Guardar</button>
        </form>
      </div>

      <div className="card pad" style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>Términos y condiciones de la seña</h3>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Este texto se le muestra a la clienta cuando el bot de WhatsApp le pide la seña para confirmar el turno. Lo podés editar cuando quieras, sin depender de un redeploy.
        </div>
        <form action={updateBusinessSettings}>
          <div className="field">
            <textarea name="depositTerms" rows={6} defaultValue={settings.depositTerms || ""} />
          </div>
          <button className="btn btn-primary btn-sm" type="submit">Guardar</button>
        </form>
      </div>
    </div>
  );
}
