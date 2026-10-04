import type { schema } from "@/lib/db";
import { renderKb } from "@/server/ai/prompts";

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

/**
 * Payload del perfil del agente para un cerebro externo.
 *
 * `enabled` NO viaja: ese flag gobierna la IA in-process de Vocero; el bot
 * externo se pausa por conversación (`aiEnabled` del contexto y los handoffs),
 * no por este endpoint. `resources` nace vacío para que el shape del consumidor
 * no cambie cuando existan recursos alternativos reales.
 */
export function serializeBotProfile(
  profile: AgentProfile,
  kb: KbEntry[],
  /**
   * 200 — Conocimiento DERIVADO (el catálogo de la agenda por recurso): se
   * agrega después de lo que escribió el dueño, con la misma forma que una
   * entrada `block`. No se guarda: se calcula en cada lectura.
   */
  generated: string[] = []
) {
  return {
    profile: {
      name: profile.name,
      tone: profile.tone ?? null,
      instructions: profile.instructions ?? null,
      escalationRules: profile.escalationRules ?? null,
      greeting: profile.greeting ?? null,
    },
    kb: renderKb([...kb, ...generated.map(generatedBlock)]),
    resources: [] as { label: string; url: string }[],
  };
}

/** Un bloque derivado con la forma de una entrada del knowledge base. */
function generatedBlock(content: string, i: number): KbEntry {
  const at = new Date(0);
  return {
    id: `kb_generado_${i}`,
    organizationId: "",
    kind: "block",
    question: null,
    answer: null,
    content,
    createdAt: at,
    updatedAt: at,
  };
}
