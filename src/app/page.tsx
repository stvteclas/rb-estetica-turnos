import { prisma } from "@/lib/prisma";
import BookingWizard from "@/components/BookingWizard";
import { BUSINESS } from "@/lib/business";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="wordmark">
            <span className="rb">RB</span>
            <span className="full">ESTÉTICA</span>
          </div>
          <Link href="/admin" className="btn btn-ghost btn-sm">
            Equipo
          </Link>
        </div>
      </header>

      <main className="container" style={{ paddingTop: 32 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 30 }}>Reservá tu turno</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            {BUSINESS.address} · WhatsApp {BUSINESS.whatsapp}
          </p>
        </div>

        <BookingWizard
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            category: s.category,
            price: s.price,
            packPrice: s.packPrice,
            packSessions: s.packSessions,
            duration: s.duration,
            description: s.description,
          }))}
        />
      </main>
    </>
  );
}
