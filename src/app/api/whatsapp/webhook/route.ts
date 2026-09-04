// Webhook de WhatsApp Cloud API (Meta).
// GET: verificación inicial que hace Meta al dar de alta el webhook (challenge).
// POST: acá llegan los mensajes entrantes de las clientas.

import { NextRequest, NextResponse } from "next/server";
import { handleIncomingMessage, markHumanTakeover } from "@/lib/bot/flow";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Verificación fallida", { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // "Coexistencia" de WhatsApp Business: si Romina le contesta a mano a
    // una clienta desde la app (mismo número que el bot), Meta manda un
    // evento separado con field="smb_message_echoes" en vez de "messages".
    // Hay que suscribirse a ese campo en el Dashboard de Meta para que
    // llegue (paso manual de Pablo/Romina, no algo que se configure acá).
    const echoes = value?.message_echoes;
    if (change?.field === "smb_message_echoes" && Array.isArray(echoes)) {
      for (const echo of echoes) {
        const clientPhone = echo?.to as string | undefined;
        if (clientPhone) {
          await markHumanTakeover(clientPhone);
        }
      }
      return NextResponse.json({ ok: true });
    }

    const message = value?.messages?.[0];

    if (!message) {
      // Puede ser un evento de "status" (entregado/leído) en vez de un mensaje nuevo — se ignora.
      return NextResponse.json({ ok: true });
    }

    const from = message.from as string;

    if (message.type === "text") {
      await handleIncomingMessage({ from, text: message.text?.body });
    } else if (message.type === "interactive") {
      const rowId =
        message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || undefined;
      await handleIncomingMessage({ from, interactiveRowId: rowId });
    } else if (message.type === "image") {
      await handleIncomingMessage({
        from,
        imageMediaId: message.image?.id,
        imageMimeType: message.image?.mime_type,
      });
    } else if (message.type === "document") {
      // Muchos bancos (ej. apps de home banking) exportan el comprobante como
      // PDF en vez de foto — WhatsApp lo manda como tipo "document".
      await handleIncomingMessage({
        from,
        imageMediaId: message.document?.id,
        imageMimeType: message.document?.mime_type,
      });
    } else {
      await handleIncomingMessage({ from, text: "" });
    }
  } catch (e) {
    // Nunca devolvemos error a Meta por un fallo nuestro — si no, reintenta el
    // mismo webhook varias veces y puede duplicar mensajes. Lo logueamos y listo.
    console.error("Error procesando mensaje de WhatsApp:", e);
  }

  return NextResponse.json({ ok: true });
}
