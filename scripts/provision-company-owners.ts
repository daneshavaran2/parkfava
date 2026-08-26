/**
 * One-off script: creates a login account for each company that has both an
 * email and a contact mobile number in scripts/company-directory-2026-08.json
 * (the same reconciled data behind db/migrations/0014), and links it as that
 * company's owner (exhibition_companies.owner_user_id + a 'company_owner'
 * user_roles row) — the same pairing src/lib/admin-users.functions.ts's
 * assignCompanyOwner() does for a single company, just in bulk.
 *
 * Email becomes the login id; the contact mobile becomes the initial
 * password. Every created account is flagged must_change_password = true
 * (db/migrations/0018) — src/routes/my-company.tsx forces a real password to
 * be set before the owner can reach their company's edit form, so the phone
 * number is never more than a one-time bootstrap credential.
 *
 * Skips (never overwrites/relinks anything):
 *   - rows missing an email or mobile
 *   - rows that don't match an existing exhibition_companies row
 *   - companies that already have an owner_user_id
 *   - emails that already exist in `users` (a company that self-registered)
 *
 * Run (report only, writes nothing):  bun run scripts/provision-company-owners.ts
 * Run (writes):                       bun run scripts/provision-company-owners.ts --apply
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { findMatch } from "./lib/company-match";
import { hashPassword } from "../src/lib/auth/password.server";

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
  name_en?: string | null;
  website?: string | null;
  // JSON.parse can hand these back as numbers when the source cell had no
  // leading zero (e.g. a mobile like 9120542271) — see the coercion below.
  email?: string | number | null;
  contact_mobile?: string | number | null;
};
type DbCompany = {
  company_id: string;
  name: string;
  name_en: string | null;
  website: string | null;
  email: string | null;
  owner_user_id: string | null;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rows: SourceRow[] = JSON.parse(
  readFileSync(join(scriptDir, "company-directory-2026-08.json"), "utf8"),
);

async function main() {
  const dbCompanies = await sql<DbCompany[]>`
    SELECT company_id, name, name_en, website, email, owner_user_id FROM exhibition_companies
  `;

  // assign_first_user_admin (0001_init.sql) grants 'admin' to the first user
  // row ever inserted if no admin exists yet — inserting 88 users with no
  // admin present would silently make one of them an admin.
  const [{ count: adminCount }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM user_roles WHERE role = 'admin'
  `;
  if (Number(adminCount) === 0) {
    console.error("ABORT: no admin role exists yet — refusing to insert users (see assign_first_user_admin trigger).");
    await sql.end();
    process.exit(1);
  }

  const missingContact: string[] = [];
  const noMatch: string[] = [];
  const alreadyOwned: string[] = [];
  const emailCollisions: string[] = [];
  const ready: { company: DbCompany; email: string; mobile: string }[] = [];

  for (const row of rows) {
    // Some rows have contact_mobile/email stored as a JSON number rather
    // than a string (openpyxl parsed a mobile like 9120542271 as an int
    // when the source cell had no leading zero) — coerce before trimming.
    // A mobile cell sometimes holds two numbers separated by a literal
    // newline; only the first line is usable as a password a human can
    // actually type (a mid-string newline submits the form instead), so
    // that's what gets hashed. "-" is this form's own placeholder for "not
    // provided", not a real address/number, and a single-digit value like
    // "0" is equally not a real phone number — both are rejected below
    // rather than becoming one-character/undeliverable "credentials"
    // (found the hard way: this batch generated a "-" email and a "0"
    // password before this check existed; both accounts were manually
    // deleted after the fact — see the corresponding audit note).
    const rawEmail = row.email != null ? String(row.email).trim().toLowerCase() : "";
    const email = rawEmail && rawEmail !== "-" && rawEmail.includes("@") ? rawEmail : null;
    const rawMobile = row.contact_mobile != null ? String(row.contact_mobile).split(/[\n\r]+/)[0].trim() : "";
    const mobileDigits = rawMobile.replace(/\D/g, "");
    const mobile = rawMobile && rawMobile !== "-" && mobileDigits.length >= 10 ? rawMobile : null;
    if (!email || !mobile) {
      missingContact.push(row.name);
      continue;
    }

    const match = findMatch({ name: row.name, name_en: row.name_en, website: row.website, email }, dbCompanies);
    if (!match) {
      noMatch.push(row.name);
      continue;
    }
    if (match.company.owner_user_id) {
      alreadyOwned.push(row.name);
      continue;
    }

    const [existingUser] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email}`;
    if (existingUser) {
      emailCollisions.push(`${row.name} <${email}>`);
      continue;
    }

    ready.push({ company: match.company, email, mobile });
  }

  console.log(`Loaded ${rows.length} rows from company-directory-2026-08.json.`);
  console.log(`\nSkipped — missing email or mobile (${missingContact.length}):`);
  missingContact.forEach((n) => console.log(`  - ${n}`));
  console.log(`\nSkipped — no matching company in the database (${noMatch.length}):`);
  noMatch.forEach((n) => console.log(`  - ${n}`));
  console.log(`\nSkipped — company already has an owner (${alreadyOwned.length}):`);
  alreadyOwned.forEach((n) => console.log(`  - ${n}`));
  console.log(`\nSkipped — email already registered in users (${emailCollisions.length}):`);
  emailCollisions.forEach((n) => console.log(`  - ${n}`));
  console.log(`\nReady to provision: ${ready.length}`);
  ready.forEach((r) => console.log(`  - ${r.company.name} <${r.email}>`));

  if (!APPLY) {
    console.log("\nDry run only — nothing was written. Re-run with --apply to create these accounts.");
    await sql.end();
    return;
  }

  const outDir = join(scriptDir, "output");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `company-owner-credentials-${Date.now()}.csv`);
  const csvField = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csvLines = ["company_name,company_id,email,initial_password"];

  let created = 0;
  for (const { company, email, mobile } of ready) {
    try {
      await sql.begin(async (tx) => {
        const password_hash = await hashPassword(mobile);
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (email, password_hash, phone, must_change_password)
          VALUES (${email}, ${password_hash}, ${mobile}, true)
          RETURNING id
        `;
        await tx`UPDATE exhibition_companies SET owner_user_id = ${user.id} WHERE company_id = ${company.company_id}`;
        await tx`
          INSERT INTO user_roles (user_id, role) VALUES (${user.id}, 'company_owner')
          ON CONFLICT (user_id, role) DO NOTHING
        `;
      });
      csvLines.push([csvField(company.name), csvField(company.company_id), csvField(email), csvField(mobile)].join(","));
      created++;
    } catch (e) {
      console.error(`  FAILED to provision ${company.name}:`, (e as Error).message);
    }
  }

  writeFileSync(outPath, csvLines.join("\n"), "utf8");
  console.log(`\nCreated ${created}/${ready.length} accounts.`);
  console.log(`Credentials written to ${outPath} — distribute manually, then delete the file. Nothing was emailed or texted.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
