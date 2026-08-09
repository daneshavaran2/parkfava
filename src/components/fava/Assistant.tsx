// @ts-nocheck
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Icon, RobotFace, colorVar, pickName } from "./primitives";
import { fetchExhibitionCompanies } from "@/lib/exhibition-api";
import { fetchAssistantAnswer } from "@/lib/assistant-api";

const LazyRobotFabLottie = lazy(() =>
  import("./RobotFabLottie").then((m) => ({ default: m.RobotFabLottie })),
);

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

  // ask() is async and can outlive the render that created it — read live
  // company data through a ref, not the closured const above, which freezes
  // at call time.
  const companiesRef = useRef(companies);
  companiesRef.current = companies;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, open]);

  async function ask(q) {
    if (!q || !q.trim() || busy) return;
    const question = q.trim();
    setInput("");
    setMsgs((m) => [...m, { role: "me", text: question }]);
    setBusy(true);

    // Last few turns of conversation give the AI multi-turn context (e.g.
    // "و آدرسش کجاست؟" referring back to the previous answer).
    const history = msgs
      .filter((m) => m.role === "me" || m.role === "bot")
      .slice(-6)
      .map((m) => ({ role: m.role === "me" ? "user" : "assistant", content: m.text }));

    try {
      const { answer, companyIds } = await fetchAssistantAnswer(question, history);
      const liveCompanies = companiesRef.current;
      const chips = (companyIds || [])
        .map((id) => liveCompanies.find((c) => c.company_id === id))
        .filter(Boolean)
        .map((c) => ({ id: c.company_id, name: pickName(c, i18n.language), color: "blue" }));
      setMsgs((m) => [...m, { role: "bot", text: answer, chips }]);
    } catch (e) {
      // The server throws RATE_LIMITED when a caller has used up their
      // allowance — worth its own message, since "try again shortly" would
      // otherwise read as a fault rather than a deliberate limit.
      const limited = String(e?.message ?? e).includes("RATE_LIMITED");
      const text = t(limited ? "assistant.rate_limited" : "assistant.ai_error");
      setMsgs((m) => [...m, { role: "bot", text, chips: [] }]);
    } finally {
      setBusy(false);
    }
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
              <Suspense fallback={<RobotFace size={42} />}>
                <LazyRobotFabLottie size={42} />
              </Suspense>
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
                  <Suspense fallback={<RobotFace size={26} />}>
                    <LazyRobotFabLottie size={26} />
                  </Suspense>
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
                <Suspense fallback={<RobotFace size={26} talking />}>
                  <LazyRobotFabLottie size={26} />
                </Suspense>
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
