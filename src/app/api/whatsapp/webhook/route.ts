// Webhook de WhatsApp Cloud API (Meta).
// GET: verificación inicial que hace Meta al dar de alta el webhook (challenge).
// POST: acá llegan los mensajes entrantes de las clientas.

import { NextRequest, NextResponse } from "next/server";
import { handleIncomingMessage, markHumanTakeover } from "@/lib/bot/flow";

// Número del bot de atención de la agencia (bot-atencion-agencia) — nunca es
// una clienta real. Se usa para que este bot no le conteste si el número de
// la agencia le escribe (ej. porque alguien del negocio usó este mismo
// WhatsApp para hablar con el bot de la agencia): sin este filtro, cualquier
// mensaje que la agencia mande a este número se procesa como si fuera de una
// clienta y el bot responde, la agencia lo toma como respuesta del cliente y
// vuelve a preguntar — ida y vuelta infinito entre los dos bots (pasó con
// Romina el 13/09/2026). Configurar en Vercel: AGENCIA_BOT_WHATSAPP_NUMBER.
function esMensajeDelBotDeLaAgencia(from: string | undefined): boolean {
  const agenciaNumero = process.env.AGENCIA_BOT_WHATSAPP_NUMBER;
  return !!agenciaNumero && from === agenciaNumero;
}

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
        if (clientPhone && !esMensajeDelBotDeLaAgencia(clientPhone)) {
          await markHumanTakeover(clientPhone);
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Eventos de "status" (sent/delivered/read/failed) de un mensaje que MANDAMOS
    // nosotros (recordatorios, confirmaciones, etc.) — hasta ahora se ignoraban
    // por completo. Un 200 al mandar el mensaje (ver whatsapp.ts, callGraph) solo
    // confirma que Meta lo ACEPTÓ para enviar, no que le llegó al teléfono — el
    // resultado real (entregado o fallido, con motivo) llega después, acá, de
    // forma asincrónica. Sin loguear esto no hay forma de distinguir "se mandó
    // pero no llegó" de "se mandó y llegó" mirando solo los logs de la request
    // original (mismo problema ya visto en el bot de la agencia).
    //
    // Se loguean todos los status, pero a propósito NO se manda ningún aviso
    // por WhatsApp cuando uno falla (a pedido de Pablo, 16/09/2026) — un
    // intento anterior de avisar por acá generó un loop infinito cuando el
    // propio aviso (mensaje de texto libre, fuera de la ventana de 24hs)
    // también fallaba y volvía a disparar el mismo código. Para revisar
    // entregas fallidas, consultar los logs de Vercel (buscar "FAILED").
    const statuses = value?.statuses;
    if (Array.isArray(statuses) && statuses.length > 0) {
      for (const s of statuses) {
        const info = `wamid=${s.id} to=${s.recipient_id} status=${s.status}`;
        if (s.status === "failed") {
          const errs = Array.isArray(s.errors)
            ? s.errors
                .map((e: any) => `${e.code} ${e.title}${e.error_data?.details ? " - " + e.error_data.details : ""}`)
                .join("; ")
            : "sin detalle";
          console.error(`WhatsApp delivery FAILED: ${info} errors=${errs}`);
        } else {
          console.log(`WhatsApp status update: ${info}`);
        }
      }
      return NextResponse.json({ ok: true });
    }

    const message = value?.messages?.[0];

    if (!message) {
      // Ni mensaje entrante, ni eco, ni status reconocido — se ignora.
      return NextResponse.json({ ok: true });
    }

    const from = message.from as string;

    if (esMensajeDelBotDeLaAgencia(from)) {
      // Nunca contestarle al bot de la agencia — ver comentario arriba.
      console.warn(`Mensaje ignorado (viene del bot de la agencia, no de una clienta real): ${from}`);
      return NextResponse.json({ ok: true });
    }

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
