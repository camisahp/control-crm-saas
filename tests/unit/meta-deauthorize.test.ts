import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { saveCredentials, AuthorizationRevokedError } from "@/server/whatsapp/credentials";
import { POST, GET } from "@/app/api/meta/deauthorize/route";

const state = vi.hoisted(() => ({ db: null as unknown, secret: "synthetic-callback-fixture", appId: "123" }));
vi.mock("@/lib/db", async (original) => ({ ...await original<typeof import("@/lib/db")>(), getDb: () => state.db }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ META_APP_SECRET: state.secret, META_APP_ID: state.appId, ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") }) }));

let pg: PGlite;
let server: Server;
let baseUrl: string;
const now = Math.floor(Date.now() / 1000);
function signed(userId = "111", issuedAt = now, key = state.secret) {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: userId, issued_at: issuedAt })).toString("base64url");
  return `${createHmac("sha256", key).update(payload).digest("base64url")}.${payload}`;
}
const credentials = (org: string, userId?: string, issuedAt = now - 10) => ({
  organizationId: org, wabaId: `waba-${org}`, phoneNumberId: `phone-${org}`, token: "synthetic-fixture-value",
  authorization: userId ? { appId: "123", userId, issuedAt } : undefined,
});
async function callback(value: string) {
  return fetch(baseUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ signed_request: value }) });
}
async function remaining() { return (await pg.query<{ organization_id: string }>("select organization_id from meta_credentials order by organization_id")).rows.map(r => r.organization_id); }

beforeAll(async () => {
  pg = new PGlite(); // PostgreSQL aislado en memoria: nunca DATABASE_URL de producción.
  const db = drizzle(pg, { schema });
  state.db = db;
  await migrate(db, { migrationsFolder: "drizzle" });
  server = createServer(async (incoming, outgoing) => {
    try {
      const request = new Request("http://localhost/api/meta/deauthorize", { method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        ...(incoming.method === "GET" ? {} : { body: Readable.toWeb(incoming) as ReadableStream, duplex: "half" }),
      } as RequestInit);
      const response = incoming.method === "GET" ? GET() : await POST(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server unavailable");
  baseUrl = `http://127.0.0.1:${address.port}/api/meta/deauthorize`;
}, 60_000);

beforeEach(async () => {
  await pg.exec("truncate organization cascade; truncate meta_authorization_subject;");
  await pg.query("insert into organization(id,name) values ('org-A','Fixture A'),('org-B','Fixture B'),('org-M','Fixture manual')");
  await pg.query("insert into contact(id,organization_id,wa_identity,name,notes) values ('contact-A','org-A','fixture-contact','Fixture','Preserve history')");
  await pg.query("insert into conversation(id,organization_id,contact_id) values ('conversation-A','org-A','contact-A')");
  await pg.query("insert into message(id,organization_id,conversation_id,direction,text) values ('message-A','org-A','conversation-A','in','Synthetic history')");
  await saveCredentials(credentials("org-A", "111"));
  await saveCredentials(credentials("org-B", "222"));
  await saveCredentials(credentials("org-M"));
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (pg) await pg.close();
});

describe("callback real HTTP + PostgreSQL aislado", () => {
  it("retira A, preserva B/manual e historial; no devuelve identidades", async () => {
    const response = await callback(signed());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await remaining()).toEqual(["org-B", "org-M"]);
    expect((await pg.query("select notes from contact where id='contact-A'")).rows).toEqual([{ notes: "Preserve history" }]);
    expect((await pg.query("select text from message where id='message-A'")).rows).toEqual([{ text: "Synthetic history" }]);
    expect((await pg.query("select id from conversation where id='conversation-A'")).rows).toHaveLength(1);
  });
  it("rechaza firma ajena sin modificar filas", async () => {
    expect((await callback(signed("111", now, "wrong-fixture-key"))).status).toBe(401);
    expect(await remaining()).toEqual(["org-A", "org-B", "org-M"]);
  });
  it("no hace efectos para otra identidad; guarda límite de revocación", async () => {
    expect((await callback(signed("999"))).status).toBe(200);
    expect(await remaining()).toHaveLength(3);
    await expect(saveCredentials(credentials("org-A", "999", now))).rejects.toBeInstanceOf(AuthorizationRevokedError);
    expect(await remaining()).toHaveLength(3);
  });
  it("repetición/entrega tardía no retira reconexión nueva", async () => {
    await callback(signed());
    await saveCredentials(credentials("org-A", "111", now + 1));
    await callback(signed());
    expect(await remaining()).toHaveLength(3);
    await callback(signed("111", now + 2));
    expect(await remaining()).toEqual(["org-B", "org-M"]);
  });
  it("otro actor reconectado no es desconectado por el anterior", async () => {
    await saveCredentials(credentials("org-A", "333", now));
    await callback(signed("111", now + 1));
    expect(await remaining()).toHaveLength(3);
  });
  it("GET no ejecuta; falta campo/tipo/cuerpo grande son rechazados", async () => {
    expect((await fetch(baseUrl)).status).toBe(405);
    expect((await fetch(baseUrl, { method: "POST", body: "{}", headers: { "content-type": "application/json" } })).status).toBe(415);
    expect((await callback("")).status).toBe(400);
    expect((await callback("x".repeat(33_000))).status).toBe(413);
    expect(await remaining()).toHaveLength(3);
  });
  it("una cancelación anterior a la autorización no retira credenciales", async () => {
    await callback(signed("111", now - 20));
    expect(await remaining()).toHaveLength(3);
  });
  it("retira todas las conexiones del mismo sujeto, nunca las de otro", async () => {
    await saveCredentials(credentials("org-M", "111"));
    await callback(signed());
    expect(await remaining()).toEqual(["org-B"]);
  });
  it("rotación manual limpia la asociación anterior y conserva la nueva credencial", async () => {
    await saveCredentials(credentials("org-A"));
    await callback(signed());
    expect(await remaining()).toHaveLength(3);
    expect((await pg.query("select authorization_user_id from meta_credentials where organization_id='org-A'")).rows).toEqual([{ authorization_user_id: null }]);
  });
  it("parámetro duplicado y firma futura no producen efectos", async () => {
    expect((await fetch(baseUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams([["signed_request", signed()], ["signed_request", signed()]]) })).status).toBe(400);
    expect((await callback(signed("111", now + 3600))).status).toBe(401);
    expect(await remaining()).toHaveLength(3);
  });
});
