import { loginAdmin } from "@/lib/actions/admin";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  return (
    <div className="container" style={{ maxWidth: 380, paddingTop: 80 }}>
      <div className="wordmark" style={{ marginBottom: 28, alignItems: "center", textAlign: "center" }}>
        <span className="rb" style={{ fontSize: 32 }}>RB</span>
        <span className="full">ESTÉTICA — EQUIPO</span>
      </div>
      <form action={loginAdmin} className="card pad">
        <input type="hidden" name="next" value={searchParams.next || "/admin"} />
        <div className="field">
          <label>Email</label>
          <input name="email" type="email" required autoFocus />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input name="password" type="password" required />
        </div>
        {searchParams.error && (
          <div className="error-box" style={{ marginBottom: 16 }}>Email o contraseña incorrectos.</div>
        )}
        <button className="btn btn-primary" type="submit" style={{ width: "100%" }}>
          Ingresar
        </button>
      </form>
    </div>
  );
}
