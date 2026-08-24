/**
 * Local development seed script.
 *
 * Populates the database with a small, realistic dataset so a fresh checkout
 * can drive the UI, the admin panels, and the e2e/visual suites without
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
import postgres from "postgres";
import { config } from "dotenv";

config();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed against a production environment.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(url, { ssl: url.includes("sslmode=require") ? "require" : false });

// `color` is a palette key, not a CSS colour: primitives.tsx's colorVar()
// looks it up in the four-logo-colour map and falls back to the generic
// accent for anything it doesn't recognise, so a hex value here would
// silently render every park in the same colour.
//
// name_en demonstrates the optional English-name field admins can fill in per
// company/park (primitives.tsx's pickName()) — shown on the public site
// whenever the visitor switches the language to English.
const parks = [
  { park_id: "tehran",  name: "[SEED] پارک فناوری تهران",  name_en: "[SEED] Tehran Technology Park",   province: "تهران",       city: "تهران",  mx: 52, my: 45, color: "blue",  jobs: 4500, area: 84, is_active: true, sort_order: 1 },
  { park_id: "isfahan", name: "[SEED] پارک فناوری اصفهان", name_en: "[SEED] Isfahan Technology Park",  province: "اصفهان",      city: "اصفهان", mx: 46, my: 55, color: "green", jobs: 2100, area: 45, is_active: true, sort_order: 2 },
  { park_id: "mashhad", name: "[SEED] پارک فناوری خراسان", name_en: "[SEED] Khorasan Technology Park", province: "خراسان رضوی", city: "مشهد",   mx: 68, my: 30, color: "gold",  jobs: 1400, area: 32, is_active: true, sort_order: 3 },
  { park_id: "shiraz",  name: "[SEED] پارک فناوری فارس",   name_en: "[SEED] Fars Technology Park",     province: "فارس",        city: "شیراز",  mx: 44, my: 72, color: "red",   jobs:  900, area: 20, is_active: true, sort_order: 4 },
];

// Coordinates are real city centres so the map, the "directions" buttons, and
// scripts/test-directions-e2e.py all have something to work with — that test
// skips itself entirely when no seeded company has lat/lng.
//
// The long-form fields (intro, founders, export_potential, headcount_*) are
// populated because the assistant feeds them to the model as ground truth;
// seeding them keeps that path exercised rather than always falling back to
// "-" in local testing.
const companies = [
  {
    company_id: "seed-alpha", park_id: "tehran", name: "[SEED] آلفا سیستم", name_en: "[SEED] Alpha Systems",
    category: "نرم‌افزار", city: "تهران", status: "approved", is_active: true, sort_order: 1,
    tagline: "پلتفرم مدیریت پروژه", description: "شرکت نمونه برای تست رابط کاربری.",
    intro: "آلفا سیستم در سال ۱۳۹۴ با هدف توسعه ابزارهای همکاری تیمی تاسیس شد و امروز روی پلتفرم‌های مدیریت پروژه سازمانی تمرکز دارد.",
    founders: "مریم احمدی، رضا کاظمی", founded_at: "2015-04-21",
    headcount_full_time: 38, headcount_part_time: 6,
    export_potential: "امکان عرضه نسخه چندزبانه در بازار کشورهای همسایه.",
    knowledge_products_intro: "پلتفرم دانش‌بنیان مدیریت پروژه و گردش کار سازمانی.",
    website: "https://example.com/alpha", email: "info@alpha.example.com", phone: "02100000001",
    address: "تهران، پارک فناوری اطلاعات و ارتباطات", linkedin_url: "https://linkedin.com/company/example-alpha",
    latitude: 35.7219, longitude: 51.3347,
  },
  {
    company_id: "seed-beta", park_id: "tehran", name: "[SEED] بتا هوش", name_en: "[SEED] Beta AI",
    category: "هوش مصنوعی", city: "تهران", status: "approved", is_active: true, sort_order: 2,
    tagline: "راهکارهای بینایی ماشین", description: "شرکت نمونه در حوزه بینایی ماشین.",
    intro: "بتا هوش روی سامانه‌های بازرسی بصری خودکار برای خطوط تولید کار می‌کند.",
    founders: "سارا موسوی", founded_at: "2018-09-23",
    headcount_full_time: 21, headcount_part_time: 9,
    export_potential: "قابلیت ارائه به صنایع تولیدی منطقه.",
    knowledge_products_intro: "سامانه دانش‌بنیان بازرسی بصری مبتنی بر یادگیری عمیق.",
    website: "https://example.com/beta", email: "info@beta.example.com", phone: "02100000002",
    address: "تهران، پارک فناوری اطلاعات و ارتباطات", linkedin_url: "https://linkedin.com/company/example-beta",
    latitude: 35.7448, longitude: 51.3753,
  },
  {
    company_id: "seed-gamma", park_id: "isfahan", name: "[SEED] گاما رباتیک", name_en: "[SEED] Gamma Robotics",
    category: "رباتیک", city: "اصفهان", status: "approved", is_active: true, sort_order: 3,
    tagline: "بازوهای رباتیک صنعتی", description: "شرکت نمونه در حوزه رباتیک.",
    intro: "گاما رباتیک بازوهای رباتیک شش‌درجه‌آزادی برای مونتاژ دقیق طراحی و تولید می‌کند.",
    founders: "حسین نادری، الهام رستمی", founded_at: "2016-06-11",
    headcount_full_time: 45, headcount_part_time: 4,
    export_potential: "صادرات بازوی رباتیک به بازار عراق و افغانستان.",
    knowledge_products_intro: "بازوی رباتیک صنعتی دانش‌بنیان با کنترلر بومی.",
    website: "https://example.com/gamma", email: "info@gamma.example.com", phone: "03100000003",
    address: "اصفهان، شهرک علمی و تحقیقاتی", linkedin_url: "https://linkedin.com/company/example-gamma",
    latitude: 32.6539, longitude: 51.6660,
  },
  {
    company_id: "seed-delta", park_id: "mashhad", name: "[SEED] دلتا انرژی", name_en: "[SEED] Delta Energy",
    category: "انرژی سبز", city: "مشهد", status: "pending", is_active: false, sort_order: 4,
    tagline: "پنل‌های خورشیدی هوشمند", description: "شرکت نمونه در حال بررسی — نباید در نمایشگاه عمومی دیده شود.",
    intro: "دلتا انرژی روی پنل‌های خورشیدی با ردیاب خورشید کار می‌کند.",
    founders: "کاوه شریفی", founded_at: "2020-02-15",
    headcount_full_time: 12, headcount_part_time: 3,
    export_potential: "ندارد.", knowledge_products_intro: "پنل خورشیدی هوشمند.",
    website: "https://example.com/delta", email: "info@delta.example.com", phone: "05100000004",
    address: "مشهد، پارک علم و فناوری خراسان", linkedin_url: null,
    latitude: 36.2972, longitude: 59.6067,
  },
  {
    company_id: "seed-epsilon", park_id: "shiraz", name: "[SEED] اپسیلون طب", name_en: "[SEED] Epsilon Medical",
    category: "تجهیزات پزشکی", city: "شیراز", status: "approved", is_active: true, sort_order: 5,
    tagline: "تجهیزات تشخیصی", description: "شرکت نمونه در حوزه تجهیزات پزشکی.",
    intro: "اپسیلون طب تجهیزات تشخیص آزمایشگاهی قابل حمل تولید می‌کند.",
    founders: "نگار فتحی، امیر صادقی", founded_at: "2017-11-05",
    headcount_full_time: 27, headcount_part_time: 11,
    export_potential: "ثبت محصول در بازارهای منطقه در دست اقدام.",
    knowledge_products_intro: "دستگاه تشخیص آزمایشگاهی قابل حمل دانش‌بنیان.",
    website: "https://example.com/epsilon", email: "info@epsilon.example.com", phone: "07100000005",
    address: "شیراز، پارک علم و فناوری فارس", linkedin_url: "https://linkedin.com/company/example-epsilon",
    latitude: 29.5918, longitude: 52.5837,
  },
  {
    company_id: "seed-zeta", park_id: "isfahan", name: "[SEED] زتا نانو", name_en: "[SEED] Zeta Nano",
    category: "نانو", city: "اصفهان", status: "draft", is_active: false, sort_order: 6,
    tagline: "پوشش‌های نانوساختار", description: "پیش‌نویس شرکت — نباید در نمایشگاه عمومی دیده شود.",
    intro: "زتا نانو روی پوشش‌های ضدخوردگی نانوساختار کار می‌کند.",
    founders: "بهنام یزدانی", founded_at: "2021-07-19",
    headcount_full_time: 8, headcount_part_time: 2,
    export_potential: "ندارد.", knowledge_products_intro: "پوشش نانوساختار ضدخوردگی.",
    website: null, email: null, phone: null,
    address: "اصفهان، شهرک علمی و تحقیقاتی", linkedin_url: null,
    latitude: null, longitude: null,
  },
];

const productsFor = (cid: string) => [
  {
    company_id: cid, name: `[SEED] محصول اصلی ${cid}`,
    description: "محصول نمونه برای تست صفحه جزئیات. شرح کوتاه، کاربردها و وضعیت تجاری‌سازی در همین فیلد نگه‌داری می‌شود.",
    link_url: "https://example.com/product", image_url: null, video_url: null, catalog_url: null, sort_order: 1,
  },
  {
    company_id: cid, name: `[SEED] محصول ثانویه ${cid}`,
    description: "نسخه سبک‌تر برای بازار کوچک.",
    link_url: null, image_url: null, video_url: null, catalog_url: null, sort_order: 2,
  },
];

// image_url points at an external placeholder service rather than local
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

/**
 * Multi-row upsert keyed on a natural id. Column names come from the literals
 * above, never from input, so interpolating them into the SET clause is safe.
 */
