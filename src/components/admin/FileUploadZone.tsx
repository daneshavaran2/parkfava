import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

type FileUploadZoneProps = {
  accept?: string;
  onSelect: (file: File) => void;
  busy?: boolean;
  /** Overrides the default "Click to upload a file" header text. */
  label?: string;
  /** Shown in the footer bar instead of "No file selected" — e.g. the
   *  currently uploaded file's name, when the call site tracks one. */
  fileName?: string | null;
  /** Smaller footprint for tight slots (e.g. a ~140px product-row cell)
   *  instead of the default's wider standalone-section sizing. */
  compact?: boolean;
};

/**
 * Upload control from a design supplied directly by the user (Uiverse.io,
 * by Yaya12085) — a dropzone header + a "current file" footer bar — used
 * in place of the plain `<label className="btn btn-ghost">…hidden
 * input</label>` button that used to be hand-duplicated at every one of
 * this app's ~20 admin/my-company file-upload sites.
 *
 * Deliberately only replaces that trigger control. Each call site's own
 * preview (an <img>/<video>, a "view catalog" link, a thumbnail grid, an
 * import log…) is untouched — those vary too much per site to fold into
 * one shared design without risking breaking them.
 *
 * Sized in relative units (not the original's fixed 300x300px) so it fits
 * both a wide standalone section and a compact grid cell — see `compact`.
 * The footer's trash-can icon is decorative, matching the source design:
 * both icons and the text there sit inside the same upload-triggering
 * label, not a separate clear/remove action.
 */
export function FileUploadZone({
  accept,
  onSelect,
  busy,
  label,
  fileName,
  compact,
}: FileUploadZoneProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onSelect(file);
    e.target.value = "";
  }

  return (
    <div className={"file-upload-zone" + (compact ? " file-upload-zone--compact" : "")}>
      <label htmlFor={inputId} className="file-upload-zone__header" aria-disabled={busy}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M7 10V9C7 6.23858 9.23858 4 12 4C14.7614 4 17 6.23858 17 9V10C19.2091 10 21 11.7909 21 14C21 15.4806 20.1956 16.8084 19 17.5M7 10C4.79086 10 3 11.7909 3 14C3 15.4806 3.8044 16.8084 5 17.5M7 10C7.43285 10 7.84965 10.0688 8.24006 10.1959M12 12V21M12 12L15 15M12 12L9 15"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p>{label || t("common.browse_file_upload")}</p>
      </label>
      <label htmlFor={inputId} className="file-upload-zone__footer" aria-disabled={busy}>
        <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M15.331 6H8.5v20h15V14.154h-8.169z" />
          <path d="M18.153 6h-.009v5.342H23.5v-.002z" />
        </svg>
        <p>{fileName || t("common.no_file_selected")}</p>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M5.16565 10.1534C5.07629 8.99181 5.99473 8 7.15975 8H16.8402C18.0053 8 18.9237 8.9918 18.8344 10.1534L18.142 19.1534C18.0619 20.1954 17.193 21 16.1479 21H7.85206C6.80699 21 5.93811 20.1954 5.85795 19.1534L5.16565 10.1534Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M19.5 5H4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M10 3C10 2.44772 10.4477 2 11 2H13C13.5523 2 14 2.44772 14 3V5H10V3Z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={busy}
        onChange={handleChange}
        style={{ display: "none" }}
      />
    </div>
  );
}
