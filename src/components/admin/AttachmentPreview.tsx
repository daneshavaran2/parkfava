import { useState } from "react";
import { useAssetUrl } from "@/lib/use-auth";
import type { CompanyAttachment } from "@/lib/attachments-api";

export function AttachmentPreviewButton({
  att,
  label = "پیش‌نمایش",
  style,
}: {
  att: CompanyAttachment;
  label?: string;
  style?: React.CSSProperties;
}) {
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
        {label}
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
          <strong style={{ flex: 1, fontSize: 14 }}>{att.title || "فایل"}</strong>
          <a
            href={url}
            download={att.title || true}
            target="_blank"
            rel="noopener"
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
          >
            دانلود
          </a>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>
            بستن
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
              <p style={{ marginTop: 10 }}>پیش‌نمایش این فایل پشتیبانی نمی‌شود.</p>
              <a
                href={url}
                target="_blank"
                rel="noopener"
                className="btn btn-primary"
                style={{ marginTop: 10 }}
              >
                دانلود فایل
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
