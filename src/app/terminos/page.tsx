import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Términos de uso | Control Chats" };

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-foreground">
      <Link href="/login" className="text-sm font-semibold text-brand hover:underline">Control Chats</Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">Términos de uso</h1>
      <p className="mt-2 text-sm text-text-3">Última actualización: 4 de octubre de 2026</p>
      <div className="mt-10 space-y-7 leading-7 text-text-2">
        <section><h2 className="text-lg font-semibold text-foreground">Servicio</h2><p>Control Chats es una plataforma para gestionar conversaciones de negocio, contactos, citas y procesos de venta. Cada organización es responsable de la información que incorpora y de los usuarios a quienes autoriza acceso.</p></section>
        <section><h2 className="text-lg font-semibold text-foreground">Uso de WhatsApp</h2><p>El uso del canal WhatsApp está sujeto a las políticas de Meta y a la legislación aplicable. Está prohibido utilizar Control Chats para spam, scraping de números o mensajes no autorizados.</p></section>
        <section><h2 className="text-lg font-semibold text-foreground">Cuenta y seguridad</h2><p>El administrador de cada organización debe proteger sus credenciales y gestionar las cuentas de su equipo. Control Chats puede suspender acceso ante uso que comprometa la seguridad, los derechos de terceros o las políticas del canal.</p></section>
        <section><h2 className="text-lg font-semibold text-foreground">Disponibilidad</h2><p>Las integraciones de terceros, incluidos Meta y proveedores de agenda, pueden tener interrupciones ajenas a Control Chats. La plataforma conserva las operaciones core de forma segura cuando una integración falla.</p></section>
      </div>
    </main>
  );
}
