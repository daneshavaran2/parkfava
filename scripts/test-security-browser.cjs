/**
 * Browser-level security tests (docs/Security Report.md):
 *
 *  - Stored XSS: hostile markup stored in every text field of a published
 *    company, one of its products and one of its attachments must render as
 *    text on every page that shows them (public page in both languages,
 *    exhibition listing and search, kiosk, admin editor): no script runs and
 *    no element is injected.
 *  - CSRF: a page on another site (127.0.0.1) and on a sibling of the same
 *    site (another port on localhost, like a sibling subdomain) cannot make a
 *    signed-in browser call a server function.
 *
 * Requires Playwright with Chromium, a disposable database (DATABASE_URL,
 * psql on PATH) and a running server. Never point it at production.
 *
 *   Dev server:        DATABASE_URL=... node scripts/test-security-browser.cjs
 *   Production build:  DATABASE_URL=... BASE_URL=http://localhost:3000 \
 *                          node scripts/test-security-browser.cjs --prod --build .output
 */
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const argv = process.argv.slice(2);
const PROD = argv.includes("--prod");
const BUILD = argv.includes("--build") ? argv[argv.indexOf("--build") + 1] : ".output";
const BASE = (process.env.BASE_URL || (PROD ? "http://localhost:3000" : "http://localhost:8080")).replace(/\/$/, "");
const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error("DATABASE_URL is required (a disposable test database).");
  process.exit(1);
}
const ROOT = path.dirname(__dirname);
const ADMIN = "security-browser-admin@example.test";
const VICTIM = "security-browser-victim@example.test";
const PASSWORD = "Browser#Passw0rd2026";
let checks = 0;
let failures = 0;

function check(label, ok, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  [${detail}]` : ""}`);
}

const psql = (sql) => execFileSync("psql", ["-qtA", DB, "-c", sql]).toString().trim();

function buildIds() {
  const ids = {};
  const pat = /createServerRpc\(\{\s*id:\s*"([0-9a-f]+)",\s*name:\s*"(\w+)",\s*filename:\s*"src\/lib\/([\w.-]+)\.functions\.ts"/g;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".mjs")) for (const m of fs.readFileSync(p, "utf8").matchAll(pat)) ids[`${m[3]}.${m[2]}`] = m[1];
    }
  };
  walk(path.resolve(ROOT, BUILD, "server"));
  return ids;
}
const IDS = PROD ? buildIds() : {};

function fnPath(mod, exp) {
  if (PROD) return `/_serverFn/${IDS[`${mod}.${exp}`]}`;
  const payload = JSON.stringify({ file: `/src/lib/${mod}.functions.ts?tss-serverfn-split`, export: `${exp}_createServerFn_handler` });
  return `/_serverFn/${Buffer.from(payload).toString("base64url")}`;
}

function seroval(value) {
  let counter = 0;
  const node = (v) => {
    if (v === null || v === undefined) return { t: 2, s: 0 };
    if (typeof v === "boolean") return { t: 2, s: v ? 1 : 0 };
    if (typeof v === "string") return { t: 1, s: v };
    if (typeof v === "number") return { t: 0, s: v };
    counter += 1;
    if (Array.isArray(v)) return { t: 9, i: counter, a: v.map(node), o: 0 };
    return { t: 10, i: counter, p: { k: Object.keys(v), v: Object.values(v).map(node) }, o: 0 };
  };
  return JSON.stringify({ t: node(value), f: 63, m: [] });
}

async function call(cookie, mod, exp, data, method = "POST") {
  let url = BASE + fnPath(mod, exp);
  const headers = { "x-tsr-serverfn": "true", accept: "application/json" };
  if (cookie) headers.cookie = `session=${cookie}`;
  let body;
  if (data !== undefined) {
    const env = seroval({ data });
    if (method === "GET") url += `?payload=${encodeURIComponent(env)}`;
    else {
      headers["content-type"] = "application/json";
      body = env;
    }
  }
  const res = await fetch(url, { method, headers, body, redirect: "manual" });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const session = setCookie.map((c) => /^session=([^;]+)/.exec(c)).find(Boolean)?.[1];
  return { status: res.status, text: await res.text(), session };
}

async function signIn(email) {
  const r = await call(null, "auth", "signIn", { email, password: PASSWORD });
  if (!r.session) throw new Error(`could not sign in ${email}: ${r.text.slice(0, 120)}`);
  return r.session;
}

