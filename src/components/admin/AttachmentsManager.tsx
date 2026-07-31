import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAssetUrl } from "@/lib/use-auth";
import { AttachmentPreviewButton } from "@/components/admin/AttachmentPreview";
import {
  fetchAttachments,
  uploadAttachment,
  updateAttachment,
  deleteAttachment,
  reorderAttachments,
  KIND_LABELS,
  KIND_ACCEPT,
  type AttachmentKind,
  type CompanyAttachment,
} from "@/lib/attachments-api";

const KINDS: AttachmentKind[] = [
  "logo",
  "gallery_image",
  "catalog",
  "form_fa",
  "form_en",
  "document",
];

export function AttachmentsManager({
  ownerType,
  ownerId,
}: {
  ownerType: "exhibition" | "park";
  ownerId: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const queryKey = ["attachments", ownerType, ownerId];
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchAttachments(ownerType, ownerId),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey });
  }

  async function handleUpload(kind: AttachmentKind, file: File, title?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await uploadAttachment({ ownerType, ownerId, kind, file, title });
      invalidate();
      setMsg(t("attachmentsManager.uploaded"));
    } catch (e: any) {
      setMsg(`${t("common.error")}: ${e?.message ?? e}`);
    }
    setBusy(false);
  }

  const grouped = Object.fromEntries(KINDS.map((k) => [k, [] as CompanyAttachment[]]));
  for (const it of items) {
    if (!grouped[it.kind]) grouped[it.kind] = [];
    grouped[it.kind].push(it);
  }

  return (
    <div className="panel" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3>{t("attachmentsManager.title")}</h3>
        {msg && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{msg}</span>}
      </div>
      {isLoading && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{t("common.loading")}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {KINDS.map((kind) => (
          <KindSection
            key={kind}
            kind={kind}
            items={grouped[kind] || []}
            busy={busy}
            onUpload={(file, title) => handleUpload(kind, file, title)}
            onChange={invalidate}
          />
        ))}
      </div>
    </div>
  );
}

function KindSection({
  kind,
  items,
  busy,
  onUpload,
  onChange,
}: {
  kind: AttachmentKind;
  items: CompanyAttachment[];
  busy: boolean;
  onUpload: (file: File, title?: string) => void;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const label = KIND_LABELS[kind];
  const accept = KIND_ACCEPT[kind];

  async function move(idx: number, dir: -1 | 1) {
    const arr = [...items];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    await reorderAttachments(arr.map((x) => x.id));
    onChange();
  }

  return (
    <div style={{ border: "1px solid var(--stroke)", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>{label} <span style={{ color: "var(--ink-soft)", fontSize: 12, fontWeight: 400 }}>({items.length})</span></strong>
        <label className="btn btn-ghost" style={{ fontSize: 12, cursor: busy ? "wait" : "pointer" }}>
          {t("attachmentsManager.add")}
          <input
            type="file"
            accept={accept}
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {!items.length ? (
        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{t("attachmentsManager.no_files_uploaded")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it, i) => (
            <AttachmentRow
              key={it.id}
              att={it}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentRow({
  att,
  onUp,
  onDown,
  onChange,
}: {
  att: CompanyAttachment;
  onUp: () => void;
  onDown: () => void;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const url = useAssetUrl(att.file_url);
  const [title, setTitle] = useState(att.title ?? "");
  const isImage = (att.mime_type || "").startsWith("image/");

  async function saveTitle() {
    if (title === (att.title ?? "")) return;
    await updateAttachment(att.id, { title });
    onChange();
  }

  async function remove() {
    if (!confirm(t("attachmentsManager.confirm_delete_file"))) return;
    await deleteAttachment(att);
    onChange();
  }

  async function toggleActive() {
    await updateAttachment(att.id, { is_active: !att.is_active });
    onChange();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 56px 1fr auto", gap: 8, alignItems: "center", padding: 6, background: "var(--panel-2)", borderRadius: 8, opacity: att.is_active ? 1 : 0.5 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <button onClick={onUp} style={miniBtn}>▲</button>
        <button onClick={onDown} style={miniBtn}>▼</button>
      </div>
      <div style={{ width: 56, height: 56, background: "var(--panel)", borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {isImage && url ? (
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 18 }}>📄</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          placeholder={t("attachmentsManager.title_placeholder")}
          style={{ background: "var(--panel)", border: "1px solid var(--stroke)", borderRadius: 6, padding: "4px 8px", color: "inherit", fontSize: 12, fontFamily: "inherit" }}
        />
        <div style={{ fontSize: 11, color: "var(--ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {att.mime_type || "—"} · {att.size_bytes ? Math.round(att.size_bytes / 1024) + " KB" : "—"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <AttachmentPreviewButton att={att} />
        {url && (
          <a href={url} download className="btn btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>
            {t("attachmentsManager.download")}
          </a>
        )}
        <button className="btn btn-ghost" onClick={toggleActive} style={{ fontSize: 11, padding: "4px 8px" }}>
          {att.is_active ? t("attachmentsManager.inactive") : t("attachmentsManager.active")}
        </button>
        <button className="btn btn-ghost" onClick={remove} style={{ fontSize: 11, padding: "4px 8px" }}>
          {t("attachmentsManager.delete")}
        </button>
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: "var(--panel)",
  border: 0,
  color: "inherit",
  borderRadius: 4,
  cursor: "pointer",
  padding: "2px 6px",
  fontSize: 10,
};
