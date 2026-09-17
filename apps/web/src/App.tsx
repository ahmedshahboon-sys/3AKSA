import { Navigate, Route, Routes } from 'react-router-dom';

const navItems = ['الرئيسية', 'الغرف', 'القريبون', 'الخاص', 'حسابي'];

function FoundationHome() {
  return (
    <main className="page-shell">
      <section className="hero-card" aria-labelledby="foundation-title">
        <span className="brand-mark" aria-hidden="true">3A</span>
        <div>
          <p className="eyebrow">3AKSA · عكسة</p>
          <h1 id="foundation-title">الهيكلية الأساسية جاهزة للبناء</h1>
          <p className="muted">
            واجهة Mobile First مستقلة ومهيأة للعمل تحت مسار قابل للتغيير بدون ربطها برمجياً بمربوعة.
          </p>
        </div>
      </section>
    </main>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<FoundationHome />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {navItems.map((label, index) => (
          <button key={label} className={index === 0 ? 'nav-item active' : 'nav-item'} type="button">
            <span className="nav-dot" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
