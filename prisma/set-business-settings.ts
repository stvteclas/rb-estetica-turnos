// Carga/actualiza la configuración general del negocio (hoy: términos y
// condiciones de la seña). Seguro de correr más de una vez (upsert por id
// fijo "singleton"). También editable desde el panel: Mi cuenta > Términos y
// condiciones de la seña.
//
// Uso: npm run set-business-settings

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Confirmado con Romina/Pablo (31/08/2026).
const DEPOSIT_TERMS =
  "Una vez reservado el turno tendrás 48 hs para abonar la seña para que el turno quede finalmente confirmado.\n" +
  "1. La seña no tiene devolución, se podrá reprogramar el turno una sola vez en caso de no poder asistir el día pactado.";

async function main() {
  await prisma.businessSettings.upsert({
    where: { id: "singleton" },
    update: { depositTerms: DEPOSIT_TERMS },
    create: { id: "singleton", depositTerms: DEPOSIT_TERMS },
  });
  console.log("Términos y condiciones de la seña actualizados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
