import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/auth-guard";
import { createIgnoredNumber, deleteIgnoredNumber } from "@/lib/actions/admin";
import { HUMAN_TAKEOVER_HOURS } from "@/lib/bot/flow";

export const dynamic = "force-dynamic";

export default async function BotPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  requireAdminPage();
  const numeros = await prisma.ignoredNumber.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Bot</h1>
      <p className="muted" style={{ marginBottom: 20, fontSize: 13, maxWidth: 640 }}>
        Configuración del bot de WhatsApp.
      </p>

      <div className="card pad" style={{ marginBottom: 24 }}>
        <strong>Silencio cuando contestás vos a mano</strong>
        <p className="muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
          Si le contestás a una clienta a mano desde el WhatsApp Business, el bot deja de escribirle a esa
          clienta por {HUMAN_TAKEOVER_HOURS} horas. Pasado ese tiempo sin que vuelvas a escribirle vos, el bot
          retoma solo. Esto es automático, no hay nada que cargar acá.
        </p>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Números que el bot ignora</h2>
      <p className="muted" style={{ marginBottom: 20, fontSize: 13, maxWidth: 640 }}>
        Si te escriben desde alguno de estos números, el bot no contesta nada (ni siquiera &quot;hola&quot;)
        — los ignora por completo. Usalo, por ejemplo, para tu otro celular o un proveedor.
      </p>

      {searchParams.ok && (
        <p className="muted" style={{ marginBottom: 16 }}>
          Guardado.
        </p>
      )}
      {searchParams.error === "datos" && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          Poné un número de teléfono.
        </div>
      )}

      {numeros.map((n) => (
        <div
          key={n.id}
          className="card pad"
          style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <div>
            <strong>{n.phone}</strong>
            {n.note && <div className="muted" style={{ fontSize: 13 }}>{n.note}</div>}
          </div>
          <form action={deleteIgnoredNumber.bind(null, n.id)}>
            <button className="btn btn-danger btn-sm" type="submit">
              Sacar de la lista
            </button>
          </form>
        </div>
      ))}

      {numeros.length === 0 && (
        <p className="muted" style={{ marginBottom: 16 }}>
          Todavía no cargaste ningún número.
        </p>
      )}

      <details className="edit-row card pad" open={numeros.length === 0}>
        <summary>+ Agregar número</summary>
        <form action={createIgnoredNumber} className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div className="field">
            <label>Número de teléfono</label>
            <input name="phone" placeholder="Ej. 3511234567" required />
          </div>
          <div className="field">
            <label>Nota (opcional)</label>
            <input name="note" placeholder="Ej. mi otro celular" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              Agregar
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
