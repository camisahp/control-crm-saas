import { notFound, redirect } from "next/navigation";
import { AgendaClient } from "@/components/settings/agenda-client";
import { CatalogoClient } from "@/components/settings/catalogo-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { VERTICAL } from "@/lib/vertical";
import { tituloCatalogo } from "@/lib/vertical-config";
import { agendaEnabled } from "@/server/agenda/flag";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

export default async function AgendaSettingsPage() {
  // Sin la bandera esta pantalla no existe en esta instancia.
  if (!agendaEnabled()) notFound();
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const branding = await getBranding(session.organizationId);
  return (
    <div className="space-y-10">
      <AgendaClient />
      {/* 200 — "Barberos y servicios": los nombres salen del giro. */}
      <CatalogoClient
        labels={{
          titulo: tituloCatalogo(VERTICAL),
          recurso: VERTICAL.recurso,
          servicio: VERTICAL.servicio,
          seleccion: VERTICAL.seleccion,
        }}
        currency={branding.currency}
      />
    </div>
  );
}