const PAYLOAD = (tag) =>
  `<img src=x data-xss="${tag}" onerror="window.__xss=(window.__xss||[]).concat('${tag}')">` +
  `"><svg data-xss="${tag}" onload="window.__xss=(window.__xss||[]).concat('${tag}')"></svg>`;
const q = (s) => `$x$${s}$x$`;

(async () => {
  psql(`DELETE FROM users WHERE email IN ('${ADMIN}', '${VICTIM}'); DELETE FROM rate_limit_hits;`);
  for (const email of [ADMIN, VICTIM]) await call(null, "auth", "signUp", { email, password: PASSWORD });
  psql(`INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = '${ADMIN}' ON CONFLICT DO NOTHING; DELETE FROM rate_limit_hits;`);
  const adminCookie = await signIn(ADMIN);
  const victimCookie = await signIn(VICTIM);
  console.log(`target ${BASE} (${PROD ? "production build" : "dev server"})`);

  const browser = await chromium.launch();
  const host = new URL(BASE).hostname;

  // ---------------------------------------------------------------- stored XSS
  console.log("Stored XSS");
  const company = psql(`SELECT c.company_id FROM exhibition_companies c
    WHERE c.status = 'approved' AND c.is_active
    ORDER BY EXISTS (SELECT 1 FROM exhibition_products p WHERE p.company_id = c.company_id) DESC, c.company_id LIMIT 1`);
  const textCols = ["name", "name_en", "tagline", "tagline_en", "category", "city", "city_en", "description", "description_en",
    "phone", "email", "address", "address_en", "intro", "intro_en", "founders", "founders_en", "export_potential",
    "export_potential_en", "knowledge_products_intro", "knowledge_products_intro_en"];
  const prodCols = ["name", "name_en", "description", "description_en"];
  const product = psql(`SELECT id FROM exhibition_products WHERE company_id = '${company}' ORDER BY sort_order LIMIT 1`);
  psql(`SET client_min_messages = warning; DROP TABLE IF EXISTS xss_company_backup, xss_product_backup;
        CREATE TABLE xss_company_backup AS SELECT * FROM exhibition_companies WHERE company_id = '${company}';
        CREATE TABLE xss_product_backup AS SELECT * FROM exhibition_products WHERE company_id = '${company}';`);
  try {
    psql(`UPDATE exhibition_companies SET ${textCols.map((c) => `${c} = ${q(`${PAYLOAD(c)} X`)}`).join(", ")} WHERE company_id = '${company}'`);
    if (product) psql(`UPDATE exhibition_products SET ${prodCols.map((c) => `${c} = ${q(PAYLOAD(`product.${c}`))}`).join(", ")} WHERE id = '${product}'`);
    psql(`INSERT INTO company_attachments (owner_type, owner_id, kind, title, description, file_url, is_active)
          VALUES ('exhibition', '${company}', 'catalog', ${q(PAYLOAD("attachment.title"))}, ${q(PAYLOAD("attachment.description"))}, 'attachments/x/xss.pdf', true)`);

    const pages = [
      ["company page (fa)", `/company/${company}`, "fa", false],
      ["company page (en)", `/company/${company}`, "en", false],
      ["exhibition listing", "/exhibition", "fa", false],
      ["exhibition search", `/exhibition?q=${encodeURIComponent("X")}`, "fa", false],
      ["kiosk", "/kiosk", "fa", false],
      ["categories", "/categories", "fa", false],
      ["home", "/", "fa", false],
      ["admin exhibition editor", "/admin/exhibition", "fa", true],
    ];
    if (product) pages.push(["product page", `/company/${company}/product/${product}`, "fa", false]);
    for (const [label, url, lang, asAdmin] of pages) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      if (asAdmin) await ctx.addCookies([{ name: "session", value: adminCookie, domain: host, path: "/", httpOnly: true, secure: PROD, sameSite: "Lax" }]);
      await ctx.addInitScript((l) => { try { localStorage.setItem("i18nextLng", l); } catch {} }, lang);
      const page = await ctx.newPage();
      const dialogs = [];
      page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
      const res = await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 40)}` }));
      await page.waitForTimeout(1500);
      if (label === "admin exhibition editor") {
        // open the company in the editor so its fields render
        await page.locator(`text=${"X"}`).first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }
      if (label === "company page (fa)") {
        const visible = await page.evaluate(() => document.body.innerText.includes("data-xss"));
        check("the stored payload is actually on the company page (as text)", visible);
      }
      const ran = await page.evaluate(() => window.__xss || []);
      const injected = await page.evaluate(() => document.querySelectorAll("[data-xss]").length);
      check(`${label}: stored markup is shown as text`, ran.length === 0 && injected === 0 && dialogs.length === 0,
        `status ${typeof res?.status === "function" ? res.status() : "?"}, scripts ran ${ran.length}, elements ${injected}`);
      await ctx.close();
    }
    const saved = await call(adminCookie, "exhibition-api", "saveAdminCompany", { company_id: company, website: "javascript:alert(1)" });
    check("script URLs are refused when saving a company", !saved.text.includes('"k":["result"]'));
  } finally {
    const cols = [...textCols];
    psql(`UPDATE exhibition_companies e SET (${cols.join(", ")}) = (${cols.map((c) => `b.${c}`).join(", ")})
          FROM xss_company_backup b WHERE e.company_id = b.company_id;
          UPDATE exhibition_products p SET (${prodCols.join(", ")}) = (${prodCols.map((c) => `b.${c}`).join(", ")})
          FROM xss_product_backup b WHERE p.id = b.id;
          DELETE FROM company_attachments WHERE file_url = 'attachments/x/xss.pdf';
          DROP TABLE xss_company_backup, xss_product_backup;`);
  }

  // --------------------------------------------------------------------- CSRF
  console.log("Cross-site request forgery");
  const target = BASE;
  const signOut = fnPath("auth", "signOutFn");
  const changePw = fnPath("auth", "changeMyPassword");
  const pwBody = seroval({ data: { newPassword: "Hijacked#Passw0rd1" } });
  const evilHtml = `<!doctype html><title>evil</title><body><script>
    (async () => {
      const r = [];
      for (const [fn, body] of [[${JSON.stringify(signOut)}, "x"], [${JSON.stringify(changePw)}, ${JSON.stringify(pwBody)}]]) {
        try { await fetch(${JSON.stringify(target)} + fn, { method: "POST", credentials: "include", mode: "no-cors",
          headers: { "content-type": "text/plain" }, body }); r.push("no-cors sent"); } catch (e) { r.push("no-cors error"); }
        try { const x = await fetch(${JSON.stringify(target)} + fn, { method: "POST", credentials: "include",
          headers: { "content-type": "application/json", "x-tsr-serverfn": "true" }, body });
          r.push("cors " + x.status); } catch (e) { r.push("cors blocked"); }
      }
      document.title = r.join(" | ");
      const f = document.createElement("form");
      f.method = "POST"; f.action = ${JSON.stringify(target)} + ${JSON.stringify(signOut)}; f.enctype = "text/plain";
      const i = document.createElement("input"); i.name = "x"; i.value = "y"; f.appendChild(i);
      document.body.appendChild(f); setTimeout(() => f.submit(), 300);
    })();
  </script></body>`;
  const evil = http.createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(evilHtml); });
  await new Promise((r) => evil.listen(9999, "127.0.0.1", r));
  for (const [label, origin] of [["another site", "http://127.0.0.1:9999/"], ["a sibling on the same site", `http://localhost:9999/`]]) {
    if (origin.startsWith("http://localhost")) {
      evil.close();
      await new Promise((r) => { evil.listen(9999, "localhost", r); });
    }
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: "session", value: victimCookie, domain: host, path: "/", httpOnly: true, secure: PROD, sameSite: "Lax" }]);
    const page = await ctx.newPage();
    await page.goto(origin, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const still = await call(victimCookie, "auth", "getCurrentUser", undefined, "GET");
    check(`a page on ${label} could not sign the victim out or change the password`, still.text.includes(VICTIM));
    await ctx.close();
  }
  evil.close();
  psql(`DELETE FROM rate_limit_hits;`);
  const stillPw = await call(null, "auth", "signIn", { email: VICTIM, password: PASSWORD });
  check("the victim's password is unchanged", Boolean(stillPw.session));

  await browser.close();
  psql(`DELETE FROM users WHERE email IN ('${ADMIN}', '${VICTIM}'); DELETE FROM rate_limit_hits;`);
  console.log(`\n${checks} checks, ${failures ? `${failures} FAILED` : "all passed"}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
