import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "../../db/connection";
import { requireMfaVerified } from "./auth/middleware";

function assertAdmin(context: { user: { roles: string[] } }) {
  if (!context.user.roles.includes("admin")) throw new Error("FORBIDDEN");
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  roles: string[];
  owned_company_ids: string[];
};

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireMfaVerified])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    assertAdmin(context);
    const sql = getDb();
    const [users, roles, comps] = await Promise.all([
      sql<{ id: string; email: string; created_at: Date }[]>`SELECT id, email, created_at FROM users ORDER BY created_at ASC`,
      sql<{ user_id: string; role: string }[]>`SELECT user_id, role FROM user_roles`,
      sql<{ company_id: string; owner_user_id: string }[]>`
        SELECT company_id, owner_user_id FROM exhibition_companies WHERE owner_user_id IS NOT NULL
      `,
    ]);
    return users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at.toISOString(),
      roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role),
      owned_company_ids: comps.filter((c) => c.owner_user_id === u.id).map((c) => c.company_id),
    }));
  });

export const grantAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const sql = getDb();
    await sql`
      INSERT INTO user_roles (user_id, role) VALUES (${data.user_id}, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING
    `;
    return { ok: true };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    if (data.user_id === context.user.id) throw new Error("CANNOT_REVOKE_SELF");
    const sql = getDb();
    await sql`DELETE FROM user_roles WHERE user_id = ${data.user_id} AND role = 'admin'`;
    return { ok: true };
  });

export const assignCompanyOwner = createServerFn({ method: "POST" })
  .middleware([requireMfaVerified])
  .inputValidator((i) => z.object({
    company_id: z.string().min(1).max(120),
    user_id: z.string().uuid().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    assertAdmin(context);
    const sql = getDb();
    await sql`UPDATE exhibition_companies SET owner_user_id = ${data.user_id} WHERE company_id = ${data.company_id}`;
    if (data.user_id) {
      await sql`
        INSERT INTO user_roles (user_id, role) VALUES (${data.user_id}, 'company_owner')
        ON CONFLICT (user_id, role) DO NOTHING
      `;
    }
    return { ok: true };
  });

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireMfaVerified])
  .handler(async ({ context }): Promise<{ roles: string[]; owned_company_id: string | null }> => {
    const sql = getDb();
    const [owned] = await sql<{ company_id: string }[]>`
      SELECT company_id FROM exhibition_companies WHERE owner_user_id = ${context.user.id} LIMIT 1
    `;
    return {
      roles: context.user.roles,
      owned_company_id: owned?.company_id ?? null,
    };
  });
