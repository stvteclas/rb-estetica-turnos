export const BUSINESS = {
  name: "RB Estética",
  address: "Duarte Quiros 153, Villa Allende, Córdoba",
  whatsapp: "3543 318665",
  whatsappLink: "https://wa.me/5493543318665",
  instagram: "@rb.estetica.va",
  instagramLink: "https://instagram.com/rb.estetica.va",
};

// Seña que pide el bot de WhatsApp para confirmar un turno reservado por chat.
// "amount" es el monto POR DEFECTO — cada servicio puede tener su propio monto
// de seña (Service.depositAmount, editable desde el panel en Servicios), y si
// no lo tiene configurado se usa este valor. El alias es el mismo para todos.
export const DEPOSIT = {
  alias: "rb.estetica.va",
  // Nombre del titular de la cuenta a la que llega la seña — el comprobante
  // a veces muestra el CBU y el nombre en vez del alias, así que el bot
  // también acepta esto como comprobante válido de que es la cuenta correcta.
  accountHolder: "Romina Yael Balquinta",
  amount: 5000,
};
