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

// name_en demonstrates the optional English-name field admins can now fill
// in per company/park (src/lib/fava/primitives.tsx's pickName()) — shown on
// the public site whenever the visitor switches the language to English.
const parks = [
  { park_id: "tehran",   name: "[SEED] پارک فناوری تهران",   name_en: "[SEED] Tehran Technology Park",   province: "تهران",    city: "تهران",    mx: 52, my: 45, color: "#6366f1", companies_hint: 120, jobs: 4500, area: 84,  is_active: true, sort_order: 1 },
  { park_id: "isfahan",  name: "[SEED] پارک فناوری اصفهان",  name_en: "[SEED] Isfahan Technology Park",  province: "اصفهان",   city: "اصفهان",   mx: 46, my: 55, color: "#10b981", companies_hint:  80, jobs: 2100, area: 45,  is_active: true, sort_order: 2 },
  { park_id: "mashhad",  name: "[SEED] پارک فناوری خراسان",  name_en: "[SEED] Khorasan Technology Park", province: "خراسان رضوی", city: "مشهد",  mx: 68, my: 30, color: "#f59e0b", companies_hint:  60, jobs: 1400, area: 32,  is_active: true, sort_order: 3 },
  { park_id: "shiraz",   name: "[SEED] پارک فناوری فارس",    name_en: "[SEED] Fars Technology Park",     province: "فارس",     city: "شیراز",    mx: 44, my: 72, color: "#ef4444", companies_hint:  40, jobs:  900, area: 20,  is_active: true, sort_order: 4 },
];

const companies = [
  { company_id: "seed-alpha",    park_id: "tehran",  name: "[SEED] آلفا سیستم",       name_en: "[SEED] Alpha Systems",     category: "نرم‌افزار",   city: "تهران",  status: "approved", is_active: true,  is_published: true,  sort_order: 1, tagline: "پلتفرم مدیریت پروژه", description: "شرکت نمونه برای تست UI." },
  { company_id: "seed-beta",     park_id: "tehran",  name: "[SEED] بتا هوش",          name_en: "[SEED] Beta AI",           category: "AI",          city: "تهران",  status: "approved", is_active: true,  is_published: true,  sort_order: 2, tagline: "راهکارهای بینایی ماشین", description: "شرکت نمونه." },
  { company_id: "seed-gamma",    park_id: "isfahan", name: "[SEED] گاما رباتیک",       name_en: "[SEED] Gamma Robotics",    category: "رباتیک",      city: "اصفهان", status: "approved", is_active: true,  is_published: true,  sort_order: 3, tagline: "بازوهای رباتیک صنعتی", description: "شرکت نمونه." },
  { company_id: "seed-delta",    park_id: "mashhad", name: "[SEED] دلتا انرژی",       name_en: "[SEED] Delta Energy",      category: "انرژی سبز",   city: "مشهد",   status: "pending",  is_active: false, is_published: false, sort_order: 4, tagline: "پنل‌های خورشیدی هوشمند", description: "شرکت نمونه در حال بررسی." },
  { company_id: "seed-epsilon",  park_id: "shiraz",  name: "[SEED] اپسیلون طب",        name_en: "[SEED] Epsilon Medical",   category: "پزشکی",       city: "شیراز",  status: "approved", is_active: true,  is_published: true,  sort_order: 5, tagline: "تجهیزات تشخیصی", description: "شرکت نمونه." },
  { company_id: "seed-zeta",     park_id: "isfahan", name: "[SEED] زتا نانو",         name_en: "[SEED] Zeta Nano",         category: "نانو",        city: "اصفهان", status: "draft",    is_active: false, is_published: false, sort_order: 6, tagline: "پوشش‌های نانوساختار", description: "پیش‌نویس شرکت." },
];

const productsFor = (cid: string) => [
  { company_id: cid, name: `[SEED] محصول اصلی ${cid}`, tagline: "توضیح کوتاه محصول", description: "محصول نمونه برای تست صفحه جزئیات.", sort_order: 1 },
  { company_id: cid, name: `[SEED] محصول ثانویه ${cid}`, tagline: "نسخه سبک", description: "نسخه سبک‌تر برای بازار کوچک.", sort_order: 2 },
];

// image_url points at an external placeholder service rather than Supabase
// storage, so these rows render a real image with no separate file upload
// step — good enough to exercise the "/about" page's multi-section layout.
// Swap for real uploaded images (via /admin/about) whenever real content is
// ready; this is dev/demo data only (guarded by the NODE_ENV check above).
const aboutSections = [
  {
    section_key: "seed-intro", title: "[SEED] معرفی اطلس",
    body: "اطلس، سکوی هوشمند شبکه ملی پارک‌های فناوری ایران است. شرکت‌ها، محصولات و ظرفیت‌های فناورانه کشور را در یک نمایشگاه مجازی هوشمند کشف کنید.",
    image_url: "https://placehold.co/800x450/eb212f/ffffff?text=Atlas+Intro", video_url: null, video_url_2: null,
    sort_order: 1, is_active: true,
  },
  {
    section_key: "seed-team", title: "[SEED] تیم ما",
    body: "تیمی از متخصصان فناوری اطلاعات و ارتباطات که با هدف معرفی توانمندی‌های پارک‌های فناوری ایران گرد هم آمده‌اند.",
    image_url: "https://placehold.co/800x450/1f7fd6/ffffff?text=Our+Team", video_url: null, video_url_2: null,
    sort_order: 2, is_active: true,
  },
  {
    section_key: "seed-vision", title: "[SEED] چشم‌انداز",
    body: "ایجاد شبکه‌ای یکپارچه از دانش و فناوری برای توسعه اقتصاد دانش‌بنیان کشور.",
    image_url: "https://placehold.co/800x450/00a858/ffffff?text=Vision", video_url: null, video_url_2: null,
    sort_order: 3, is_active: true,
  },
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

  console.log("Seeding about sections…");
  // about_sections has no unique constraint on section_key either, so the
  // same wipe-then-insert approach as products above.
  await sb.from("about_sections").delete().like("title", "[SEED]%");
  const { error: aboutError } = await sb.from("about_sections").insert(aboutSections);
  if (aboutError) throw new Error(`insert about_sections: ${aboutError.message}`);
  console.log(`  ✓ about_sections: ${aboutSections.length} rows`);

  console.log("\nDone. Run `bun dev` and open http://localhost:8080/exhibition (or /about for the sample sections)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
