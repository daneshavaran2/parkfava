import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

// Mapping: extracted folder name -> exhibition_companies.company_id
const MAP: Record<string, string> = {
  "برسام": "barsam",
  "توسعه_فناوری_لوتوس_شبک": "lotus",
  "راهبر_نیروی_خراسان_رانیر": "ranir",
  "شتاب_دهنده_نوآفرین": "noafarin",
  "ونداد_ویرا_هومان": "parspack",
};

// undo `convmv`-style #Uxxxx encoding produced by unzip
function decodeName(name: string): string {
  return name.replace(/#U([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function mimeFor(ext: string): string {
  const m: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
  };
  return m[ext.toLowerCase()] || "application/octet-stream";
}

function classify(decoded: string, ext: string): { kind: string; title: string } {
  const lower = decoded.toLowerCase();
  const e = ext.toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(e);

  if (isImage) {
    if (lower.includes("لوگو") || lower.includes("logo")) return { kind: "logo", title: "لوگو" };
    return { kind: "gallery_image", title: decoded };
  }
  if (lower.includes("کاتاب") || lower.includes("کاتالوگ") || lower.includes("catalog")) {
    if (lower.includes("انگل") || lower.includes("english")) return { kind: "catalog", title: "کاتالوگ محصولات (انگلیسی)" };
    return { kind: "catalog", title: "کاتالوگ محصولات" };
  }
  if (lower.includes("english") || lower.includes("انگل") || lower.includes("form 2") || lower.includes("فرم 2")) {
    return { kind: "form_en", title: "فرم اطلاعات شرکت (انگلیسی)" };
  }
  if (lower.includes("فارس") || lower.includes("فرم 1") || lower.includes("form 1") || lower.includes("farsi") || lower.includes("persian")) {
    return { kind: "form_fa", title: "فرم اطلاعات شرکت (فارسی)" };
  }
  return { kind: "document", title: decoded };
}

async function uploadOne(companyId: string, folder: string, fname: string) {
  const full = join(folder, fname);
  const decoded = decodeName(fname);
  const ext = extname(decoded) || extname(fname);
  const { kind, title } = classify(decoded, ext);
  const safe = decoded.replace(/[^\w.\-]+/g, "_");
  const path = `attachments/exhibition/${companyId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
  const buf = readFileSync(full);
  const mime = mimeFor(ext);

  // Skip if same title/kind already exists for this company
  const { data: existing } = await sb
    .from("company_attachments")
    .select("id")
    .eq("owner_type", "exhibition")
    .eq("owner_id", companyId)
    .eq("kind", kind)
    .eq("title", title)
    .maybeSingle();
  if (existing) {
    console.log(`  · skip (exists): [${kind}] ${title}`);
    return;
  }

  const { error: upErr } = await sb.storage.from("park-assets").upload(path, buf, {
    contentType: mime, upsert: false,
  });
  if (upErr) { console.error("  ! upload err:", upErr.message); return; }

  const { error: insErr } = await sb.from("company_attachments").insert({
    owner_type: "exhibition",
    owner_id: companyId,
    kind,
    title,
    file_url: path,
    mime_type: mime,
    size_bytes: statSync(full).size,
    sort_order: 0,
    is_active: true,
  });
  if (insErr) console.error("  ! insert err:", insErr.message);
  else console.log(`  ✓ [${kind}] ${title}`);
}

async function main() {
  const root = "/tmp/ex";
  for (const [folder, companyId] of Object.entries(MAP)) {
    const dir = join(root, folder);
    try { statSync(dir); } catch { console.log(`Skip ${folder}: missing`); continue; }
    console.log(`\n=== ${folder} → ${companyId} ===`);
    const files = readdirSync(dir).filter((f) => !f.startsWith("."));
    for (const f of files) {
      await uploadOne(companyId, dir, f);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
