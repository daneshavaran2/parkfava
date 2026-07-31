import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAssetUrl } from "@/lib/use-auth";
import type { CompanyAttachment } from "@/lib/attachments-api";

export function AttachmentPreviewButton({
  att,
  label,
  style,
}: {
  att: CompanyAttachment;
  label?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const url = useAssetUrl(att.file_url);
  if (!url) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        style={{ fontSize: 11, padding: "4px 8px", ...style }}
      >
        {label ?? t("common.preview")}
      </button>
      {open && <AttachmentPreviewDialog att={att} url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

export function AttachmentPreviewDialog({
  att,
  url,
  onClose,
}: {
  att: CompanyAttachment;
  url: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const mime = att.mime_type || guessMime(att.file_url);
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isPdf = mime === "application/pdf" || /\.pdf($|\?)/i.test(att.file_url);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          borderRadius: 14,
          padding: 16,
          maxWidth: "min(1100px, 95vw)",
          maxHeight: "92vh",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ flex: 1, fontSize: 14 }}>{att.title || t("common.file")}</strong>
          <a
            href={url}
            download={att.title || true}
            target="_blank"
            rel="noopener"
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
          >
            {t("common.download")}
          </a>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>
            {t("common.close")}
          </button>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            background: "var(--panel-2)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isImage && (
            <img
              src={url}
              alt={att.title || ""}
              style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain" }}
            />
          )}
          {isVideo && (
            <video
              src={url}
              controls
              autoPlay
              style={{ maxWidth: "100%", maxHeight: "82vh", background: "#000" }}
            />
          )}
          {isPdf && (
            <iframe
              src={url}
              title={att.title || "PDF"}
              style={{ width: "100%", height: "82vh", border: 0, background: "#fff" }}
            />
          )}
          {!isImage && !isVideo && !isPdf && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>
              <div style={{ fontSize: 40 }}>📄</div>
              <p style={{ marginTop: 10 }}>{t("attachmentPreview.not_supported")}</p>
              <a
                href={url}
                target="_blank"
                rel="noopener"
                className="btn btn-primary"
                style={{ marginTop: 10 }}
              >
                {t("attachmentPreview.download_file")}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] || "";
}
