// Carga/actualiza las instrucciones de preparación por servicio que usa el bot
// de WhatsApp para el recordatorio de 48hs. Seguro de correr más de una vez
// (busca por nombre y actualiza `prepInstructions`, no duplica nada).
//
// Uso: npm run set-prep-instructions

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Confirmado con Romina/Pablo (31/08/2026). Si algún servicio no necesita
// preparación especial, se deja null y el bot no manda nada para ese caso.
const PREP: Record<string, string | null> = {
  // Texto definitivo pasado por Romina/Pablo (31/08/2026) — reemplaza el
  // borrador anterior. También editable desde el panel: Servicios > Consejos.
  "Depilación Definitiva":
    "IMPORTANTE: No exponerte al sol 48 hs antes y 48 hs posteriores a la depilación.\n" +
    "Indicaciones para asistir al turno:\n" +
    "Debes venir bien rasurada, traer un toallón para retirar el gel y poder secarte y una maquinita de afeitar ese mismo día por las dudas que haya quedado alguna zona sin rasurar bien.\n" +
    "La zona a tratar debe rasurarse el día anterior.\n" +
    "Antes de asistir ducharse y no usar cremas, ni desodorantes en el cuerpo para que no ocluya el poro al momento de pasar el láser.",
  "Radiofrecuencia Facial":
    "Venir con la piel limpia, sin maquillaje. Evitar exposición solar fuerte el día previo al turno.",
  "Limpieza Facial Ultrasónica":
    "Si podés, venir sin maquillaje. Evitar exposición solar fuerte las horas previas al turno.",
  "Limpieza Facial con Extracciones":
    "Si podés, venir sin maquillaje. Evitar exposición solar fuerte las horas previas al turno.",
  "Diseño y Perfilado de Cejas":
    "No depilarte ni retocarte las cejas por tu cuenta antes del turno.",
  "Masaje Piernas Cansadas": null,
  "Masaje Relajante (Espalda, Cuello y Facial)": null,
};

async function main() {
  for (const [name, prepInstructions] of Object.entries(PREP)) {
    const service = await prisma.service.findFirst({ where: { name } });
    if (!service) {
      console.log(`Servicio no encontrado (se saltea): ${name}`);
      continue;
    }
    await prisma.service.update({ where: { id: service.id }, data: { prepInstructions } });
    console.log(`Actualizado: ${name} -> ${prepInstructions ? "con preparación" : "sin preparación especial"}`);
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
