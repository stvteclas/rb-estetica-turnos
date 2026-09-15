// Migra el historial de diagnósticos al modelo nuevo Diagnosis (pedido de
// Pablo, 15/09/2026: el diagnóstico no se podía perder ni borrar, y Romina
// necesitaba ver TODO el historial, no solo el último). Antes de este
// cambio había dos lugares con un solo texto que se sobreescribía:
//   - Appointment.diagnosis: el diagnóstico cargado en ESE turno puntual.
//   - Client.lastDiagnosis: se pisaba con el último diagnóstico cargado
//     (desde cualquier turno, o editado a mano en la ficha de la clienta).
//
// Este script:
//   1. Por cada Appointment con diagnosis no vacío, crea una fila Diagnosis
//      ligada a esa clienta y a ese turno (createdAt = fecha del turno).
//   2. Por cada Client con lastDiagnosis no vacío que NO coincide con
//      ningún diagnóstico de turno ya migrado (por ejemplo, uno cargado a
//      mano en la ficha, o importado de tuturno.io), agrega una fila
//      Diagnosis suelta (sin appointmentId), para no perder ese dato.
//
// Seguro de correr más de una vez: no duplica (revisa si ya existe una
// Diagnosis con el mismo clienta+turno, o el mismo clienta+texto suelto,
// antes de crear).
//
// Uso: npm run backfill-diagnosis-history

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const appointments = await prisma.appointment.findMany({
    where: { diagnosis: { not: null } },
    select: { id: true, clientId: true, diagnosis: true, date: true },
  });

  let createdFromAppointments = 0;
  for (const a of appointments) {
    if (!a.diagnosis) continue;
    const already = await prisma.diagnosis.findFirst({
      where: { appointmentId: a.id },
    });
    if (already) continue;
    await prisma.diagnosis.create({
      data: {
        clientId: a.clientId,
        appointmentId: a.id,
        text: a.diagnosis,
        createdAt: a.date,
      },
    });
    createdFromAppointments++;
  }
  console.log(`Migrados ${createdFromAppointments} diagnóstico(s) desde turnos (Appointment.diagnosis).`);

  const clients = await prisma.client.findMany({
    where: { lastDiagnosis: { not: null } },
    select: { id: true, lastDiagnosis: true, createdAt: true },
  });

  let createdFromClients = 0;
  for (const c of clients) {
    if (!c.lastDiagnosis) continue;
    const matchesExisting = await prisma.diagnosis.findFirst({
      where: { clientId: c.id, text: c.lastDiagnosis },
    });
    if (matchesExisting) continue;
    await prisma.diagnosis.create({
      data: {
        clientId: c.id,
        appointmentId: null,
        text: c.lastDiagnosis,
        createdAt: c.createdAt,
      },
    });
    createdFromClients++;
  }
  console.log(`Migrados ${createdFromClients} diagnóstico(s) sueltos desde Client.lastDiagnosis (no venían de ningún turno).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
