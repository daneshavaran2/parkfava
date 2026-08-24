import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/register-company")({
  head: () => ({
    meta: [
      { title: tHead("meta.register_company_title") },
      { name: "description", content: tHead("meta.register_company_desc") },
    ],
  }),
  component: RegisterCompanyPage,
});

function RegisterCompanyPage() {
  const { t } = useTranslation();
  return (
    <div className="view"><div className="shell" style={{ padding: 40, maxWidth: 620 }}>
      <span className="eyebrow">{t("registerCompany.eyebrow")}</span>
      <h2 className="h2" style={{ marginTop: 8 }}>{t("registerCompany.title")}</h2>
      <p className="lead" style={{ marginTop: 12 }}>
        {t("registerCompany.lead_1")}
      </p>
      <p className="lead" style={{ marginTop: 8 }}>
        {t("registerCompany.lead_2")}
      </p>
      <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
        <Link to="/" className="btn btn-ghost">{t("common.back_home")}</Link>
        <Link to="/exhibition" className="btn btn-primary">{t("registerCompany.view_exhibition")}</Link>
      </div>
    </div></div>
  );
}
