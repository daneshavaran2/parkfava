import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, hasDb } from "../../db/connection";
import { getActiveParks } from "./parks.functions";
import { searchCompanies, searchParks, terms } from "./assistant/match";
import { askOpenRouter } from "./assistant-ai.server";
import { clientKey, enforceRateLimit } from "./rate-limit.server";
import type { ExhibitionCompany, ExhibitionProduct } from "@/lib/exhibition-api";

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

const askSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(historyTurnSchema).max(8).optional(),
});

// How many companies the AI is given context about. The model only ever
// needs a handful to answer well, and this is also what bounds the size of
// the follow-up product query.
const MAX_CANDIDATES = 20;
// A question is split into terms; an unusually wordy one would otherwise
// build a query with one OR-clause per word.
const MAX_TERMS = 8;

/**
 * Finds companies worth telling the AI about, filtering inside Postgres via
 * the trigram-indexed `search_text` columns (0004_scale_and_integrity.sql)
 * rather than loading every company and product into Node and scanning them
 * in JavaScript. A company matches if its own text matches any term, or if
 * one of its products does.
 */
async function findCandidateCompanies(question: string): Promise<ExhibitionCompany[]> {
  const t = terms(question).slice(0, MAX_TERMS);
  if (!t.length || !hasDb()) return [];
  const sql = getDb();

  // Composed as one parameterized LIKE per term (`search_text LIKE $n`) so
  // the GIN trigram index is usable — a pattern built row-by-row from an
  // unnest() would not be.
  const anyTermMatches = (column: ReturnType<typeof sql>) =>
    t
      .map((term) => sql`${column} LIKE ${"%" + term + "%"}`)
      .reduce((acc, clause) => sql`${acc} OR ${clause}`);

  // The two sources are UNIONed rather than OR'd together in one WHERE.
  // Written as `company_text_matches OR EXISTS (product subquery)`, Postgres
  // cannot use a bitmap scan for the company side and falls back to filtering
  // every published row by hand (measured: 20k rows scanned, ~38ms). As a
  // UNION each branch is an independent indexed lookup (~1.6ms) — same rows,
  // an order of magnitude cheaper.
  return await sql<ExhibitionCompany[]>`
    SELECT c.* FROM exhibition_companies c
    WHERE c.status = 'approved' AND c.is_active = true
      AND c.company_id IN (
        SELECT company_id FROM exhibition_companies WHERE ${anyTermMatches(sql`search_text`)}
        UNION
        SELECT company_id FROM exhibition_products  WHERE ${anyTermMatches(sql`search_text`)}
      )
    ORDER BY c.sort_order ASC
    LIMIT ${MAX_CANDIDATES}
  `;
}

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((i) => askSchema.parse(i))
  .handler(async ({ data }) => {
    // Public, unauthenticated, and it spends money on every call — so the
    // throttle comes first, before any database or OpenRouter work. Two
    // layers: per-caller fairness, plus a global ceiling that caps the worst
    // case for the API budget even under a distributed flood.
    if (hasDb()) {
      await enforceRateLimit(`assistant:${clientKey()}`, { limit: 15, windowSeconds: 300 });
      await enforceRateLimit("assistant:global", { limit: 300, windowSeconds: 3600 });
    }

    // Without a database the assistant still answers — just from general
    // knowledge, with no live exhibition context attached.
    const [companies, parks] = await Promise.all([
      findCandidateCompanies(data.question).catch(() => [] as ExhibitionCompany[]),
      hasDb() ? getActiveParks().catch(() => []) : Promise.resolve([]),
    ]);

    // Only the shortlisted companies' products — not the whole table.
    const candidateIds = companies.map((c) => c.company_id);
    const sql = hasDb() ? getDb() : null;
    const products = candidateIds.length && sql
      ? await sql<ExhibitionProduct[]>`
          SELECT * FROM exhibition_products
          WHERE company_id IN ${sql(candidateIds)}
          ORDER BY sort_order ASC
        `
      : [];

    const productsByCompany = new Map<string, ExhibitionProduct[]>();
    products.forEach((p) => {
      if (!productsByCompany.has(p.company_id)) productsByCompany.set(p.company_id, []);
      productsByCompany.get(p.company_id)!.push(p);
    });
    const parkById = new Map(parks.map((p) => [p.park_id, p]));

    // Postgres narrowed the field; this ranks what's left. Running the same
    // scoring as before, just over ~20 rows instead of the entire table.
    const companyMatches = searchCompanies(data.question, companies, productsByCompany);
    const parkMatches = companyMatches.length ? [] : searchParks(data.question, parks);

    const contextLines: string[] = [];
    companyMatches.forEach(({ c, matchedProducts }) => {
      const headcount = [c.headcount_full_time, c.headcount_part_time].filter((n) => n != null)
        .length
        ? `${c.headcount_full_time ?? 0} تمام‌وقت / ${c.headcount_part_time ?? 0} پاره‌وقت`
        : "-";
      const park = c.park_id ? parkById.get(c.park_id) : null;
      const allProducts = productsByCompany.get(c.company_id) ?? [];
      const productsList =
        (matchedProducts.length ? matchedProducts : allProducts)
          .map((p) =>
            [p.name, p.description, p.link_url ? `لینک: ${p.link_url}` : null]
              .filter(Boolean)
              .join(" — "),
          )
          .join("، ") || "-";
      contextLines.push(
        [
          `شرکت: ${c.name}${c.name_en ? " / " + c.name_en : ""}`,
          `شعار: ${c.tagline ?? "-"}`,
          `شهر: ${c.city ?? "-"}`,
          `پارک فناوری: ${park ? `${park.name}${park.province ? " — " + park.province : ""}` : "-"}`,
          `حوزه: ${c.category ?? "-"}`,
          `معرفی کوتاه: ${c.description ?? "-"}`,
          `معرفی کامل: ${c.intro ?? "-"}`,
          `بنیان‌گذاران: ${c.founders ?? "-"}`,
          `سال تاسیس: ${c.founded_at ?? "-"}`,
          `نیروی انسانی: ${headcount}`,
          `پتانسیل صادراتی: ${c.export_potential ?? "-"}`,
          `محصولات دانش‌بنیان: ${c.knowledge_products_intro ?? "-"}`,
          `محصولات: ${productsList}`,
          `تلفن: ${c.phone ?? "-"}`,
          `ایمیل: ${c.email ?? "-"}`,
          `آدرس: ${c.address ?? "-"}`,
          `وبسایت: ${c.website ?? "-"}`,
          `لینکدین: ${c.linkedin_url ?? "-"}`,
          `کاتالوگ: ${c.catalog_url ?? "-"}`,
          `ویدیوی معرفی: ${c.video_url ?? "-"}`,
        ].join(" | "),
      );
    });
    parkMatches.forEach((p) => {
      contextLines.push(
        `پارک: ${p.name} | شهر: ${p.city ?? p.province ?? "-"} | تعداد شرکت‌ها: ${p.companies_hint ?? "-"}`,
      );
    });

    const systemPrompt = [
      "شما دستیار هوشمند «پارک فاوا» هستید؛ پلتفرم نمایشگاهی شرکت‌های دانش‌بنیان و پارک‌های علم و فناوری ایران.",
      "به همان زبانی که کاربر پیام می‌دهد (فارسی یا انگلیسی) پاسخ بده؛ کوتاه، دوستانه و دقیق باش. برای تاکید روی نام شرکت‌ها/پارک‌ها از **دو ستاره** دور کلمه استفاده کن.",
      "برای هر ادعای مشخص درباره‌ی یک شرکت یا پارک (نام، آدرس، محصول، وبسایت و مانند آن) فقط از «داده‌های زنده» زیر استفاده کن و هیچ جزئیاتی درباره‌ی شرکت‌ها یا پارک‌های داخل این نمایشگاه که در داده‌ها نیامده، نساز.",
      contextLines.length
        ? "داده‌های زنده مرتبط با سوال کاربر:\n" + contextLines.join("\n")
        : "برای این سوال داده‌ی زنده‌ی مرتبطی در نمایشگاه پیدا نشد.",
      "اگر داده‌ی مرتبطی بالا وجود ندارد یا سوال کاربر عمومی‌تر/کلی‌تر از دیتای نمایشگاه است، از دانش عمومی خودت برای کمک به کاربر استفاده کن؛ فقط درباره‌ی خود شرکت‌ها/پارک‌های این نمایشگاه چیزی که در داده نیامده اختراع نکن.",
    ].join("\n\n");

    const history = (data.history ?? []).map((h) => ({ role: h.role, content: h.content }));
    const answer = await askOpenRouter(systemPrompt, history, data.question);

    return { answer, companyIds: companyMatches.map(({ c }) => c.company_id) };
  });
