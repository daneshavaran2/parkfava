// @ts-nocheck
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, RobotFace, colorVar, toFa, pickName } from "./primitives";
import { fetchExhibitionCompanies, fetchPublicExhibitionProducts } from "@/lib/exhibition-api";
import { fetchActiveParks } from "@/lib/parks-api";

const LazyRobotFabLottie = lazy(() =>
  import("./RobotFabLottie").then((m) => ({ default: m.RobotFabLottie })),
);

function norm(s) {
  return (s || "")
    .toString()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, " ")
    .toLowerCase();
}

function terms(q) {
  return norm(q)
    .split(/[\s،,]+/)
    .filter((t) => t.length > 1);
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
      const hay = norm([c.name, c.name_en, c.tagline, c.city, c.category, c.description].join(" "));
      let score = 0;
      const matchedProducts = [];
      t.forEach((term) => {
        if (hay.includes(term)) score += 1;
        myProducts.forEach((p) => {
          if (norm(p.name).includes(term) && !matchedProducts.includes(p)) {
            matchedProducts.push(p);
            score += 1;
          }
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
    const hay = norm([p.name, p.name_en, p.city, p.province].join(" "));
    return t.some((term) => hay.includes(term));
  });
  if (matched.length) return matched.slice(0, 4);
  // "پارک‌های فعال" / "active parks" — no specific park named, but the
  // question is clearly about parks in general (checked in both languages
  // since the UI, and thus the question, can be in English).
  const n = norm(question);
  if (n.includes("پارک") || n.includes("park")) return parks.slice(0, 6);
  return [];
}

function describeCompany(tr, lang, { c, matchedProducts }) {
  const bits = [`**${pickName(c, lang)}**${c.tagline ? " — " + c.tagline : ""}`];
  const meta = [];
  if (c.city) meta.push(`${tr("assistant.label_city")}: ${c.city}`);
  if (c.founded_at) {
    const y = new Date(c.founded_at).getFullYear();
    if (!Number.isNaN(y)) meta.push(`${tr("assistant.label_founded")}: ${toFa(y)}`);
  }
  const headcount = (c.headcount_full_time || 0) + (c.headcount_part_time || 0);
  if (headcount)
    meta.push(
      `${tr("assistant.label_workforce")}: ${toFa(headcount)} ${tr("assistant.workforce_unit")}`,
    );
  if (meta.length) bits.push(meta.join(" | "));
  if (matchedProducts.length)
    bits.push(
      `${tr("assistant.label_products")}: ` +
        matchedProducts
          .slice(0, 4)
          .map((p) => p.name)
          .join("، "),
    );
  if (c.website) bits.push(`${tr("assistant.label_website")}: ${c.website}`);
  return bits.join("\n");
}

function describePark(tr, lang, p) {
  return `**${pickName(p, lang)}** — ${p.city || p.province || ""}${p.companies_hint ? ` | ${toFa(p.companies_hint)} ${tr("assistant.park_companies_unit")}` : ""}`;
}

function buildAnswer(tr, lang, question, companyResults, parkResults) {
  if (companyResults.length) {
    const head =
      companyResults.length === 1
        ? tr("assistant.found_one_company")
        : tr("assistant.found_many_companies", { count: companyResults.length });
    return head + "\n\n" + companyResults.map((r) => describeCompany(tr, lang, r)).join("\n\n");
  }
  if (parkResults.length) {
    const head =
      parkResults.length === 1 ? tr("assistant.found_one_park") : tr("assistant.found_many_parks");
    return head + "\n\n" + parkResults.map((p) => describePark(tr, lang, p)).join("\n");
  }
  return tr("assistant.not_found");
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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([{ role: "bot", text: t("assistant.welcome"), chips: [] }]);
  const bodyRef = useRef(null);
  // Query terms stay Persian regardless of UI language, since they're
  // matched against company/park data that only exists in Persian — only
  // the displayed chip label is translated.
  const quick = [
    { label: t("assistant.quick_ai"), q: "شرکت‌های هوش مصنوعی" },
    { label: t("assistant.quick_mashhad"), q: "شرکت‌های مشهد" },
    { label: t("assistant.quick_parks"), q: "پارک‌های فعال" },
    { label: t("assistant.quick_iot"), q: "اینترنت اشیا" },
  ];

  // Keep the still-untouched welcome message in sync if the user switches
  // language before asking anything; once a real conversation exists, past
  // messages are left as-is rather than retranslated.
  useEffect(() => {
    setMsgs((m) =>
      m.length === 1 && m[0].role === "bot"
        ? [{ role: "bot", text: t("assistant.welcome"), chips: [] }]
        : m,
    );
  }, [t]);

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
  const dataLoading =
    companiesQ.isLoading || parksQ.isLoading || (companyIds.length > 0 && productsQ.isLoading);

  // ask() is async and can outlive the render that created it (it may need
  // to wait for in-flight queries) — read live data through refs, not the
  // closured consts above, which freeze at call time.
  const liveRef = useRef({ companies, products, parks, dataLoading });
  liveRef.current = { companies, products, parks, dataLoading };

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, open]);

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
    const answer = buildAnswer(t, i18n.language, question, companyResults, parkResults);
    const chips = companyResults.map(({ c }) => ({
      id: c.company_id,
      name: pickName(c, i18n.language),
      color: "blue",
    }));

    setMsgs((m) => [...m, { role: "bot", text: answer, chips }]);
    setBusy(false);
  }

  return (
    <>
      <button
        className={"asst-fab" + (open ? " hide" : "")}
        onClick={() => setOpen(true)}
        aria-label={t("assistant.fab_label")}
      >
        <span className="asst-fab-core">
          <Suspense fallback={<RobotFace size={38} />}>
            <LazyRobotFabLottie size={44} />
          </Suspense>
        </span>
        <span className="asst-fab-label">{t("assistant.fab_label")}</span>
      </button>

      <div
        className={"asst-panel" + (open ? " open" : "")}
        role="dialog"
        aria-label={t("assistant.panel_title")}
      >
        <div className="asst-head">
          <div className="asst-id">
            <span className="asst-avatar">
              <RobotFace size={42} talking={busy} />
            </span>
            <div>
              <b>{t("assistant.panel_title")}</b>
              <span className="mono">{t("assistant.online")}</span>
            </div>
          </div>
          <button className="asst-x" onClick={() => setOpen(false)} aria-label={t("common.close")}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="asst-body" ref={bodyRef} role="log" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={"asst-msg " + m.role}>
              {m.role === "bot" && (
                <span className="asst-mini">
                  <RobotFace size={26} />
                </span>
              )}
              <div className="asst-bubble">
                {m.role === "bot" ? renderRich(m.text) : m.text}
                {m.chips && m.chips.length > 0 && (
                  <div className="asst-results">
                    {m.chips.map((ch) => (
                      <button
                        key={ch.id}
                        className="asst-res"
                        style={{ "--cc": colorVar(ch.color) }}
                        onClick={() => {
                          navigate({ to: "/company/$id", params: { id: ch.id } });
                          setOpen(false);
                        }}
                      >
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
              <span className="asst-mini">
                <RobotFace size={26} talking />
              </span>
              <div className="asst-bubble">
                <span className="asst-typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="asst-quick">
          {quick.map((qz, i) => (
            <button key={i} onClick={() => ask(qz.q)}>
              {qz.label}
            </button>
          ))}
        </div>
        <form
          className="asst-input"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("assistant.input_placeholder")}
            aria-label={t("assistant.input_placeholder")}
          />
          <button type="submit" disabled={busy} aria-label={t("assistant.send")}>
            <Icon name="send" size={17} />
          </button>
        </form>
      </div>
    </>
  );
}
