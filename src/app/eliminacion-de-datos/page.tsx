import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Eliminación de datos | Control Chats" };

export default function DataDeletionPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-foreground">
      <Link href="/login" className="text-sm font-semibold text-brand hover:underline">Control Chats</Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">Solicitud de eliminación de datos</h1>
      <div className="mt-8 space-y-6 leading-7 text-text-2">
        <p>El administrador de una organización puede solicitar la eliminación de los datos asociados a su cuenta de Control Chats.</p>
        <ol className="list-decimal space-y-3 pl-6"><li>Inicia sesión y contacta al administrador de tu organización.</li><li>Indica el correo de la cuenta y el nombre de la organización afectados.</li><li>La solicitud se valida para proteger a la organización frente a eliminaciones no autorizadas.</li></ol>
        <p>La eliminación de datos no afecta las obligaciones legales de conservación que puedan corresponder al negocio responsable. Las credenciales de integración se revocan y los datos se eliminan o anonimizan según corresponda.</p>
      </div>
    </main>
  );
}
