import { useState } from "react";
import JSZip from "jszip";
import { useQueryClient } from "@tanstack/react-query";
import {
  uploadAttachmentFromBlob,
  type AttachmentKind,
} from "@/lib/attachments-api";
import {
  upsertExhibitionCompany,
  upsertExhibitionProduct,
  uploadExhibitionAsset,
  type ExhibitionCompany,
} from "@/lib/exhibition-api";
import { supabase } from "@/integrations/supabase/client";

const IMG_RE = /\.(png|jpe?g|webp|gif|svg)$/i;
const VID_RE = /\.(mp4|webm|mov|m4v)$/i;

type LogLine = { type: "ok" | "warn" | "err"; text: string };

const KIND_BY_NAME: Record<string, AttachmentKind> = {
  catalog: "catalog",
  form_fa: "form_fa",
  form_en: "form_en",
};

export function ZipImporter({
  ownerType,
  ownerId,
  existingCompany,
}: {
  ownerType: "exhibition" | "park";
  ownerId: string;
  existingCompany?: ExhibitionCompany | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  function push(type: LogLine["type"], text: string) {
    setLog((l) => [...l, { type, text }]);
  }

  // Unified entry shape: { path, getBlob, getString }
  type Entry = {
    path: string;
    getBlob: () => Promise<Blob>;
    getString: () => Promise<string>;
  };

  async function loadEntries(file: File): Promise<Entry[]> {
    const name = file.name.toLowerCase();
    const isZip = name.endsWith(".zip") || file.type === "application/zip";

    if (isZip) {
      const zip = await JSZip.loadAsync(file);
      const out: Entry[] = [];
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        out.push({
          path,
          getBlob: () => entry.async("blob"),
          getString: () => entry.async("string"),
        });
      });
      return out;
    }

    // RAR / 7z / TAR via libarchive.js (WASM)
    const { Archive } = await import("libarchive.js");
    Archive.init({ workerUrl: "/vendor/libarchive/worker-bundle.js" });
    const reader = await Archive.open(file);
    const arr: any[] = await reader.getFilesArray();
    const out: Entry[] = [];
    for (const it of arr) {
      // libarchive returns { file: File, path: string }
      const f: File = it.file;
      const folder: string = it.path || "";
      const fullPath = (folder ? folder.replace(/\/$/, "") + "/" : "") + f.name;
      out.push({
        path: fullPath,
        getBlob: async () => f,
        getString: async () => await f.text(),
      });
    }
    return out;
  }

  async function importZip(file: File) {
    setBusy(true);
    setLog([]);
    try {
      const allEntries = await loadEntries(file);
      push("ok", `${allEntries.length} فایل در آرشیو یافت شد`);

      // Detect single wrapping root folder
      const allPaths = allEntries
        .map((e) => e.path)
        .filter((p) => !p.startsWith("__MACOSX/") && !p.endsWith(".DS_Store"));
      let prefix = "";
      const firstSeg = (p: string) => p.split("/")[0];
      const segs = new Set(allPaths.map(firstSeg));
      if (segs.size === 1) {
        const only = [...segs][0];
        if (allPaths.some((p) => p.startsWith(only + "/"))) prefix = only + "/";
      }
      const strip = (p: string) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p);

      let counts = { fields: 0, attachments: 0, products: 0, errors: 0 };

      // Helper to pull a value from many possible key aliases
      const pick = (obj: any, ...keys: string[]) => {
        for (const k of keys) {
          if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
        }
        return undefined;
      };

      // Build path index over normalized (stripped) paths
      const stripped = allEntries.map((e) => ({ ...e, path: strip(e.path) }));
      const byPath = new Map<string, Entry>();
      for (const e of stripped) byPath.set(e.path, e);

      // 1) company.json — update fields (exhibition only)
      const companyEntry = byPath.get("company.json");
      let companyJsonObj: any = null;
      if (companyEntry && ownerType === "exhibition") {
        try {
          const txt = await companyEntry.getString();
          const obj = JSON.parse(txt);
          companyJsonObj = obj;
          const patch: any = {
            company_id: ownerId,
            name: existingCompany?.name || ownerId,
          };
          const map: Array<[string, string[]]> = [
            ["name", ["name", "title", "company_name"]],
            ["tagline", ["tagline", "slogan"]],
            ["category", ["category", "industry"]],
            ["park_id", ["park_id", "parkId"]],
            ["city", ["city"]],
            ["description", ["description", "about", "desc"]],
            ["website", ["website", "site", "url"]],
            ["phone", ["phone", "tel", "mobile"]],
            ["email", ["email", "mail"]],
            ["address", ["address", "addr"]],
            ["founded_at", ["founded_at", "foundedAt", "founded", "established"]],
            ["intro", ["intro", "introduction"]],
            ["founders", ["founders", "founder"]],
            ["export_potential", ["export_potential", "exportPotential", "export"]],
            ["headcount", ["headcount", "employees", "staff"]],
            ["knowledge_products_intro", ["knowledge_products_intro", "knowledgeProductsIntro", "kp_intro"]],
            ["linkedin_url", ["linkedin_url", "linkedinUrl", "linkedin"]],
          ];
          for (const [field, aliases] of map) {
            const v = pick(obj, ...aliases);
            if (v !== undefined) {
              patch[field] = v;
              counts.fields++;
            }
          }
          await upsertExhibitionCompany(patch);
          push("ok", `اطلاعات شرکت به‌روزرسانی شد (${counts.fields} فیلد)`);
        } catch (e: any) {
          counts.errors++;
          push("err", "خطا در پردازش company.json: " + (e.message ?? e));
        }
      }

      // 2) Walk files
      const files = stripped;

      let gallerySort = 0;
      for (const entry of files) {
        const path = entry.path;
        const lower = path.toLowerCase();
        if (!path || lower === "company.json") continue;
        if (path.startsWith("__MACOSX/") || path.endsWith(".DS_Store")) continue;

        try {
          const blob = await entry.getBlob();
          const filename = path.split("/").pop() || "file";

          // logo: logo.* at root OR inside logo/ folder
          if (
            ownerType === "exhibition" &&
            (/^logo\.(png|jpe?g|webp|svg|gif)$/i.test(path) ||
              /^logo\/.+\.(png|jpe?g|webp|svg|gif)$/i.test(path))
          ) {
            const stored = await uploadExhibitionAsset(ownerId, new File([blob], filename));
            await upsertExhibitionCompany({
              company_id: ownerId,
              name: existingCompany?.name || companyJsonObj?.name || ownerId,
              logo_url: stored,
            } as any);
            await uploadAttachmentFromBlob({ ownerType, ownerId, kind: "logo", blob, filename, title: "لوگو" });
            counts.attachments++;
            push("ok", "لوگو بارگذاری شد");
            continue;
          }

          // gallery/*
          if (/^gallery\/.+\.(png|jpe?g|webp|gif)$/i.test(path)) {
            const att = await uploadAttachmentFromBlob({
              ownerType, ownerId, kind: "gallery_image", blob, filename, title: filename,
            });
            // best-effort sort_order
            try {
              await supabase.from("company_attachments" as any).update({ sort_order: gallerySort++ }).eq("id", (att as any).id);
            } catch {}
            counts.attachments++;
            push("ok", `گالری: ${filename}`);
            continue;
          }

          // products/<name>/... handled separately below
          if (/^products\//i.test(path)) continue;

          // catalog/form_fa/form_en at root (by basename)
          const baseName = filename.replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, "").toLowerCase();
          if (KIND_BY_NAME[baseName] && !path.includes("/")) {
            await uploadAttachmentFromBlob({
              ownerType, ownerId,
              kind: KIND_BY_NAME[baseName],
              blob, filename, title: filename,
            });
            counts.attachments++;
            push("ok", `${baseName}: ${filename}`);
            continue;
          }

          // documents/*
          if (/^documents\//i.test(path)) {
            await uploadAttachmentFromBlob({
              ownerType, ownerId,
              kind: "document",
              blob, filename, title: filename,
            });
            counts.attachments++;
            push("ok", `سند: ${filename}`);
            continue;
          }

          push("warn", `نادیده گرفته شد: ${path}`);
        } catch (e: any) {
          counts.errors++;
          push("err", `${path}: ${e.message ?? e}`);
        }
      }

      // 3) Products — group by folder, attach image/video to product row
      if (ownerType === "exhibition") {
        type ProdGroup = { folder: string; entries: typeof stripped };
        const groups = new Map<string, ProdGroup>();
        for (const e of stripped) {
          const m = e.path.match(/^products\/([^/]+)\/(.+)$/i);
          if (!m) continue;
          const folder = decodeURIComponent(m[1]);
          if (!groups.has(folder)) groups.set(folder, { folder, entries: [] });
          groups.get(folder)!.entries.push(e);
        }

        // also include embedded company.json products that have no folder
        const embedded: any[] = Array.isArray(companyJsonObj?.products) ? companyJsonObj.products : [];

        const processed = new Set<string>();

        for (const [folder, g] of groups) {
          try {
            let info: any = {};
            let descText: string | null = null;
            const imageEntries: typeof stripped = [];
            const videoEntries: typeof stripped = [];

            for (const en of g.entries) {
              const fn = en.path.split("/").pop() || "";
              if (/^info\.json$/i.test(fn)) {
                try { info = JSON.parse(await en.getString()); } catch {}
              } else if (/^description\.(txt|md)$/i.test(fn)) {
                try { descText = await en.getString(); } catch {}
              } else if (IMG_RE.test(fn)) {
                imageEntries.push(en);
              } else if (VID_RE.test(fn)) {
                videoEntries.push(en);
              }
            }

            // merge with embedded data matching by name
            const emb = embedded.find((p) => (p?.name || "").trim() === folder.trim());
            if (emb) processed.add((emb.name || "").trim());

            const name = info.name || emb?.name || folder;
            const description = descText ?? info.description ?? info.desc ?? emb?.description ?? emb?.desc ?? null;
            const link_url = info.url ?? info.link_url ?? info.website ?? emb?.url ?? emb?.link_url ?? emb?.website ?? null;

            let image_url: string | null = null;
            let video_url: string | null = null;

            if (imageEntries.length) {
              const first = imageEntries[0];
              const fn = first.path.split("/").pop() || "image";
              const blob = await first.getBlob();
              image_url = await uploadExhibitionAsset(ownerId, new File([blob], fn));
            }
            if (videoEntries.length) {
              const first = videoEntries[0];
              const fn = first.path.split("/").pop() || "video";
              const blob = await first.getBlob();
              video_url = await uploadExhibitionAsset(ownerId, new File([blob], fn));
            }

            await upsertExhibitionProduct({
              company_id: ownerId,
              name,
              description,
              link_url,
              image_url,
              video_url,
            } as any);
            counts.products++;
            push("ok", `محصول: ${name}${image_url ? " 🖼" : ""}${video_url ? " 🎬" : ""}`);

            // extra images/videos beyond the first → product gallery attachments
            for (const en of imageEntries.slice(1)) {
              const fn = en.path.split("/").pop() || "image";
              const blob = await en.getBlob();
              await uploadAttachmentFromBlob({
                ownerType, ownerId, kind: "gallery_image", blob, filename: fn,
                title: `${name} — ${fn}`,
              });
              counts.attachments++;
            }
            for (const en of videoEntries.slice(1)) {
              const fn = en.path.split("/").pop() || "video";
              const blob = await en.getBlob();
              await uploadAttachmentFromBlob({
                ownerType, ownerId, kind: "other", blob, filename: fn,
                title: `${name} — ${fn}`,
              });
              counts.attachments++;
            }
          } catch (e: any) {
            counts.errors++;
            push("err", `محصول ${folder}: ${e.message ?? e}`);
          }
        }

        // embedded products without a matching folder
        for (const p of embedded) {
          const n = (p?.name || "").trim();
          if (!n || processed.has(n)) continue;
          try {
            await upsertExhibitionProduct({
              company_id: ownerId,
              name: n,
              description: p.description ?? p.desc ?? null,
              link_url: p.url ?? p.link_url ?? p.website ?? null,
              image_url: p.image_url ?? p.image ?? null,
              video_url: p.video_url ?? p.video ?? null,
            } as any);
            counts.products++;
            push("ok", `محصول (از company.json): ${n}`);
          } catch (e: any) {
            counts.errors++;
            push("err", `محصول ${n}: ${e.message ?? e}`);
          }
        }
      }

      push("ok", `پایان: ${counts.fields} فیلد، ${counts.attachments} ضمیمه، ${counts.products} محصول، ${counts.errors} خطا`);
      qc.invalidateQueries({ queryKey: ["attachments", ownerType, ownerId] });
      qc.invalidateQueries({ queryKey: ["admin-exh-company", ownerId] });
      qc.invalidateQueries({ queryKey: ["admin-exh-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-exh-products", ownerId] });
      qc.invalidateQueries({ queryKey: ["all-attachments"] });
    } catch (e: any) {
      push("err", "ZIP نامعتبر: " + (e.message ?? e));
    }
    setBusy(false);
  }

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>بارگذاری بسته ZIP الگو</h3>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
            ساختار: <code>company.json</code>, <code>logo.*</code>, <code>gallery/</code>, <code>products/&lt;نام&gt;/</code>, <code>catalog.pdf</code>, <code>form_fa.docx</code>, <code>form_en.docx</code>, <code>documents/</code>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/templates/template-company.zip" download className="btn btn-ghost" style={{ fontSize: 12 }}>
            دانلود قالب نمونه
          </a>
          <label className="btn btn-primary" style={{ fontSize: 12, cursor: busy ? "wait" : "pointer" }}>
            {busy ? "درحال پردازش…" : "انتخاب فایل ZIP/RAR"}
            <input
              type="file"
              accept=".zip,.rar,.7z,.tar,application/zip,application/x-rar-compressed,application/x-7z-compressed,application/x-tar"
              disabled={busy}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importZip(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {log.length > 0 && (
        <div
          style={{
            marginTop: 10,
            background: "var(--panel-2)",
            borderRadius: 8,
            padding: 10,
            maxHeight: 220,
            overflowY: "auto",
            fontSize: 12,
            fontFamily: "monospace",
            direction: "ltr",
          }}
        >
          {log.map((l, i) => (
            <div
              key={i}
              style={{
                color:
                  l.type === "err" ? "#ff7676" : l.type === "warn" ? "#e3b341" : "var(--ink-soft)",
              }}
            >
              {l.type === "ok" ? "✓ " : l.type === "warn" ? "⚠ " : "✗ "}{l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
