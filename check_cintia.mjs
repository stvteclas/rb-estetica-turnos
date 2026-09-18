import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const phone = "3543608985";

const client = await prisma.client.findUnique({
  where: { phone },
  include: { appointments: { include: { payments: true, service: true }, orderBy: { createdAt: "desc" } } },
});

const conv = await prisma.botConversation.findUnique({ where: { phone } });

console.log("=== CLIENT ===");
console.log(JSON.stringify(client, null, 2));

console.log("=== BOT CONVERSATION ===");
console.log(JSON.stringify(conv, null, 2));

await prisma.$disconnect();
