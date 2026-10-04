"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoneyCents, parseMoneyToCents } from "@/lib/money";
import {
  RESOURCE_COLORS,
  RESOURCE_COLOR_KEYS,
  resourceColorClass,
} from "@/lib/resource-colors";
import { cn } from "@/lib/utils";

/**
 * 200 — Ajustes → Agenda → "Barberos y servicios" (o "Cabinas y paquetes": los
 * nombres salen del giro, `src/lib/vertical.ts`).
 *
 * Tres cosas: quién atiende (con su color y, si quiere, su propio horario),
 * qué se agenda (duración, precio, descripción e indicaciones antes de la cita)
 * y quién ofrece qué. Sin ningún recurso activo, la agenda es la de siempre.
 */

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Interval = { start: string; end: string };
type WeeklyHours = Partial<Record<DayKey, Interval[]>>;

type Resource = {
  id: string;
  name: string;
  weeklyHours: WeeklyHours | null;
  color: string | null;
  active: boolean;
  position: number;
  serviceIds: string[];
};

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
  description: string | null;
  instructions: string | null;
  active: boolean;
  position: number;
  resourceIds: string[];
};

type Labels = {
  titulo: string;
  recurso: { singular: string; plural: string };
  servicio: { singular: string; plural: string };
  seleccion: "cliente" | "automatica";
};

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mié" },
  { key: "thu", label: "Jue" },
  { key: "fri", label: "Vie" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

async function send(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res?.ok) return { ok: false, message: data?.error?.message ?? "No se pudo guardar" };
  return { ok: true, data };
}

