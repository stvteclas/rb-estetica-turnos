import { requireAdminPage } from "@/lib/auth-guard";
import { createClient } from "@/lib/actions/admin";
import ClientForm from "@/components/admin/ClientForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NuevaClientaPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  requireAdminPage();

  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        <Link href="/admin/clientas" className="muted" style={{ fontSize: 13 }}>
          ← Clientas
        </Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Agregar clienta</h1>
      {searchParams.error === "datos" && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          Faltan nombre o teléfono.
        </div>
      )}
      <div className="card pad">
        <ClientForm action={createClient} submitLabel="Crear clienta" />
      </div>
    </div>
  );
}
