// Importa el listado de clientas exportado desde tuturno.io (Excel) a la
// base de datos de Turnos RB Estética.
//
// Alcance (decisión del negocio, agosto 2026): SOLO se importa el listado
// de clientas (nombre, teléfono, email, fecha de nacimiento). NO se importa
// el historial turno por turno — eso quedó fuera de esta migración.
//
// Uso:
//   npm run import-tuturno -- "C:\Users\pc-pablo\Downloads\691e6324025e64b75171db74_31-08-2026.xlsx"
//
// Si una clienta ya existe (mismo teléfono normalizado — por ejemplo porque
// ya sacó un turno online), se actualizan sus datos de contacto pero NO se
// pisa su lastDiagnosis ni se toca su source si ya era "online" o "manual".

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { normalizePhone } from "../src/lib/phone";

const prisma = new PrismaClient();

interface TuturnoRow {
  fn?: string;
  ln?: string;
  email?: string;
  phone?: string;
  fecha_nacimiento?: string;
}

function parseBirthDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  // formato de tuturno: DD-MM-YYYY
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npm run import-tuturno -- <ruta al archivo Excel>");
    process.exit(1);
  }

  console.log(`Leyendo ${filePath} ...`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames.includes("Clientes") ? "Clientes" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: TuturnoRow[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

  console.log(`Filas encontradas: ${rows.length}`);

  let creadas = 0;
  let actualizadas = 0;
  let saltadas = 0;

  for (const row of rows) {
    const name = `${row.fn || ""} ${row.ln || ""}`.trim();
    const rawPhone = row.phone ? String(row.phone) : "";
    const phone = normalizePhone(rawPhone);

    if (!phone || phone.length < 8) {
      console.log(`  - Saltada (sin teléfono válido): ${name || "(sin nombre)"}`);
      saltadas++;
      continue;
    }

    const email = row.email && String(row.email).includes("@") && !String(row.email).endsWith("@tuturno.io")
      ? String(row.email).trim()
      : null;
    const birthDate = parseBirthDate(row.fecha_nacimiento);

    const existing = await prisma.client.findUnique({ where: { phone } });

    if (existing) {
      await prisma.client.update({
        where: { phone },
        data: {
          // No pisamos el nombre si ya tiene uno cargado manualmente distinto,
          // pero sí completamos email/fecha de nacimiento si faltaban.
          email: existing.email || email,
          birthDate: existing.birthDate || birthDate,
        },
      });
      actualizadas++;
    } else {
      await prisma.client.create({
        data: {
          name: name || "Sin nombre",
          phone,
          email,
          birthDate,
          source: "tuturno",
        },
      });
      creadas++;
    }
  }

  console.log(`\nListo.`);
  console.log(`  Clientas nuevas creadas: ${creadas}`);
  console.log(`  Clientas ya existentes, actualizadas: ${actualizadas}`);
  console.log(`  Filas saltadas (sin teléfono válido): ${saltadas}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
