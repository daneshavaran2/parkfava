/**
 * Read-only integrity audit for the constraints migration 0004 added NOT VALID.
 *
 * `ADD CONSTRAINT ... NOT VALID` enforces a foreign key for every new write but
 * deliberately skips the scan of existing rows, so any orphan that predated the
 * migration is still there and still invisible. `VALIDATE CONSTRAINT` was never
 * run afterwards (docs/Data Model.md), which means nothing has ever checked.
 * These queries are that check.
 *
 * Also counts the two orphan classes no foreign key covers at all:
 * company_attachments.owner_id is polymorphic (owner_type + owner_id, guarded
 * only by a CHECK on the enum), so a deleted company leaves its attachment rows
 * — and their files on disk — behind.
 *
 * Read-only: SELECTs only, safe against production.
 *
 * Run:  bun run scripts/check-orphans.ts
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(url, {
  ssl: url.includes("sslmode=require") ? "require" : false,
});

type Check = { label: string; note: string; rows: () => Promise<{ count: number }[]> };

const checks: Check[] = [
  {
    label: "park_images.park_id -> parks",
    note: "FK added NOT VALID in 0004",
    rows: () => sql`
      SELECT count(*)::int AS count FROM park_images pi
      LEFT JOIN parks p ON p.park_id = pi.park_id
      WHERE p.park_id IS NULL
    `,
  },
  {
    label: "park_news.park_id -> parks",
    note: "FK added NOT VALID in 0004",
    rows: () => sql`
      SELECT count(*)::int AS count FROM park_news pn
      LEFT JOIN parks p ON p.park_id = pn.park_id
      WHERE p.park_id IS NULL
    `,
  },
  {
    label: "exhibition_companies.park_id -> parks",
    note: "FK added NOT VALID in 0004",
    rows: () => sql`
      SELECT count(*)::int AS count FROM exhibition_companies ec
      LEFT JOIN parks p ON p.park_id = ec.park_id
      WHERE ec.park_id IS NOT NULL AND p.park_id IS NULL
    `,
  },
  {
    label: "exhibition_companies.reviewed_by -> users",
    note: "FK added NOT VALID in 0004",
    rows: () => sql`
      SELECT count(*)::int AS count FROM exhibition_companies ec
      LEFT JOIN users u ON u.id = ec.reviewed_by
      WHERE ec.reviewed_by IS NOT NULL AND u.id IS NULL
    `,
  },
  {
    label: "company_attachments -> exhibition_companies",
    note: "no FK exists (polymorphic owner_id)",
    rows: () => sql`
      SELECT count(*)::int AS count FROM company_attachments ca
      LEFT JOIN exhibition_companies ec ON ec.company_id = ca.owner_id
      WHERE ca.owner_type = 'exhibition' AND ec.company_id IS NULL
    `,
  },
  {
    label: "company_attachments -> parks",
    note: "no FK exists (polymorphic owner_id)",
    rows: () => sql`
      SELECT count(*)::int AS count FROM company_attachments ca
      LEFT JOIN parks p ON p.park_id = ca.owner_id
      WHERE ca.owner_type = 'park' AND p.park_id IS NULL
    `,
  },
];

let total = 0;
console.log("Orphan row audit\n");
for (const check of checks) {
  const [{ count }] = await check.rows();
  total += count;
  const mark = count === 0 ? "ok  " : "ORPH";
  console.log(`  ${mark} ${count.toString().padStart(6)}  ${check.label}  (${check.note})`);
}

// Which of the NOT VALID constraints are still unvalidated, straight from the
// catalog — the counts above only say what is true right now, this says whether
// Postgres is still willing to let old violations through unnoticed.
const unvalidated = await sql<{ conname: string; conrelid: string }[]>`
  SELECT conname, conrelid::regclass::text AS conrelid
  FROM pg_constraint
  WHERE contype = 'f' AND NOT convalidated
  ORDER BY conname
`;

console.log(`\n${total} orphan row(s) total`);
if (unvalidated.length) {
  console.log(`\n${unvalidated.length} foreign key(s) still NOT VALIDATED:`);
  for (const c of unvalidated) console.log(`  - ${c.conrelid}.${c.conname}`);
  console.log("\nWith 0 orphans above, each can be promoted with:");
  for (const c of unvalidated) {
    console.log(`  ALTER TABLE ${c.conrelid} VALIDATE CONSTRAINT ${c.conname};`);
  }
} else {
  console.log("\nAll foreign keys are validated.");
}

await sql.end();
process.exit(total === 0 ? 0 : 1);
