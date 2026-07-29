// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Icon, RobotFace, colorVar, toFa } from "./primitives";
import { fetchExhibitionCompanies, fetchPublicExhibitionProducts } from "@/lib/exhibition-api";
import { fetchActiveParks } from "@/lib/parks-api";

function norm(s) {
  return (s || "").toString().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").toLowerCase();
}

function terms(q) {
  return norm(q).split(/[\s،,]+/).filter((t) => t.length > 1);
}

// Only ever answers from what's actually live in the exhibition database
// (approved + active companies/products, active parks) — never invents or
// guesses. If nothing in the system matches, it says so plainly instead of
// fabricating a plausible-sounding answer.
function searchCompanies(question, companies, productsByCompany) {
  const t = terms(question);
  if (!t.length) return [];
  return companies
    .map((c) => {
      const myProducts = productsByCompany.get(c.company_id) || [];
      const hay = norm([c.name, c.tagline, c.city, c.category, c.description].join(" "));
      let score = 0;
      const matchedProducts = [];
      t.forEach((term) => {
        if (hay.includes(term)) score += 1;
        myProducts.forEach((p) => {
          if (norm(p.name).includes(term) && !matchedProducts.includes(p)) { matchedProducts.push(p); score += 1; }
        });
      });
      return { c, score, matchedProducts };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function searchParks(question, parks) {
  const t = terms(question);
  if (!t.length) return [];
  const matched = parks.filter((p) => {
    const hay = norm([p.name, p.city, p.province].join(" "));
    return t.some((term) => hay.includes(term));
  });
  if (matched.length) return matched.slice(0, 4);
  // "پارک‌های فعال" / "چه پارک‌هایی" — no specific park named, but the
  // question is clearly about parks in general.
  if (norm(question).includes("پارک")) return parks.slice(0, 6);
  return [];
}

function describeCompany({ c, matchedProducts }) {
  const bits = [`**${c.name}**${c.tagline ? " — " + c.tagline : ""}`];
  const meta = [];
  if (c.city) meta.push(`شهر: ${c.city}`);
  if (c.founded_at) {
    const y = new Date(c.founded_at).getFullYear();
    if (!Number.isNaN(y)) meta.push(`تأسیس: ${toFa(y)}`);
  }
  const headcount = (c.headcount_full_time || 0) + (c.headcount_part_time || 0);
  if (headcount) meta.push(`نیرو: ${toFa(headcount)} نفر`);
  if (meta.length) bits.push(meta.join(" | "));
  if (matchedProducts.length) bits.push("محصولات: " + matchedProducts.slice(0, 4).map((p) => p.name).join("، "));
  if (c.website) bits.push(`وب‌سایت: ${c.website}`);
  return bits.join("\n");
}

function describePark(p) {
  return `**${p.name}** — ${p.city || p.province || ""}${p.companies_hint ? ` | ${toFa(p.companies_hint)} شرکت` : ""}`;
}

function buildAnswer(question, companyResults, parkResults) {
  if (companyResults.length) {
    const head = companyResults.length === 1
      ? "این مورد را در سامانه پیدا کردم:"
      : `${toFa(companyResults.length)} مورد مرتبط در سامانه پیدا کردم:`;
    return head + "\n\n" + companyResults.map(describeCompany).join("\n\n");
  }
  if (parkResults.length) {
    const head = parkResults.length === 1 ? "این پارک را در سامانه پیدا کردم:" : "پارک‌های ثبت‌شده در سامانه:";
    return head + "\n\n" + parkResults.map(describePark).join("\n");
  }
  return "چیزی با این عنوان در سامانه ثبت نشده — از دقیق‌بودن اطلاعات مطمئن نیستم، پس ترجیح می‌دهم بگویم پیدا نکردم تا اطلاعات نادرست ندهم. می‌توانید نام حوزه فناوری، شهر یا محصول را امتحان کنید.";
}

function renderRich(text) {
  const lines = String(text).split(/\n/);
  return lines.map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
    return (
      <span key={li}>
        {parts.map((p, pi) => {
          if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={pi}>{p.slice(2, -2)}</strong>;
          if (/^\*[^*]+\*$/.test(p)) return <em key={pi}>{p.slice(1, -1)}</em>;
          return <span key={pi}>{p}</span>;
        })}
        {li < lines.length - 1 && <br />}
      </span>
    );
  });
}

export function Assistant() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([
    { role: "bot", text: "سلام! من دستیار هوشمند فاوا هستم. هر چه بپرسید فقط از روی اطلاعات واقعی ثبت‌شده در سامانه (شرکت‌ها، محصولات و پارک‌ها) پاسخ می‌دهم.", chips: [] },
  ]);
  const bodyRef = useRef(null);
  const quick = ["شرکت‌های هوش مصنوعی", "شرکت‌های مشهد", "پارک‌های فعال", "اینترنت اشیا"];

  const companiesQ = useQuery({
    queryKey: ["exh-public"],
    queryFn: fetchExhibitionCompanies,
    staleTime: 30_000,
    enabled: open,
  });
  const companies = companiesQ.data ?? [];
  const companyIds = companies.map((c) => c.company_id);
  const productsQ = useQuery({
    queryKey: ["exh-public-all-products", companyIds.join(",")],
    queryFn: () => fetchPublicExhibitionProducts(companyIds),
    staleTime: 30_000,
    enabled: open && companyIds.length > 0,
  });
  const products = productsQ.data ?? [];
  const parksQ = useQuery({
    queryKey: ["parks-active"],
    queryFn: fetchActiveParks,
    staleTime: 30_000,
    enabled: open,
  });
  const parks = parksQ.data ?? [];
  // Products only start fetching once we know which companies exist, so its
  // own isLoading is false-but-meaningless before that — fold it in only
  // once companies has resolved.
  const dataLoading = companiesQ.isLoading || parksQ.isLoading
    || (companyIds.length > 0 && productsQ.isLoading);

  // ask() is async and can outlive the render that created it (it may need
  // to wait for in-flight queries) — read live data through refs, not the
  // closured consts above, which freeze at call time.
  const liveRef = useRef({ companies, products, parks, dataLoading });
  liveRef.current = { companies, products, parks, dataLoading };

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs, busy, open]);

  async function ask(q) {
    if (!q || !q.trim() || busy) return;
    const question = q.trim();
    setInput("");
    setMsgs((m) => [...m, { role: "me", text: question }]);
    setBusy(true);

    if (liveRef.current.dataLoading) {
      // Wait briefly for the live data to finish loading rather than
      // answering "not found" off an empty, still-loading dataset.
      const start = Date.now();
      while (liveRef.current.dataLoading && Date.now() - start < 6000) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    const { companies: liveCompanies, products: liveProducts, parks: liveParks } = liveRef.current;
    const productsByCompany = new Map();
    liveProducts.forEach((p) => {
      if (!productsByCompany.has(p.company_id)) productsByCompany.set(p.company_id, []);
      productsByCompany.get(p.company_id).push(p);
    });
    const companyResults = searchCompanies(question, liveCompanies, productsByCompany);
    const parkResults = companyResults.length ? [] : searchParks(question, liveParks);
    const answer = buildAnswer(question, companyResults, parkResults);
    const chips = companyResults.map(({ c }) => ({ id: c.company_id, name: c.name, color: "blue" }));

    setMsgs((m) => [...m, { role: "bot", text: answer, chips }]);
    setBusy(false);
  }

  return (
    <>
      <button className={"asst-fab" + (open ? " hide" : "")} onClick={() => setOpen(true)} aria-label="دستیار هوشمند">
        <span className="asst-fab-core"><RobotFace size={38} /></span>
        <span className="asst-fab-label">دستیار هوشمند</span>
      </button>

      <div className={"asst-panel" + (open ? " open" : "")} role="dialog" aria-label="دستیار هوشمند فاوا">
        <div className="asst-head">
          <div className="asst-id">
            <span className="asst-avatar"><RobotFace size={42} talking={busy} /></span>
            <div><b>دستیار هوشمند فاوا</b><span className="mono">آنلاین</span></div>
          </div>
          <button className="asst-x" onClick={() => setOpen(false)} aria-label="بستن"><Icon name="close" size={18} /></button>
        </div>

        <div className="asst-body" ref={bodyRef} role="log" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={"asst-msg " + m.role}>
              {m.role === "bot" && <span className="asst-mini"><RobotFace size={26} /></span>}
              <div className="asst-bubble">
                {m.role === "bot" ? renderRich(m.text) : m.text}
                {m.chips && m.chips.length > 0 && (
                  <div className="asst-results">
                    {m.chips.map((ch) => (
                      <button key={ch.id} className="asst-res" style={{ "--cc": colorVar(ch.color) }}
                        onClick={() => { navigate({ to: "/company/$id", params: { id: ch.id } }); setOpen(false); }}>
                        <span className="dotc" /> {ch.name} <Icon name="arrowL" size={13} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="asst-msg bot">
              <span className="asst-mini"><RobotFace size={26} talking /></span>
              <div className="asst-bubble"><span className="asst-typing"><i /><i /><i /></span></div>
            </div>
          )}
        </div>

        <div className="asst-quick">
          {quick.map((qz, i) => <button key={i} onClick={() => ask(qz)}>{qz}</button>)}
        </div>
        <form className="asst-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="سؤال خود را بنویسید…" aria-label="پیام" />
          <button type="submit" disabled={busy} aria-label="ارسال"><Icon name="send" size={17} /></button>
        </form>
      </div>
    </>
  );
}
