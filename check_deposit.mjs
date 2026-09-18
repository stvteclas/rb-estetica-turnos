import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const services = await prisma.service.findMany({
  select: { id: true, name: true, depositAmount: true },
});
console.log("=== SERVICIOS (depositAmount) ===");
for (const s of services) {
  console.log(`${s.name}: depositAmount=${s.depositAmount === null ? "null (usa default)" : s.depositAmount}`);
}

const recent = await prisma.appointment.findMany({
  orderBy: { createdAt: "desc" },
  take: 15,
  select: {
    id: true,
    createdAt: true,
    depositAmount: true,
    depositStatus: true,
    service: { select: { name: true, depositAmount: true } },
    client: { select: { name: true, phone: true } },
  },
});
console.log("\n=== ULTIMOS 15 TURNOS ===");
for (const a of recent) {
  const mismatch = a.service?.depositAmount != null && Number(a.depositAmount) !== Number(a.service.depositAmount);
  console.log(
    `${a.createdAt.toISOString()} | ${a.client?.name ?? "?"} | servicio="${a.service?.name}" servicioDeposito=${a.service?.depositAmount} | turnoDeposito=${a.depositAmount} | estado=${a.depositStatus}${mismatch ? "  <-- MISMATCH" : ""}`
  );
}

await prisma.$disconnect();
