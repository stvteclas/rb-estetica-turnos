// Convierte el horario viejo de cada servicio (un solo rango para varios
// días: Service.availableDays/startMin/endMin) en filas de ServiceDayHours
// (un horario por día), para que desde el primer momento se vea explícito en
// el panel y quede listo para personalizar por día (ej. lunes solo mañana).
// Seguro de correr más de una vez: no toca servicios que ya tengan alguna
// fila en ServiceDayHours (se asume que ya se editaron con el horario nuevo).
//
// Uso: npm run backfill-day-hours

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const services = await prisma.service.findMany({ include: { dayHours: true } });
  for (const s of services) {
    if (s.dayHours.length > 0) {
      console.log(`Salteado (ya tiene horario por día): ${s.name}`);
      continue;
    }
    if (s.availableDays.length === 0) {
      console.log(`Salteado (sin días asignados): ${s.name}`);
      continue;
    }
    await prisma.serviceDayHours.createMany({
      data: s.availableDays.map((dayOfWeek) => ({
        serviceId: s.id,
        dayOfWeek,
        startMin: s.startMin,
        endMin: s.endMin,
      })),
    });
    console.log(`Migrado: ${s.name} -> ${s.availableDays.length} día(s), mismo horario ${s.startMin}-${s.endMin} en todos`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
