import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Composer } from "@/components/inbox/composer";
import type { ConversationDto } from "@/lib/types";

const conversation: ConversationDto = {
  id: "conversation-test", channel: "whatsapp", contact: { id: "contact-test", name: "Test", phone: null },
  stageName: null, aiEnabled: false, handoffAt: null, handoffReason: null,
  lastInboundAt: null, lastMessageAt: null, unreadCount: 0, windowOpen: true,
  windowRemainingMs: 60_000, preview: null, anuncio: null,
};

describe("Composer: approved templates in an open messaging window", () => {
  it("offers a distinct real-template entry before templates have loaded", () => {
    const html = renderToStaticMarkup(createElement(Composer, { conversation, onSend: vi.fn(), onSent: vi.fn() }));
    expect(html).toContain("Enviar plantilla aprobada");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Ventana abierta");
  });
  it("keeps the template sender available with a closed messaging window", () => {
    const html = renderToStaticMarkup(createElement(Composer, { conversation: { ...conversation, windowOpen: false }, onSend: vi.fn(), onSent: vi.fn() }));
    expect(html).toContain("La ventana de 24 horas está cerrada");
    expect(html).toContain("Cargando plantillas");
  });
});
