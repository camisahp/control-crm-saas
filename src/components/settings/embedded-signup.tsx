"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseEmbeddedSignupEvent } from "@/lib/meta/embedded-signup-event";

declare global {
  interface Window { FB?: { init(opts: object): void; login(cb: (r: unknown) => void, opts: object): void } }
}

type Config = { configured: boolean; appId?: string; configId?: string; graphVersion?: string; reviewConfigured?: boolean; organizationSlug?: string; reviewOrganizationMatches?: boolean };

export function EmbeddedSignup() {
  const [config, setConfig] = useState<Config | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectionRef = useRef<{ wabaId: string; phoneNumberId: string } | null>(null);
  const pendingCodeRef = useRef<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reviewConnecting, setReviewConnecting] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/whatsapp/embedded-config")
      .then((r) => r.json() as Promise<Config>)
      .then(setConfig)
      .catch(() => setConfig({ configured: false }));
  }, []);

  useEffect(() => {
    if (!config?.configured || !config.appId || !config.graphVersion) return;
    const ready = () => {
      window.FB?.init({ appId: config.appId, version: config.graphVersion, xfbml: false, cookie: false, fedCM: false });
      setSdkReady(true);
    };
    if (window.FB) return ready();
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/es_LA/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = ready;
    script.onerror = () => setMessage("No se pudo cargar el SDK de Meta. Revisa el bloqueador de anuncios.");
    document.body.appendChild(script);
    return () => script.remove();
  }, [config]);

  useEffect(() => {
    function receive(event: MessageEvent<unknown>) {
      const selected = parseEmbeddedSignupEvent(event.origin, event.data);
      if (!selected) return;
      selectionRef.current = selected;
      setMessage("Meta devolvió la cuenta y el número. Terminando la conexión segura…");
      const code = pendingCodeRef.current;
      if (code) void complete(code, selected);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  async function complete(code: string, picked: { wabaId: string; phoneNumberId: string }) {
    pendingCodeRef.current = null;
    setConnecting(true);
    const response = await fetch("/api/settings/whatsapp/embedded", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, ...picked }),
    }).catch(() => null);
    setConnecting(false);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null) as { error?: { message?: string } } | null;
      setMessage(data?.error?.message ?? "No se pudo completar la conexión con Meta.");
      return;
    }
    const data = await response.json() as { displayPhoneNumber: string };
    setMessage(`Número conectado: ${data.displayPhoneNumber}. Ya puedes crear una plantilla y enviar una prueba.`);
    window.location.reload();
  }

  function openPopup() {
    // Debe ser directo en el click: un await aquí hace que el navegador bloquee el popup.
    if (!window.FB || !config?.configId) return;
    selectionRef.current = null;
    pendingCodeRef.current = null;
    setMessage(null);
    window.FB.login((response: unknown) => {
      const code = (response as { authResponse?: { code?: string } })?.authResponse?.code;
      if (!code) {
        setMessage("El popup se cerró o Meta no autorizó el intento.");
        return;
      }
      pendingCodeRef.current = code;
      const picked = selectionRef.current;
      if (!picked) {
        setMessage("Meta autorizó. Esperando que Meta devuelva la cuenta y el número seleccionado…");
        return;
      }
      void complete(code, picked);
    }, { config_id: config.configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } });
  }

  async function connectReview() {
    setReviewConnecting(true);
    setMessage(null);
    const response = await fetch("/api/settings/whatsapp/review-connect", { method: "POST" }).catch(() => null);
    setReviewConnecting(false);
    if (!response?.ok) {
      const data = await response?.json().catch(() => null) as { error?: { message?: string } } | null;
      setMessage(data?.error?.message ?? "No se pudo conectar el número de prueba.");
      return;
    }
    const data = await response.json() as { displayPhoneNumber: string };
    setMessage(`Número de prueba conectado: ${data.displayPhoneNumber}.`);
    window.location.reload();
  }

  return <Card>
    <CardHeader><CardTitle>Conectar con Meta</CardTitle><CardDescription>Abre el registro insertado de WhatsApp de Meta. El token de acceso obtenido se almacena cifrado en el servidor.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {!config ? <p className="text-sm text-muted-foreground">Cargando configuración…</p> : !config.configured ? <p className="text-sm text-destructive">Faltan los identificadores de Meta en la configuración del servidor.</p> : <div className="flex flex-wrap gap-2"><Button disabled={!sdkReady || connecting} onClick={openPopup}>{connecting ? "Conectando…" : sdkReady ? "Conectar con Meta" : "Preparando Meta…"}</Button>{config.reviewConfigured && <Button variant="outline" disabled={reviewConnecting} onClick={() => void connectReview()}>{reviewConnecting ? "Conectando prueba…" : "Conectar número de prueba"}</Button>}</div>}
      {config?.reviewConfigured && config.reviewOrganizationMatches === false && config.organizationSlug && <p className="text-sm text-destructive">Este espacio ({config.organizationSlug}) no está habilitado como espacio de revisión. Configura REVIEW_TENANT_SLUG en el servidor con ese nombre antes de conectar el número de prueba.</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </CardContent>
  </Card>;
}