export function CatalogoClient({ labels, currency }: { labels: Labels; currency: string }) {
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | "new" | null>(null);
  const [editingService, setEditingService] = useState<Service | "new" | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/agenda/catalog").catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cargar el catálogo");
      setResources([]);
      return;
    }
    const data = (await res.json()) as { resources: Resource[]; services: Service[] };
    setResources(data.resources);
    setServices(data.services);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown
  ): Promise<boolean> {
    setError(null);
    const result = await send(url, method, body);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    await reload();
    return true;
  }

  async function toggleLink(service: Service, resourceId: string, on: boolean) {
    const resourceIds = on
      ? [...new Set([...service.resourceIds, resourceId])]
      : service.resourceIds.filter((id) => id !== resourceId);
    await run(`/api/agenda/services/${service.id}`, "PATCH", { resourceIds });
  }

  if (resources === null) return <p className="text-sm text-text-3">Cargando…</p>;

  const recursoSg = labels.recurso.singular.toLowerCase();
  const recursoPl = labels.recurso.plural.toLowerCase();
  const servicioSg = labels.servicio.singular.toLowerCase();
  const servicioPl = labels.servicio.plural.toLowerCase();
  const activos = resources.filter((r) => r.active);

  return (
    <section className="max-w-3xl space-y-4" aria-labelledby="catalogo-titulo">
      <div>
        <h2 id="catalogo-titulo" className="text-[17px] font-bold tracking-tight">
          {labels.titulo}
        </h2>
        <p className="mt-1 text-sm text-text-2">
          {labels.seleccion === "cliente"
            ? `Cada ${recursoSg} con su horario y los ${servicioPl} que ofrece. El cliente elige con quién, o el primero libre.`
            : `Las ${recursoPl} se asignan solas: el cliente elige el ${servicioSg} y el sistema busca una ${recursoSg} libre durante toda su duración.`}{" "}
          Sin {recursoPl} activos, la agenda funciona como siempre (una sola agenda).
        </p>
        {error && (
          <p role="alert" className="mt-2 rounded-sm bg-danger-tint px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>

      {/* Quién atiende */}
      <Card>
        <CardHeader>
          <CardTitle>{labels.recurso.plural}</CardTitle>
          <CardDescription>
            Su color es el de sus citas en el calendario. Si no le pones horario propio, usa el del
            negocio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {resources.length === 0 && (
            <p className="text-sm text-text-3">Todavía no hay {recursoPl}.</p>
          )}
          {resources.map((r, i) =>
            editingResource !== "new" && editingResource?.id === r.id ? (
              <ResourceForm
                key={r.id}
                initial={r}
                index={i}
                labels={labels}
                onCancel={() => setEditingResource(null)}
                onSave={async (body) => {
                  if (await run(`/api/agenda/resources/${r.id}`, "PATCH", body)) setEditingResource(null);
                }}
              />
            ) : (
              <div key={r.id} className="flex items-center gap-3 rounded-sm border px-3 py-2">
                <span aria-hidden className={cn("h-3.5 w-3.5 shrink-0 rounded-full", resourceColorClass(r.color, i))} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {r.name}
                    {!r.active && (
                      <Badge variant="secondary" className="ml-2">
                        Inactivo
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-text-3">
                    {r.weeklyHours ? hoursSummary(r.weeklyHours) : "Horario del negocio"}
                  </p>
                </div>
                {!r.active && (
                  <Button size="sm" variant="ghost" onClick={() => void run(`/api/agenda/resources/${r.id}`, "PATCH", { active: true })}>
                    Activar
                  </Button>
                )}
                <Button size="sm" variant="ghost" aria-label={`Editar ${r.name}`} onClick={() => setEditingResource(r)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Borrar ${r.name}`}
                  className="text-danger-text"
                  onClick={() => {
                    if (window.confirm(`¿Borrar a ${r.name}? Si ya tiene citas, solo se desactiva.`)) {
                      void run(`/api/agenda/resources/${r.id}`, "DELETE");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          )}
          {editingResource === "new" ? (
            <ResourceForm
              index={resources.length}
              labels={labels}
              onCancel={() => setEditingResource(null)}
              onSave={async (body) => {
                if (await run("/api/agenda/resources", "POST", body)) setEditingResource(null);
              }}
            />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setEditingResource("new")}>
              <Plus className="h-3.5 w-3.5" /> Agregar {recursoSg}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Qué se agenda */}
      <Card>
        <CardHeader>
          <CardTitle>{labels.servicio.plural}</CardTitle>
          <CardDescription>
            La duración de la cita es la del {servicioSg}. Las indicaciones se le dicen al cliente al
            confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.length === 0 && (
            <p className="text-sm text-text-3">Todavía no hay {servicioPl}.</p>
          )}
          {services.map((s) =>
            editingService !== "new" && editingService?.id === s.id ? (
              <ServiceForm
                key={s.id}
                initial={s}
                labels={labels}
                currency={currency}
                onCancel={() => setEditingService(null)}
                onSave={async (body) => {
                  if (await run(`/api/agenda/services/${s.id}`, "PATCH", body)) setEditingService(null);
                }}
              />
            ) : (
              <div key={s.id} className="flex items-start gap-3 rounded-sm border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.name}
                    {!s.active && (
                      <Badge variant="secondary" className="ml-2">
                        Inactivo
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-text-3">
                    {s.durationMinutes} min
                    {s.priceCents !== null && ` · ${formatMoneyCents(s.priceCents, currency)}`}
                  </p>
                  {s.description && <p className="mt-0.5 line-clamp-2 text-xs text-text-2">{s.description}</p>}
                  {s.instructions && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-2">
                      <span className="font-semibold">Antes de la cita:</span> {s.instructions}
                    </p>
                  )}
                </div>
                {!s.active && (
                  <Button size="sm" variant="ghost" onClick={() => void run(`/api/agenda/services/${s.id}`, "PATCH", { active: true })}>
                    Activar
                  </Button>
                )}
                <Button size="sm" variant="ghost" aria-label={`Editar ${s.name}`} onClick={() => setEditingService(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Borrar ${s.name}`}
                  className="text-danger-text"
                  onClick={() => {
                    if (window.confirm(`¿Borrar "${s.name}"? Si ya tiene citas, solo se desactiva.`)) {
                      void run(`/api/agenda/services/${s.id}`, "DELETE");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          )}
          {editingService === "new" ? (
            <ServiceForm
              labels={labels}
              currency={currency}
              onCancel={() => setEditingService(null)}
              onSave={async (body) => {
                if (await run("/api/agenda/services", "POST", body)) setEditingService(null);
              }}
            />
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setEditingService("new")}>
              <Plus className="h-3.5 w-3.5" /> Agregar {servicioSg}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Quién ofrece qué */}
      {services.length > 0 && activos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quién ofrece qué</CardTitle>
            <CardDescription>
              Un {servicioSg} sin nadie marcado lo ofrece cualquier {recursoSg} activo.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="kicker py-2 pr-3 text-left">{labels.servicio.singular}</th>
                  {activos.map((r) => (
                    <th key={r.id} className="kicker px-2 py-2 text-center">
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services
                  .filter((s) => s.active)
                  .map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{s.name}</span>
                        {s.resourceIds.length === 0 && (
                          <span className="ml-2 text-xs text-text-3">(cualquiera)</span>
                        )}
                      </td>
                      {activos.map((r) => (
                        <td key={r.id} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${r.name} ofrece ${s.name}`}
                            checked={s.resourceIds.includes(r.id)}
                            onChange={(e) => void toggleLink(s, r.id, e.target.checked)}
                            className="h-4 w-4 accent-[var(--accent)]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function hoursSummary(hours: WeeklyHours): string {
  const open = DAYS.filter((d) => (hours[d.key]?.length ?? 0) > 0);
  if (open.length === 0) return "Horario propio: sin días";
  return `Horario propio: ${open
    .map((d) => {
      const iv = hours[d.key]![0]!;
      return `${d.label} ${iv.start}–${iv.end}`;
    })
    .join(", ")}`;
}

function ResourceForm({
  initial,
  index,
  labels,
  onCancel,
  onSave,
}: {
  initial?: Resource;
  index: number;
  labels: Labels;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [own, setOwn] = useState(Boolean(initial?.weeklyHours));
  const [hours, setHours] = useState<WeeklyHours>(
    initial?.weeklyHours ?? {
      mon: [{ start: "10:00", end: "20:00" }],
      tue: [{ start: "10:00", end: "20:00" }],
      wed: [{ start: "10:00", end: "20:00" }],
      thu: [{ start: "10:00", end: "20:00" }],
      fri: [{ start: "10:00", end: "20:00" }],
      sat: [{ start: "10:00", end: "18:00" }],
    }
  );
  const [busy, setBusy] = useState(false);

  function setDay(day: DayKey, next: Interval | null) {
    setHours((h) => {
      const copy = { ...h };
      if (next) copy[day] = [next];
      else delete copy[day];
      return copy;
    });
  }

  return (
    <form
      className="space-y-3 rounded-sm border border-brand-soft bg-subtle p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({ name: name.trim(), color, weeklyHours: own ? hours : null });
        setBusy(false);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="recurso-nombre">Nombre</Label>
        <Input
          id="recurso-nombre"
          required
          maxLength={80}
          value={name}
          placeholder={labels.recurso.singular === "Barbero" ? "Luis" : `${labels.recurso.singular} 1`}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Color</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
          <button
            type="button"
            role="radio"
            aria-checked={color === null}
            onClick={() => setColor(null)}
            className={cn(
              "flex h-7 items-center gap-1 rounded-full border px-2 text-xs",
              color === null ? "border-brand text-brand-text" : "text-text-3"
            )}
          >
            <span aria-hidden className={cn("h-3.5 w-3.5 rounded-full", resourceColorClass(null, index))} /> Automático
          </button>
          {RESOURCE_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={color === key}
              aria-label={RESOURCE_COLORS[key].label}
              title={RESOURCE_COLORS[key].label}
              onClick={() => setColor(key)}
              className={cn(
                "h-7 w-7 rounded-full border-2",
                RESOURCE_COLORS[key].bg,
                color === key ? "border-foreground" : "border-transparent"
              )}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Horario</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Horario">
          {[
            { v: false, label: "El del negocio" },
            { v: true, label: "Propio" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={own === o.v}
              onClick={() => setOwn(o.v)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                own === o.v ? "border-brand bg-brand-tint text-brand-text" : "text-text-2 hover:bg-accent"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {own && (
          <div className="space-y-1.5 pt-1">
            {DAYS.map((d) => {
              const iv = hours[d.key]?.[0] ?? null;
              return (
                <div key={d.key} className="flex items-center gap-2">
                  <label className="flex w-16 items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(iv)}
                      onChange={(e) => setDay(d.key, e.target.checked ? { start: "10:00", end: "20:00" } : null)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    {d.label}
                  </label>
                  {iv ? (
                    <>
                      <Input
                        type="time"
                        aria-label={`${d.label} desde`}
                        value={iv.start}
                        onChange={(e) => setDay(d.key, { ...iv, start: e.target.value })}
                        className="w-28"
                      />
                      <span className="text-text-3">a</span>
                      <Input
                        type="time"
                        aria-label={`${d.label} hasta`}
                        value={iv.end}
                        onChange={(e) => setDay(d.key, { ...iv, end: e.target.value })}
                        className="w-28"
                      />
                    </>
                  ) : (
                    <span className="text-sm text-text-3">Descansa</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function ServiceForm({
  initial,
  labels,
  currency,
  onCancel,
  onSave,
}: {
  initial?: Service;
  labels: Labels;
  currency: string;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 30));
  const [price, setPrice] = useState(
    initial?.priceCents !== null && initial?.priceCents !== undefined ? String(initial.priceCents / 100) : ""
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 rounded-sm border border-brand-soft bg-subtle p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const minutes = Number(duration);
        if (!Number.isInteger(minutes) || minutes < 5 || minutes > 600) {
          setError("La duración va en minutos, de 5 a 600");
          return;
        }
        const priceCents = price.trim() ? parseMoneyToCents(price) : null;
        if (price.trim() && priceCents === null) {
          setError("El precio no se entiende; escribe solo el número");
          return;
        }
        setError(null);
        setBusy(true);
        await onSave({
          name: name.trim(),
          durationMinutes: minutes,
          priceCents,
          description: description.trim() || null,
          instructions: instructions.trim() || null,
        });
        setBusy(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem]">
        <div className="space-y-1.5">
          <Label htmlFor="servicio-nombre">Nombre</Label>
          <Input
            id="servicio-nombre"
            required
            maxLength={80}
            value={name}
            placeholder={labels.servicio.singular === "Servicio" ? "Corte clásico" : `${labels.servicio.singular}…`}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="servicio-duracion">Duración (min)</Label>
          <Input
            id="servicio-duracion"
            type="number"
            min={5}
            max={600}
            required
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="servicio-precio">Precio ({currency})</Label>
          <Input
            id="servicio-precio"
            inputMode="decimal"
            value={price}
            placeholder="250"
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="servicio-descripcion">Descripción (opcional)</Label>
        <Textarea
          id="servicio-descripcion"
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="servicio-indicaciones">Indicaciones antes de la cita (opcional)</Label>
        <Textarea
          id="servicio-indicaciones"
          maxLength={2000}
          value={instructions}
          placeholder="Llega 10 min antes, sin cremas."
          onChange={(e) => setInstructions(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
