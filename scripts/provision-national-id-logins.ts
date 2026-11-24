/**
 * Gives every park member company in scripts/company-national-id-logins.json
 * a login whose username is the company's national ID and whose first-login
 * password is the CEO's mobile number (as listed in the park's company
 * spreadsheet). That JSON is produced by scripts/generate-national-id-logins.py
 * and holds only scrypt hashes of the mobiles, never the numbers themselves.
 *
 * Every account it creates or resets is flagged must_change_password, so the
 * first thing the company sees after signing in is the "set your password"
 * screen in src/routes/my-company.tsx — from then on only the company knows
 * its password.
 *
 * Per row, after matching it to an exhibition_companies row (the same
 * matcher, scripts/lib/company-match.ts, every other import here uses):
 *
 *   - the national ID already belongs to an account:
 *       still on its initial password  -> the initial password is refreshed
 *       has chosen its own password    -> left alone
 *   - the company has no owner account -> a new account is created and linked
 *     as the owner ('company_owner' role), with no email
 *   - the company already has an owner account (for example one created by
 *     scripts/provision-company-owners.ts with an email login):
 *       the national ID is added to it as a second username; if that account
 *       never set its own password, its initial password becomes the CEO
 *       mobile too, so every company follows the same first-login rule.
 *       An owner that has already chosen a password keeps it.
 *
 * Skipped and reported, never guessed at:
 *   - rows that match no company in the database
 *   - two rows that match the same company (a matcher misfire — see the
 *     'karatel' collisions in db/migrations/0014)
 *   - a company whose owner account already has a *different* national ID
 *
 * Requires db/migrations/0021_users_national_id.sql (bun run db:migrate).
 *
 * Run (report only, writes nothing):  bun run scripts/provision-national-id-logins.ts
 * Run (writes):                       bun run scripts/provision-national-id-logins.ts --apply
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { findMatch, normName } from "./lib/company-match";
import { isValidNationalId } from "../src/lib/auth/login-id";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const sql = postgres(DATABASE_URL, {
  ssl: DATABASE_URL.includes("sslmode=require") ? "require" : false,
});

const APPLY = process.argv.includes("--apply");

type SourceRow = {
  name: string;
  national_id: string;
  website: string | null;
  email: string | null;
  ceo_mobile_masked: string;
  initial_password_hash: string;
};
type DbCompany = {
  company_id: string;
  name: string;
  name_en: string | null;
  website: string | null;
  email: string | null;
  owner_user_id: string | null;
};
type DbUser = {
  id: string;
  email: string | null;
  national_id: string | null;
  must_change_password: boolean;
};

type Action =
  | { kind: "create"; row: SourceRow; company: DbCompany; method: string }
  | { kind: "attach"; row: SourceRow; company: DbCompany; method: string; owner: DbUser }
  | { kind: "refresh"; row: SourceRow; user: DbUser };

const scriptDir = dirname(fileURLToPath(import.meta.url));
// Generated locally by scripts/generate-national-id-logins.py from the park's
// spreadsheet and never committed: it holds password hashes of the companies'
// initial passwords (docs/Security Report.md, SEC-023). Delete it after use.
const sourcePath = join(scriptDir, "company-national-id-logins.json");
if (!existsSync(sourcePath)) {
  console.error(
    `Missing ${sourcePath} — generate it first: python scripts/generate-national-id-logins.py <spreadsheet.xlsx>`,
  );
  process.exit(1);
}
const rows: SourceRow[] = JSON.parse(readFileSync(sourcePath, "utf8"));

async function main() {
  const [{ has_column }] = await sql<{ has_column: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'national_id'
    ) AS has_column
  `;
  if (!has_column) {
    console.error(
      "ABORT: users.national_id does not exist yet — run `bun run db:migrate` first (migration 0021).",
    );
    await sql.end();
    process.exit(1);
  }

  // assign_first_user_admin (0001_init.sql) grants 'admin' to the first user
  // row ever inserted if no admin exists yet — inserting company accounts
  // with no admin present would silently make one of them an admin.
  const [{ count: adminCount }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM user_roles WHERE role = 'admin'
  `;
  if (Number(adminCount) === 0) {
    console.error(
      "ABORT: no admin role exists yet — refusing to insert users (see assign_first_user_admin trigger).",
    );
    await sql.end();
    process.exit(1);
  }

  const companies = await sql<DbCompany[]>`
    SELECT company_id, name, name_en, website, email, owner_user_id FROM exhibition_companies
  `;
  const users = await sql<DbUser[]>`SELECT id, email, national_id, must_change_password FROM users`;
  const userById = new Map(users.map((u) => [u.id, u]));
  const userByNationalId = new Map(
    users.filter((u) => u.national_id).map((u) => [u.national_id!, u]),
  );

  const invalid: string[] = [];
  const noMatch: string[] = [];
  const alreadyActive: string[] = [];
  const ownerConflict: string[] = [];
  const pending: Exclude<Action, { kind: "refresh" }>[] = [];
  const refresh: Extract<Action, { kind: "refresh" }>[] = [];

  for (const row of rows) {
    if (!isValidNationalId(row.national_id)) {
      invalid.push(`${row.name} (${row.national_id})`);
      continue;
    }

    const existing = userByNationalId.get(row.national_id);
    if (existing) {
      if (existing.must_change_password) refresh.push({ kind: "refresh", row, user: existing });
      else alreadyActive.push(`${row.name} (${row.national_id})`);
      continue;
    }

    const match = findMatch({ name: row.name, website: row.website, email: row.email }, companies);
    if (!match) {
      noMatch.push(`${row.name} (${row.national_id})`);
      continue;
    }
    const { company, method } = match;
    const owner = company.owner_user_id ? userById.get(company.owner_user_id) : undefined;
    if (owner?.national_id && owner.national_id !== row.national_id) {
      ownerConflict.push(
        `${row.name} (${row.national_id}) -> ${company.company_id}: owner already signs in as ${owner.national_id}`,
      );
      continue;
    }
    pending.push(
      owner
        ? { kind: "attach", row, company, method, owner }
        : { kind: "create", row, company, method },
    );
  }

  // Two spreadsheet rows landing on one database company means the matcher
  // misfired for at least one of them. If exactly one of them carries the
  // company's own name, that one is the company and the rest arrived through
  // a weaker signal (typically a representative's email on another company's
  // domain). Otherwise which one is right is unknowable here, so none gets
  // an account rather than one company getting another's.
  const byCompany = new Map<string, typeof pending>();
  for (const a of pending)
    byCompany.set(a.company.company_id, [...(byCompany.get(a.company.company_id) ?? []), a]);
  const duplicateMatches: string[] = [];
  const ready = pending.filter((a) => {
    const group = byCompany.get(a.company.company_id)!;
    if (group.length === 1) return true;
    const sameName = group.filter((g) => normName(g.row.name) === normName(g.company.name));
    if (sameName.length === 1 && sameName[0] === a) return true;
    duplicateMatches.push(
      `${a.row.name} (${a.row.national_id}) -> ${a.company.company_id} "${a.company.name}"`,
    );
    return false;
  });

  const keepsOwnPassword = (a: (typeof ready)[number]) =>
    a.kind === "attach" && !a.owner.must_change_password;
  const describe = (a: (typeof ready)[number]) =>
    `${a.row.name} (${a.row.national_id}) -> ${a.company.company_id} "${a.company.name}" [${a.method}]` +
    (a.kind === "attach" ? ` existing account ${a.owner.email ?? a.owner.id}` : "") +
    (keepsOwnPassword(a)
      ? " — keeps the password the company already chose"
      : ` — first password: CEO mobile ${a.row.ceo_mobile_masked}`);

  console.log(`Loaded ${rows.length} rows from company-national-id-logins.json.`);
  const section = (title: string, items: string[]) => {
    console.log(`\n${title} (${items.length}):`);
    items.forEach((i) => console.log(`  - ${i}`));
  };
  section("Skipped — invalid national ID", invalid);
  section("Skipped — no matching company in the database", noMatch);
  section("Skipped — several rows matched the same company (check by hand)", duplicateMatches);
  section("Skipped — company owner already has a different national ID", ownerConflict);
  section("Unchanged — already signed in and chose their own password", alreadyActive);
  section(
    "Will refresh initial password — account exists but never signed in",
    refresh.map(
      (r) => `${r.row.name} (${r.row.national_id}) — CEO mobile ${r.row.ceo_mobile_masked}`,
    ),
  );
  section(
    "Will add national ID to the company's existing account",
    ready.filter((a) => a.kind === "attach").map(describe),
  );
  section("Will create a new account", ready.filter((a) => a.kind === "create").map(describe));
  console.log(
    "\nMatches marked [name-substring] are the least certain — check those company pairs before applying.",
  );

  if (!APPLY) {
    console.log(
      "\nDry run only — nothing was written. Re-run with --apply to write these changes.",
    );
    await sql.end();
    return;
  }

  const report = ["company_name,national_id,company_id,action,first_password"];
  const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;
  let done = 0;
  const total = ready.length + refresh.length;

  for (const r of refresh) {
    try {
      await sql`
        UPDATE users SET password_hash = ${r.row.initial_password_hash}, updated_at = now()
        WHERE id = ${r.user.id} AND must_change_password = true
      `;
      report.push(
        [r.row.name, r.row.national_id, "", "refreshed", `CEO mobile ${r.row.ceo_mobile_masked}`]
          .map(csv)
          .join(","),
      );
      done++;
    } catch (e) {
      console.error(`  FAILED to refresh ${r.row.name}:`, (e as Error).message);
    }
  }

  for (const a of ready) {
    try {
      await sql.begin(async (tx) => {
        let userId: string;
        if (a.kind === "create") {
          const [user] = await tx<{ id: string }[]>`
            INSERT INTO users (national_id, password_hash, must_change_password)
            VALUES (${a.row.national_id}, ${a.row.initial_password_hash}, true)
            RETURNING id
          `;
          userId = user.id;
          // Guarded so a company that got an owner since the dry run is not
          // silently taken over by the new account.
          const linked = await tx`
            UPDATE exhibition_companies SET owner_user_id = ${userId}
            WHERE company_id = ${a.company.company_id} AND owner_user_id IS NULL
          `;
          if (linked.count !== 1) throw new Error("company was given an owner since the dry run");
        } else {
          userId = a.owner.id;
          await tx`UPDATE users SET national_id = ${a.row.national_id}, updated_at = now() WHERE id = ${userId}`;
          await tx`
            UPDATE users SET password_hash = ${a.row.initial_password_hash}, updated_at = now()
            WHERE id = ${userId} AND must_change_password = true
          `;
        }
        await tx`
          INSERT INTO user_roles (user_id, role) VALUES (${userId}, 'company_owner')
          ON CONFLICT (user_id, role) DO NOTHING
        `;
      });
      const firstPassword = keepsOwnPassword(a)
        ? "unchanged (company's own password)"
        : `CEO mobile ${a.row.ceo_mobile_masked}`;
      report.push(
        [
          a.row.name,
          a.row.national_id,
          a.company.company_id,
          a.kind === "create" ? "created" : "national ID added",
          firstPassword,
        ]
          .map(csv)
          .join(","),
      );
      done++;
    } catch (e) {
      console.error(`  FAILED for ${a.row.name}:`, (e as Error).message);
    }
  }

  const outDir = join(scriptDir, "output");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `national-id-logins-${Date.now()}.csv`);
  writeFileSync(outPath, report.join("\n"), "utf8");
  console.log(
    `\nApplied ${done}/${total}. Report written to ${outPath}. Nothing was emailed or texted.`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