async function upsert(table: string, rows: Record<string, unknown>[], conflict: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  const setClause = cols
    .filter((c) => c !== conflict)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  await sql`
    INSERT INTO ${sql(table)} ${sql(rows, ...cols)}
    ON CONFLICT (${sql(conflict)}) DO UPDATE SET ${sql.unsafe(setClause)}
  `;
  console.log(`  ✓ ${table}: ${rows.length} rows`);
}

/** Wipe-then-insert for tables with no natural unique key to conflict on. */
async function replaceSeedRows(
  table: string,
  taggedColumn: string,
  rows: Record<string, unknown>[],
) {
  await sql`DELETE FROM ${sql(table)} WHERE ${sql(taggedColumn)} LIKE '[SEED]%'`;
  if (rows.length) await sql`INSERT INTO ${sql(table)} ${sql(rows, ...Object.keys(rows[0]!))}`;
  console.log(`  ✓ ${table}: ${rows.length} rows`);
}

async function main() {
  console.log("Seeding parks…");
  await upsert("parks", parks, "park_id");

  console.log("Seeding park content…");
  await upsert(
    "park_content",
    parks.map((p) => ({
      park_id: p.park_id,
      display_name: p.name,
      description: "متن معرفی نمونه برای این پارک فناوری.",
      logo_url: null,
    })),
    "park_id",
  );

  console.log("Seeding companies…");
  await upsert("exhibition_companies", companies, "company_id");

  console.log("Seeding products…");
  await replaceSeedRows(
    "exhibition_products",
    "name",
    companies.flatMap((c) => productsFor(c.company_id)),
  );

  console.log("Seeding about sections…");
  await replaceSeedRows("about_sections", "title", aboutSections);

  console.log(
    "\nDone. Run `bun dev` and open http://localhost:8080/exhibition (or /about for the sample sections)",
  );
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
