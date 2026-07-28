import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/register-company")({
  head: () => ({
    meta: [
      { title: "ثبت شرکت — نمایشگاه فاوا" },
      { name: "description", content: "ثبت شرکت‌ها فقط توسط ادمین نمایشگاه انجام می‌شود." },
    ],
  }),
  component: RegisterCompanyPage,
});

function RegisterCompanyPage() {
  return (
    <div className="view"><div className="shell" style={{ padding: 40, maxWidth: 620 }}>
      <span className="eyebrow">ثبت شرکت</span>
      <h2 className="h2" style={{ marginTop: 8 }}>ثبت شرکت فقط از طریق ادمین انجام می‌شود</h2>
      <p className="lead" style={{ marginTop: 12 }}>
        برای حفظ اعتبار و صحت اطلاعات نمایشگاه، ثبت شرکت‌ها و تخصیص نماینده به هر شرکت،
        تنها توسط ادمین شبکه‌ی فاوا انجام می‌شود. اگر مایل هستید شرکت شما در نمایشگاه معرفی شود،
        لطفاً از طریق ایمیل با تیم مدیریت تماس بگیرید.
      </p>
      <p className="lead" style={{ marginTop: 8 }}>
        پس از ایجاد شرکت توسط ادمین و تخصیص حساب شما به عنوان نماینده، می‌توانید
        از صفحه‌ی «شرکت من» اطلاعات شرکت را ویرایش کنید.
      </p>
      <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
        <Link to="/" className="btn btn-ghost">بازگشت به خانه</Link>
        <Link to="/exhibition" className="btn btn-primary">مشاهده نمایشگاه</Link>
      </div>
    </div></div>
  );
}
