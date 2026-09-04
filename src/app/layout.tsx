import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turnos — RB Estética",
  description: "Reservá tu turno online en RB Estética, Villa Allende.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
