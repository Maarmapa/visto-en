import { joinAnd } from "../lib/text.js";

export function buildConsent(page, cfg) {
  const products = joinAnd(page.enriched.products.map((product) => product.name));
  const message = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "{{CREATOR_WHATSAPP_E164}}",
    type: "template",
    template: {
      name: cfg.whatsappTemplateName || "visto_en_aprobacion",
      language: { code: "es" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: page.post.displayName },
            { type: "text", text: `@${page.post.username}` },
            { type: "text", text: products },
            { type: "text", text: page.url },
          ],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [{ type: "payload", payload: `APPROVE:${page.post.id}` }],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "1",
          parameters: [{ type: "payload", payload: `REJECT:${page.post.id}` }],
        },
      ],
    },
  };
  const approved = page.post.consentStatus === "approved";
  return {
    postId: page.post.id,
    username: page.post.username,
    status: approved ? "approved" : "pending",
    sent: false,
    channel: "whatsapp_business_template",
    reason: approved
      ? "Aprobación simulada en el fixture. No se envió WhatsApp."
      : "Pendiente en el fixture. La ficha no entra al índice, al sitemap ni a llms.txt.",
    message,
  };
}

export async function sendConsent(payload, cfg, fetchImpl = fetch) {
  if (cfg.mock) throw new Error("WhatsApp no se envía en modo mock");
  if (!cfg.whatsappToken) throw new Error("falta WHATSAPP_TOKEN");
  if (!cfg.whatsappPhoneNumberId) throw new Error("falta WHATSAPP_PHONE_NUMBER_ID");
  const url = `https://graph.facebook.com/${cfg.graphApiVersion}/${cfg.whatsappPhoneNumberId}/messages`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.whatsappToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload.message),
  });
  if (!response.ok) throw new Error(`WhatsApp respondió ${response.status}`);
  return response.json();
}
