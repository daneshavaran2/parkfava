// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon, RobotFace, colorVar, toFa } from "./primitives";

function buildKnowledge() {
  const { COMPANIES, PARKS, CATEGORIES } = window.FAVA;
  const lines = [];
  lines.push("شاخه‌های فناوری: " + CATEGORIES.map((c) => `${c.title} (${c.companies} شرکت)`).join("، "));
  lines.push("پارک‌ها: " + PARKS.map((p) => `${p.name} در ${p.city} (${p.companies} شرکت، ${p.jobs} شغل)`).join("، "));
  lines.push("شرکت‌های پارک فاوا:");
  COMPANIES.forEach((c) => {
    const cat = CATEGORIES.find((x) => x.id === c.category);
    lines.push(`- ${c.name} | حوزه: ${cat ? cat.title : ""} | زمینه: ${c.tagline}` +
      (c.workers ? ` | نیرو: ${c.workers} نفر` : "") +
      (c.founded ? ` | تأسیس: ${c.founded}` : "") +
      (c.contact && c.contact.website ? ` | سایت: ${c.contact.website}` : ""));
  });
  return lines.join("\n");
}

function localSearch(q) {
  const { COMPANIES, CATEGORIES } = window.FAVA;
  const norm = (s) => (s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();
  const terms = norm(q).split(/[\s،,]+/).filter((t) => t.length > 1);
  const scored = COMPANIES.map((c) => {
    const hay = norm([c.name, c.tagline, c.city, (c.products || []).join(" "), (c.tags || []).join(" "),
      (CATEGORIES.find((x) => x.id === c.category) || {}).title].join(" "));
    let score = 0;
    terms.forEach((t) => { if (hay.includes(t)) score += 1; });
    return { c, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, 4).map((x) => x.c);
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
    { role: "bot", text: "سلام! من دستیار هوشمند فاوا هستم. می‌توانید درباره شرکت‌ها، محصولات، پارک‌های فناوری یا آمار شبکه از من بپرسید.", chips: [] },
  ]);
  const bodyRef = useRef(null);
  const quick = ["شرکت‌های هوش مصنوعی", "فناوران مشهد", "پرفروش‌ترین شرکت", "پارک‌های فعال"];

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs, busy, open]);

  async function ask(q) {
    if (!q || !q.trim() || busy || typeof window === "undefined" || !window.FAVA) return;
    const question = q.trim();
    setInput("");
    setMsgs((m) => [...m, { role: "me", text: question }]);
    setBusy(true);

    const matches = localSearch(question);
    let answer = "";
    try {
      if (window.claude && window.claude.complete) {
        const prompt = [
          "تو دستیار هوشمند پلتفرم «شبکه فناوری فاوا» هستی؛ یک نمایشگاه مجازی پارک‌های علم و فناوری ایران.",
          "فقط بر اساس داده‌های زیر و به زبان فارسی، کوتاه (حداکثر سه جمله)، دقیق و دوستانه پاسخ بده. اگر داده‌ای نبود صادقانه بگو.",
          "\nداده‌ها:\n" + buildKnowledge(),
          "\nپرسش کاربر: " + question,
        ].join("\n");
        answer = await window.claude.complete(prompt);
      }
    } catch (e) { answer = ""; }

    if (!answer) {
      if (matches.length) {
        answer = `${toFa(matches.length)} مورد مرتبط پیدا کردم. می‌توانید روی هر کدام بزنید تا پروفایل کامل، محصولات و راه ارتباطی را ببینید.`;
      } else {
        answer = "مورد دقیقی پیدا نکردم. می‌توانید نام حوزه فناوری، شهر یا محصول را امتحان کنید — مثلاً «رباتیک» یا «اصفهان».";
      }
    }
    setMsgs((m) => [...m, { role: "bot", text: answer.trim(), chips: matches.map((c) => ({ id: c.id, name: c.name, color: c.color })) }]);
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
            <div><b>دستیار هوشمند فاوا</b><span className="mono">AI · آنلاین</span></div>
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
