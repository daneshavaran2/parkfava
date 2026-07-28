import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, useAssetUrl } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllAttachments,
  deleteAttachment,
  updateAttachment,
  KIND_LABELS,
  type AttachmentKind,
  type CompanyAttachment,
} from "@/lib/attachments-api";
import { fetchExhibitionCompanies } from "@/lib/exhibition-api";
import { AttachmentPreviewButton } from "@/components/admin/AttachmentPreview";

export const Route = createFileRoute("/admin/attachments")({
  head: () => ({ meta: [{ title: "داشبورد ضمیمه‌ها" }] }),
  component: AdminAttachmentsPage,
});

const KINDS: (AttachmentKind | "")[] = ["", "logo", "gallery_image", "catalog", "form_fa", "form_en", "document", "other"];

function AdminAttachmentsPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [ownerType, setOwnerType] = useState<"" | "exhibition" | "park">("");
  const [kind, setKind] = useState<AttachmentKind | "">("");
  const [active, setActive] = useState<"" | "yes" | "no">("");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-exh-companies"],
    queryFn: fetchExhibitionCompanies,
    enabled: !!user && isAdmin,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["all-attachments", ownerType, kind, active, search],
    queryFn: () =>
      fetchAllAttachments({
        ownerType: ownerType || undefined,
        kind: kind || undefined,
        isActive: active === "" ? undefined : active === "yes",
        search: search.trim() || undefined,
      }),
    enabled: !!user && isAdmin,
  });

  const filtered = useMemo(
    () => (companyFilter ? items.filter((i) => i.owner_id === companyFilter) : items),
    [items, companyFilter],
  );

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["all-attachments"] });
  }

  async function toggle(att: CompanyAttachment) {
    await updateAttachment(att.id, { is_active: !att.is_active });
    invalidate();
  }
  async function remove(att: CompanyAttachment) {
    if (!confirm(`حذف «${att.title || "فایل"}»؟`)) return;
    await deleteAttachment(att);
    invalidate();
  }

  if (loading) return <div className="view"><div className="shell" style={{ padding: 40 }}>درحال بارگذاری…</div></div>;
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="view"><div className="shell" style={{ padding: 40 }}>
        <h2 className="h2">دسترسی ندارید</h2>
        <p className="lead">حساب شما نقش ادمین ندارد.</p>
      </div></div>
    );
  }

  const companyName = (id: string) =>
    companies.find((c) => c.company_id === id)?.name || id;

  return (
    <div className="view">
      <div className="shell" style={{ padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span className="eyebrow">Admin</span>
            <h2 className="h2" style={{ fontSize: 24 }}>داشبورد ضمیمه‌ها و مستندات</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/admin/exhibition" className="btn btn-ghost">نمایشگاه</Link>
            <Link to="/admin/parks" className="btn btn-ghost">پارک‌ها</Link>
            <Link to="/admin/about" className="btn btn-ghost">درباره</Link>
            <button className="btn btn-ghost" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>خروج</button>
          </div>
        </div>

        <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
            <select value={ownerType} onChange={(e) => setOwnerType(e.target.value as any)} style={field}>
              <option value="">همه (نمایشگاه + پارک)</option>
              <option value="exhibition">نمایشگاه</option>
              <option value="park">پارک</option>
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} style={field}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{k === "" ? "همه انواع" : KIND_LABELS[k as AttachmentKind]}</option>
              ))}
            </select>
            <select value={active} onChange={(e) => setActive(e.target.value as any)} style={field}>
              <option value="">همه وضعیت‌ها</option>
              <option value="yes">فعال</option>
              <option value="no">غیرفعال</option>
            </select>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} style={field}>
              <option value="">همه شرکت‌ها</option>
              {companies.map((c) => (
                <option key={c.company_id} value={c.company_id}>{c.name}</option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی عنوان…"
              style={{ ...field, gridColumn: "span 2" }}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-soft)" }}>
            {filtered.length} مورد
          </div>
        </div>

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ padding: 30, color: "var(--ink-soft)" }}>درحال بارگذاری…</div>
          ) : !filtered.length ? (
            <div style={{ padding: 30, color: "var(--ink-soft)" }}>چیزی یافت نشد.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead style={{ background: "var(--panel-2)" }}>
                  <tr>
                    <Th>شرکت</Th>
                    <Th>نوع</Th>
                    <Th>دسته</Th>
                    <Th>عنوان</Th>
                    <Th>حجم</Th>
                    <Th>وضعیت</Th>
                    <Th>اقدامات</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((att) => (
                    <Row
                      key={att.id}
                      att={att}
                      companyName={companyName(att.owner_id)}
                      onToggle={() => toggle(att)}
                      onRemove={() => remove(att)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  att,
  companyName,
  onToggle,
  onRemove,
}: {
  att: CompanyAttachment;
  companyName: string;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const url = useAssetUrl(att.file_url);
  return (
    <tr style={{ borderTop: "1px solid var(--stroke)", opacity: att.is_active ? 1 : 0.55 }}>
      <Td>{companyName}</Td>
      <Td><span className="badge">{att.owner_type === "exhibition" ? "نمایشگاه" : "پارک"}</span></Td>
      <Td>{KIND_LABELS[att.kind]}</Td>
      <Td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {att.title || "—"}
      </Td>
      <Td>{att.size_bytes ? Math.round(att.size_bytes / 1024) + " KB" : "—"}</Td>
      <Td>{att.is_active ? "فعال" : "غیرفعال"}</Td>
      <Td>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <AttachmentPreviewButton att={att} />
          {url && (
            <a href={url} download className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>
              دانلود
            </a>
          )}
          <button onClick={onToggle} className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>
            {att.is_active ? "غیرفعال" : "فعال"}
          </button>
          <button onClick={onRemove} className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>
            حذف
          </button>
        </div>
      </Td>
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700, fontSize: 12, color: "var(--ink-soft)" }}>
      {children}
    </th>
  );
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "10px 12px", verticalAlign: "middle", ...style }}>{children}</td>;
}

const field: React.CSSProperties = {
  background: "var(--panel-2)",
  border: "1px solid var(--stroke)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "inherit",
  fontFamily: "inherit",
  fontSize: 13,
};
