import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad | Control Chats",
  description: "Política de privacidad de Control Chats.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-foreground">
      <Link href="/login" className="text-sm font-semibold text-brand hover:underline">
        Control Chats
      </Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">Política de privacidad</h1>
      <p className="mt-2 text-sm text-text-3">Última actualización: 4 de octubre de 2026</p>
      <div className="mt-10 space-y-7 leading-7 text-text-2">
        <section><h2 className="text-lg font-semibold text-foreground">Información que tratamos</h2><p>Control Chats procesa los datos que los negocios conectan para atender conversaciones: información de contacto, mensajes, archivos, citas, notas, etiquetas y configuración de su cuenta de WhatsApp Business.</p></section>
        <section><h2 className="text-lg font-semibold text-foreground">Finalidad</h2><p>Usamos esta información exclusivamente para proveer el CRM, administrar conversaciones, organizar citas y permitir a cada negocio atender a sus clientes. No vendemos datos personales ni realizamos envíos masivos.</p></section>
        <section><h2 className="text-lg font-semibold text-foreground">WhatsApp y Meta</h2><p>Cuando un negocio conecta WhatsApp Business, Control Chats procesa los eventos recibidos desde Meta para mostrar y responder conversaciones autorizadas. Los mensajes salientes respetan las políticas, consentimiento y ventanas de mensajería aplicables de Meta.</p></section>
        <section><h2 className="text-lg font-semibold text-foreground">Seguridad y acceso</h2><p>Los datos se separan por organización. Las credenciales se almacenan cifradas y no se exponen en la interfaz. El acceso se limita a usuarios autorizados por el negocio.</p></section>
        <section><h2 className="text-lg font-semibold text-foreground">Conservación y eliminación</h2><p>Los datos se conservan mientras la cuenta permanezca activa o sea necesario para prestar el servicio. El titular o negocio administrador puede solicitar acceso, corrección o eliminación conforme al procedimiento de eliminación de datos.</p></section>
        <section><h2 className="text-lg font-semibold text-foreground">Contacto</h2><p>Para consultas de privacidad o solicitudes sobre datos, comunícate con el administrador de tu organización en Control Chats.</p></section>
      </div>
      <Link href="/eliminacion-de-datos" className="mt-10 inline-block text-sm font-semibold text-brand hover:underline">Solicitar eliminación de datos →</Link>
    </main>
  );
}
