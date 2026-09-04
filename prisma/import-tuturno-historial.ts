// Importa el HISTORIAL de turnos ya dados (pasados y algunos ya agendados a
// futuro) desde tuturno.io, para las clientas "activas" (con turno reciente
// o próximo). Se generó a partir de las fichas de cada clienta en tuturno.io
// el 31/08/2026 — ver data/tuturno-historial.json.
//
// Requisito: correr primero `npm run import-tuturno` (importa el listado de
// clientas) para que los teléfonos ya existan como Client en la base.
//
// Uso:
//   npm run import-tuturno-historial

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { normalizePhone } from "../src/lib/phone";

const prisma = new PrismaClient();

interface HistorialAppt {
  date: string; // YYYY-MM-DD
  startMin: number;
  endMin: number;
}

async function main() {
  const dataPath = path.join(__dirname, "..", "data", "tuturno-historial.json");
  const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8")) as Record<string, HistorialAppt[]>;

  // Todos los turnos migrados corresponden al servicio "Depilación Definitiva"
  // (la única variante de depilación láser que ofrece RB Estética — en
  // tuturno figuraba como "Depilación Láser").
  const service = await prisma.service.findFirst({ where: { name: "Depilación Definitiva" } });
  if (!service) {
    console.error('No se encontró el servicio "Depilación Definitiva". Corré antes `npm run seed`.');
    process.exit(1);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let creados = 0;
  let yaExistian = 0;
  let sinClienta = 0;

  for (const [rawPhone, appts] of Object.entries(raw)) {
    const phone = normalizePhone(rawPhone);
    const client = await prisma.client.findUnique({ where: { phone } });
    if (!client) {
      console.log(`  - Sin clienta para el teléfono ${phone} (${appts.length} turnos omitidos)`);
      sinClienta += appts.length;
      continue;
    }

    for (const appt of appts) {
      const date = new Date(`${appt.date}T00:00:00.000Z`);
      const existing = await prisma.appointment.findFirst({
        where: { clientId: client.id, date, startMin: appt.startMin },
      });
      if (existing) {
        yaExistian++;
        continue;
      }
      await prisma.appointment.create({
        data: {
          clientId: client.id,
          serviceId: service.id,
          date,
          startMin: appt.startMin,
          endMin: appt.endMin,
          status: date < today ? "atendido" : "confirmado",
          source: "tuturno",
        },
      });
      creados++;
    }
  }

  console.log(`\nListo.`);
  console.log(`  Turnos creados: ${creados}`);
  console.log(`  Turnos que ya existían (no duplicados): ${yaExistian}`);
  console.log(`  Turnos omitidos por no encontrar la clienta: ${sinClienta}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
