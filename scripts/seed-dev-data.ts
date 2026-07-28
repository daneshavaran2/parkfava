/**
 * Local development seed script.
 *
 * Populates the database with a small, realistic dataset so a fresh checkout
 * can drive the UI, the admin panels, and the visual regression suite without
 * waiting for real content to be entered by hand.
 *
 * Guarantees:
 *   - never runs against production (`NODE_ENV=production` aborts)
 *   - idempotent: rows are keyed by natural ids (`park_id`, `company_id`) and
 *     upserted, so re-running does not create duplicates
 *   - safe to purge with `bun run reset:dev`, which drops rows tagged
 *     `[SEED]` in their name/title fields
 *
 * Usage:  bun run seed
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed against a production environment.");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const parks = [
  { park_id: "tehran",   name: "[SEED] پارک فناوری تهران",   province: "تهران",    city: "تهران",    mx: 52, my: 45, color: "#6366f1", companies_hint: 120, jobs: 4500, area: 84,  is_active: true, sort_order: 1 },
  { park_id: "isfahan",  name: "[SEED] پارک فناوری اصفهان",  province: "اصفهان",   city: "اصفهان",   mx: 46, my: 55, color: "#10b981", companies_hint:  80, jobs: 2100, area: 45,  is_active: true, sort_order: 2 },
  { park_id: "mashhad",  name: "[SEED] پارک فناوری خراسان",  province: "خراسان رضوی", city: "مشهد",  mx: 68, my: 30, color: "#f59e0b", companies_hint:  60, jobs: 1400, area: 32,  is_active: true, sort_order: 3 },
  { park_id: "shiraz",   name: "[SEED] پارک فناوری فارس",    province: "فارس",     city: "شیراز",    mx: 44, my: 72, color: "#ef4444", companies_hint:  40, jobs:  900, area: 20,  is_active: true, sort_order: 4 },
];

const companies = [
  { company_id: "seed-alpha",    park_id: "tehran",  name: "[SEED] آلفا سیستم",       category: "نرم‌افزار",   city: "تهران",  status: "approved", is_active: true,  is_published: true,  sort_order: 1, tagline: "پلتفرم مدیریت پروژه", description: "شرکت نمونه برای تست UI." },
  { company_id: "seed-beta",     park_id: "tehran",  name: "[SEED] بتا هوش",          category: "AI",          city: "تهران",  status: "approved", is_active: true,  is_published: true,  sort_order: 2, tagline: "راهکارهای بینایی ماشین", description: "شرکت نمونه." },
  { company_id: "seed-gamma",    park_id: "isfahan", name: "[SEED] گاما رباتیک",       category: "رباتیک",      city: "اصفهان", status: "approved", is_active: true,  is_published: true,  sort_order: 3, tagline: "بازوهای رباتیک صنعتی", description: "شرکت نمونه." },
  { company_id: "seed-delta",    park_id: "mashhad", name: "[SEED] دلتا انرژی",       category: "انرژی سبز",   city: "مشهد",   status: "pending",  is_active: false, is_published: false, sort_order: 4, tagline: "پنل‌های خورشیدی هوشمند", description: "شرکت نمونه در حال بررسی." },
  { company_id: "seed-epsilon",  park_id: "shiraz",  name: "[SEED] اپسیلون طب",        category: "پزشکی",       city: "شیراز",  status: "approved", is_active: true,  is_published: true,  sort_order: 5, tagline: "تجهیزات تشخیصی", description: "شرکت نمونه." },
  { company_id: "seed-zeta",     park_id: "isfahan", name: "[SEED] زتا نانو",         category: "نانو",        city: "اصفهان", status: "draft",    is_active: false, is_published: false, sort_order: 6, tagline: "پوشش‌های نانوساختار", description: "پیش‌نویس شرکت." },
];

const productsFor = (cid: string) => [
  { company_id: cid, name: `[SEED] محصول اصلی ${cid}`, tagline: "توضیح کوتاه محصول", description: "محصول نمونه برای تست صفحه جزئیات.", sort_order: 1 },
  { company_id: cid, name: `[SEED] محصول ثانویه ${cid}`, tagline: "نسخه سبک", description: "نسخه سبک‌تر برای بازار کوچک.", sort_order: 2 },
];

async function upsert(table: string, rows: any[], conflict: string) {
  const { error } = await sb.from(table).upsert(rows, { onConflict: conflict });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
  console.log(`  ✓ ${table}: ${rows.length} rows`);
}

async function main() {
  console.log("Seeding parks…");
  await upsert("parks", parks, "park_id");

  console.log("Seeding park content…");
  await upsert(
    "park_content",
    parks.map((p) => ({ park_id: p.park_id, hero_title: `[SEED] ${p.name}`, hero_subtitle: "دروازه فناوری استان", body_md: "متن معرفی نمونه." })),
    "park_id",
  );

  console.log("Seeding companies…");
  await upsert("exhibition_companies", companies, "company_id");

  console.log("Seeding products…");
  const products = companies.flatMap((c) => productsFor(c.company_id));
  // exhibition_products has no natural unique key, so wipe seed rows first.
  await sb.from("exhibition_products").delete().like("name", "[SEED]%");
  const { error } = await sb.from("exhibition_products").insert(products);
  if (error) throw new Error(`insert exhibition_products: ${error.message}`);
  console.log(`  ✓ exhibition_products: ${products.length} rows`);

  console.log("\nDone. Run `bun dev` and open http://localhost:8080/exhibition");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
