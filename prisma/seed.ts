import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

// Horarios: lunes a viernes 14–18 para faciales/corporales/cejas,
// viernes y sábado 9–19 para depilación (guía de marca RB Estética).
const SERVICES = [
  {
    name: "Radiofrecuencia Facial",
    category: "facial",
    price: 35000,
    packPrice: 190000,
    packSessions: 8,
    duration: 45,
    description: "Estimula colágeno, tensa la piel — efecto lifting sin cirugía.",
    availableDays: [1, 2, 3, 4, 5],
    startMin: 14 * 60,
    endMin: 18 * 60,
  },
  {
    name: "Limpieza Facial Ultrasónica",
    category: "facial",
    price: 30000,
    duration: 45,
    description: "Espátula ultrasónica y alta frecuencia — exfoliación suave.",
    availableDays: [1, 2, 3, 4, 5],
    startMin: 14 * 60,
    endMin: 18 * 60,
  },
  {
    name: "Limpieza Facial con Extracciones",
    category: "facial",
    price: 35000,
    duration: 60,
    description: "Extracciones profesionales y alta frecuencia germicida.",
    availableDays: [1, 2, 3, 4, 5],
    startMin: 14 * 60,
    endMin: 18 * 60,
  },
  {
    name: "Masaje Piernas Cansadas",
    category: "corporal",
    price: 25000,
    duration: 30,
    description: "Activa la circulación, alivia la pesadez.",
    availableDays: [1, 2, 3, 4, 5],
    startMin: 14 * 60,
    endMin: 18 * 60,
  },
  {
    name: "Masaje Relajante (Espalda, Cuello y Facial)",
    category: "corporal",
    price: 30000,
    duration: 60,
    description: "Libera tensión de pies a cabeza.",
    availableDays: [1, 2, 3, 4, 5],
    startMin: 14 * 60,
    endMin: 18 * 60,
  },
  {
    name: "Depilación Definitiva",
    category: "depilacion",
    price: 32000,
    duration: 30,
    description: "Reducción progresiva y duradera — tecnología segura.",
    availableDays: [5, 6],
    startMin: 9 * 60,
    endMin: 19 * 60,
  },
  {
    name: "Diseño y Perfilado de Cejas",
    category: "cejas",
    price: 18000,
    duration: 20,
    description: "Look prolijo y natural, a medida de tu rostro.",
    availableDays: [1, 2, 3, 4, 5],
    startMin: 14 * 60,
    endMin: 18 * 60,
  },
];

async function main() {
  for (const s of SERVICES) {
    const existing = await prisma.service.findFirst({ where: { name: s.name } });
    if (!existing) {
      await prisma.service.create({ data: s });
      console.log(`Servicio creado: ${s.name}`);
    }
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Romina";

  if (email && password) {
    const existingAdmin = await prisma.adminUser.findUnique({ where: { email } });
    if (!existingAdmin) {
      const { hash, salt } = hashPassword(password);
      await prisma.adminUser.create({
        data: { email: email.toLowerCase(), passwordHash: hash, passwordSalt: salt, name },
      });
      console.log(`Usuario admin creado: ${email}`);
    } else if (process.env.RESET_ADMIN_PASSWORD === "true") {
      // Por defecto NO tocamos la contraseña de un admin que ya existe —
      // así, si Romina la cambió desde "Mi cuenta" en la app, un redeploy
      // (que corre `npm run seed`) no se la pisa. Para resetearla a mano,
      // agregar RESET_ADMIN_PASSWORD=true en el .env antes de correr el seed
      // (y sacarlo después, para no dejarlo pisando la contraseña siempre).
      const { hash, salt } = hashPassword(password);
      await prisma.adminUser.update({
        where: { email },
        data: { passwordHash: hash, passwordSalt: salt, name },
      });
      console.log(`Ya existía un admin con ese email (${email}) — contraseña reseteada (RESET_ADMIN_PASSWORD=true).`);
    } else {
      console.log(`Ya existía un admin con ese email (${email}) — no se tocó la contraseña.`);
    }
  } else {
    console.log(
      "No se definieron ADMIN_EMAIL / ADMIN_PASSWORD — no se creó ningún usuario de acceso al panel."
    );
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
