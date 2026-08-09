import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getExhibitionCompanies, getPublicExhibitionProducts } from "./exhibition-api.functions";
import { getActiveParks } from "./parks.functions";
import { searchCompanies, searchParks } from "./assistant/match";
import { askOpenRouter } from "./assistant-ai.server";
import type { ExhibitionProduct } from "@/lib/exhibition-api";

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

const askSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(historyTurnSchema).max(8).optional(),
});

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((i) => askSchema.parse(i))
  .handler(async ({ data }) => {
    const companies = await getExhibitionCompanies();
    const companyIds = companies.map((c) => c.company_id);
    const [products, parks] = await Promise.all([
      getPublicExhibitionProducts({ data: { companyIds } }),
      getActiveParks(),
    ]);

    const productsByCompany = new Map<string, ExhibitionProduct[]>();
    products.forEach((p) => {
      if (!productsByCompany.has(p.company_id)) productsByCompany.set(p.company_id, []);
      productsByCompany.get(p.company_id)!.push(p);
    });

    const companyMatches = searchCompanies(data.question, companies, productsByCompany);
    const parkMatches = companyMatches.length ? [] : searchParks(data.question, parks);

    const contextLines: string[] = [];
    companyMatches.forEach(({ c, matchedProducts }) => {
      const headcount = [c.headcount_full_time, c.headcount_part_time]
        .filter((n) => n != null)
        .length
        ? `${c.headcount_full_time ?? 0} تمام‌وقت / ${c.headcount_part_time ?? 0} پاره‌وقت`
        : "-";
      const products = matchedProducts.length
        ? matchedProducts.map((p) => `${p.name}${p.description ? " (" + p.description + ")" : ""}`).join("، ")
        : "-";
      contextLines.push(
        [
          `شرکت: ${c.name}${c.name_en ? " / " + c.name_en : ""}`,
          `شعار: ${c.tagline ?? "-"}`,
          `شهر: ${c.city ?? "-"}`,
          `حوزه: ${c.category ?? "-"}`,
          `معرفی: ${c.description ?? c.intro ?? "-"}`,
          `بنیان‌گذاران: ${c.founders ?? "-"}`,
          `سال تاسیس: ${c.founded_at ?? "-"}`,
          `نیروی انسانی: ${headcount}`,
          `پتانسیل صادراتی: ${c.export_potential ?? "-"}`,
          `محصولات دانش‌بنیان: ${c.knowledge_products_intro ?? "-"}`,
          `محصولات: ${products}`,
          `وبسایت: ${c.website ?? "-"}`,
          `لینکدین: ${c.linkedin_url ?? "-"}`,
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
