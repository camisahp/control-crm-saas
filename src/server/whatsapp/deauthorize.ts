import { and, eq, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { MetaSignedIdentity } from "@/lib/meta/signed-request";

/** La identidad ya fue autenticada por la firma. No usa sesión ni slug. */
export async function deauthorizeMetaSubject(appId: string, identity: MetaSignedIdentity): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const subjectScope = and(eq(schema.metaAuthorizationSubject.appId, appId), eq(schema.metaAuthorizationSubject.userId, identity.userId));
    await tx.insert(schema.metaAuthorizationSubject).values({ appId, userId: identity.userId }).onConflictDoNothing();
    const [subject] = await tx.select().from(schema.metaAuthorizationSubject).where(subjectScope).for("update");
    if (!subject || identity.issuedAt <= subject.revokedIssuedAt) return;
    await tx.update(schema.metaAuthorizationSubject).set({ revokedIssuedAt: identity.issuedAt }).where(subjectScope);
    // Lectura global justificada: resuelve sólo autorizaciones del sujeto firmado.
    // No selecciona cuerpos, teléfonos ni tokens; cada efecto es org-first.
    const matching = and(eq(schema.metaCredentials.authorizationAppId, appId),
      eq(schema.metaCredentials.authorizationUserId, identity.userId),
      lte(schema.metaCredentials.authorizationIssuedAt, identity.issuedAt));
    const connections = await tx.select({ organizationId: schema.metaCredentials.organizationId }).from(schema.metaCredentials).where(matching);
    for (const connection of connections) {
      await tx.delete(schema.metaCredentials).where(and(
        scoped(schema.metaCredentials.organizationId, connection.organizationId), matching
      ));
    }
  });
}
