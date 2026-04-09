"use client";
import { useState } from "react";

const API_URL = "https://wesal-backend-production.up.railway.app";

interface ScrapedProduct {
  id: string;
  url: string;
  name: string;
  price: string;
  image: string;
  available: boolean;
  scrapedAt: string;
}

export default function Home() {
  const [view, setView] = useState<"landing" | "login" | "register" | "dashboard" | "competitors">("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ email: string; company: string } | null>(null);

  // Competitors state
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail || "خطأ في تسجيل الدخول");
      setUser({ email, company: email.split("@")[0] });
      setView("dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: companyName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail || "خطأ في التسجيل");
      setUser({ email, company: companyName });
      setView("dashboard");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async (targetUrl: string, existingId?: string) => {
    if (!targetUrl.trim()) return;
    if (existingId) setRefreshingId(existingId);
    else setScrapeLoading(true);
    setScrapeError("");
    try {
      const res = await fetch(`${API_URL}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!res.ok) throw new Error("فشل في جلب البيانات");
      const data = await res.json();
      const product: ScrapedProduct = {
        id: existingId || Math.random().toString(36).slice(2),
        url: targetUrl,
        name: data.name || "اسم غير متوفر",
        price: data.price || "—",
        image: data.image || "",
        available: !!data.name,
        scrapedAt: new Date().toLocaleTimeString("ar-SA"),
      };
      if (existingId) {
        setProducts((prev) => prev.map((p) => (p.id === existingId ? product : p)));
      } else {
        setProducts((prev) => [product, ...prev]);
        setScrapeUrl("");
      }
    } catch (e: unknown) {
      setScrapeError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setScrapeLoading(false);
      setRefreshingId(null);
    }
  };

  // Sidebar
  const sidebarItems = [
    { icon: "⬡", label: "لوحة التحكم", viewKey: "dashboard" },
    { icon: "◈", label: "التكاملات", viewKey: "dashboard" },
    { icon: "◉", label: "العملاء", viewKey: "dashboard" },
    { icon: "◎", label: "الأتمتة", viewKey: "dashboard" },
    { icon: "🔍", label: "مراقبة المنافسين", viewKey: "competitors" },
    { icon: "◇", label: "التقارير", viewKey: "dashboard" },
    { icon: "○", label: "الإعدادات", viewKey: "dashboard" },
  ];

  const Sidebar = () => (
    <div style={{ width: "240px", background: "#111118", borderLeft: "1px solid #1e1e2e", padding: "32px 20px", display: "flex", flexDirection: "column", gap: "8px", minHeight: "100vh" }}>
      <div style={{ fontSize: "22px", fontWeight: "900", color: "#c8b8ff", marginBottom: "32px", letterSpacing: "-0.5px" }}>وصال</div>
      {sidebarItems.map((item) => (
        <div
          key={item.label}
          onClick={() => setView(item.viewKey as "dashboard" | "competitors")}
          style={{
            padding: "10px 14px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px",
            background: view === item.viewKey && item.viewKey === "competitors" && view === "competitors"
              ? "#1a1a2e"
              : view === "dashboard" && item.viewKey === "dashboard" && item.label === "لوحة التحكم"
              ? "#1a1a2e"
              : "transparent",
            color: (view === "competitors" && item.viewKey === "competitors") || (view === "dashboard" && item.label === "لوحة التحكم")
              ? "#c8b8ff" : "#666",
            fontSize: "14px", fontWeight: "500", transition: "all 0.2s",
          }}
        >
          <span style={{ fontSize: "16px" }}>{item.icon}</span>
          {item.label}
        </div>
      ))}
      <div
        style={{ marginTop: "auto", padding: "10px 14px", borderRadius: "10px", background: "#1a1a2e", cursor: "pointer" }}
        onClick={() => { setView("landing"); setUser(null); }}
      >
        <span style={{ color: "#ff6b6b", fontSize: "14px" }}>⬡ تسجيل الخروج</span>
      </div>
    </div>
  );

  // ─── Competitors View ───
  if (view === "competitors") {
    return (
      <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar />
          <div style={{ flex: 1, padding: "40px" }}>
            <div style={{ marginBottom: "32px" }}>
              <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px", color: "#e8e8f0" }}>مراقبة المنافسين</h1>
              <p style={{ color: "#555", fontSize: "13px", margin: 0 }}>أضف روابط منتجات المنافسين لتتبع أسعارهم وتوفرهم</p>
            </div>

            {/* Input */}
            <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "24px", marginBottom: "28px" }}>
              <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#666" }}>رابط منتج المنافس</p>
              <div style={{ display: "flex", gap: "12px" }}>
                <input
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScrape(scrapeUrl)}
                  placeholder="https://competitor-store.com/products/sofa"
                  style={{
                    flex: 1, background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "10px",
                    padding: "12px 16px", color: "#e8e8f0", fontSize: "14px", outline: "none",
                    fontFamily: "inherit", direction: "ltr", textAlign: "left",
                  }}
                />
                <button
                  onClick={() => handleScrape(scrapeUrl)}
                  disabled={scrapeLoading || !scrapeUrl.trim()}
                  style={{
                    background: scrapeLoading ? "#2a2a3e" : "#c8b8ff", color: scrapeLoading ? "#888" : "#0a0a0f",
                    border: "none", borderRadius: "10px", padding: "12px 24px", fontSize: "14px",
                    fontWeight: "700", cursor: scrapeLoading ? "not-allowed" : "pointer", fontFamily: "inherit", minWidth: "110px",
                  }}
                >
                  {scrapeLoading ? "جاري..." : "جلب البيانات ←"}
                </button>
              </div>
              {scrapeError && (
                <div style={{ marginTop: "12px", padding: "10px 14px", background: "#1a0a0a", border: "1px solid #3a1a1a", borderRadius: "8px", fontSize: "13px", color: "#ff6b6b" }}>
                  ⚠️ {scrapeError}
                </div>
              )}
            </div>

            {/* Products Table */}
            {products.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#333" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
                <p style={{ fontSize: "15px", margin: 0 }}>أضف رابط منتج لبدء المراقبة</p>
              </div>
            ) : (
              <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 130px 110px 90px 80px", padding: "12px 20px", borderBottom: "1px solid #1e1e2e", fontSize: "11px", color: "#555", fontWeight: "600", letterSpacing: "0.5px" }}>
                  <span>صورة</span><span>المنتج</span><span>السعر</span><span>التوفر</span><span>التحديث</span><span></span>
                </div>
                {products.map((p, i) => (
                  <div
                    key={p.id}
                    style={{
                      display: "grid", gridTemplateColumns: "70px 1fr 130px 110px 90px 80px",
                      padding: "16px 20px", alignItems: "center",
                      borderBottom: i < products.length - 1 ? "1px solid #141420" : "none",
                    }}
                  >
                    {/* Image */}
                    <div style={{ width: "48px", height: "48px", borderRadius: "10px", background: "#1a1a2e", overflow: "hidden", border: "1px solid #2a2a3e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.image ? (
                        <img src={p.image.startsWith("//") ? "https:" + p.image : p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : <span style={{ fontSize: "20px" }}>🪑</span>}
                    </div>
                    {/* Name */}
                    <div style={{ paddingRight: "8px" }}>
                      <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "4px" }}>{p.name}</div>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#555", textDecoration: "none", direction: "ltr", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "280px" }}>{p.url}</a>
                    </div>
                    {/* Price */}
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#c8b8ff" }}>{p.price}</div>
                    {/* Available */}
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", background: p.available ? "#0d1f0d" : "#1f0d0d", color: p.available ? "#4ade80" : "#f87171", border: `1px solid ${p.available ? "#1a3a1a" : "#3a1a1a"}` }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: p.available ? "#4ade80" : "#f87171" }} />
                        {p.available ? "متوفر" : "غير متوفر"}
                      </span>
                    </div>
                    {/* Time */}
                    <div style={{ fontSize: "12px", color: "#555" }}>{p.scrapedAt}</div>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => handleScrape(p.url, p.id)} disabled={refreshingId === p.id} style={{ background: "none", border: "1px solid #2a2a3e", borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", color: "#888", fontSize: "14px" }}>↻</button>
                      <button onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))} style={{ background: "none", border: "1px solid #2a2a3e", borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", color: "#555", fontSize: "12px" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {products.length > 1 && (
              <div style={{ marginTop: "16px", textAlign: "left" }}>
                <button onClick={() => products.forEach((p) => handleScrape(p.url, p.id))} style={{ background: "none", border: "1px solid #2a2a3e", borderRadius: "10px", padding: "10px 20px", color: "#888", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                  ↻ تحديث الكل
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Dashboard View ───
  if (view === "dashboard") {
    return (
      <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar />
          <div style={{ flex: 1, padding: "40px" }}>
            <div style={{ marginBottom: "40px" }}>
              <h1 style={{ fontSize: "28px", fontWeight: "800", margin: 0, color: "#e8e8f0" }}>أهلاً، {user?.company} 👋</h1>
              <p style={{ color: "#555", marginTop: "6px", fontSize: "14px" }}>هذه نظرة عامة على نشاطك</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
              {[
                { label: "العمليات النشطة", value: "0", color: "#c8b8ff", icon: "◈" },
                { label: "التكاملات", value: "0", color: "#80ffdb", icon: "◉" },
                { label: "المهام المكتملة", value: "0", color: "#ffd166", icon: "◎" },
                { label: "التوفير في الوقت", value: "0h", color: "#ff6b6b", icon: "◇" },
              ].map((stat) => (
                <div key={stat.label} style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "24px", position: "relative", overflow: "hidden" }}>
                  <div style={{ fontSize: "28px", fontWeight: "900", color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: "12px", color: "#555", marginTop: "6px" }}>{stat.label}</div>
                  <div style={{ position: "absolute", top: "16px", left: "16px", fontSize: "24px", color: stat.color, opacity: 0.15 }}>{stat.icon}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", border: "1px solid #2a2a4e", borderRadius: "20px", padding: "40px", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🚀</div>
              <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#c8b8ff", margin: "0 0 12px" }}>مرحباً بك في وصال</h2>
              <p style={{ color: "#666", fontSize: "14px", lineHeight: "1.8", maxWidth: "400px", margin: "0 auto 24px" }}>منصتك لأتمتة عمليات التجارة الإلكترونية. ابدأ بإضافة أول تكامل لك.</p>
              <button
                onClick={() => setView("competitors")}
                style={{ background: "#c8b8ff", color: "#0a0a0f", border: "none", borderRadius: "12px", padding: "12px 28px", fontSize: "15px", fontWeight: "700", cursor: "pointer" }}
              >
                راقب المنافسين 🔍
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Login / Register ───
  if (view === "login" || view === "register") {
    return (
      <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
        <div style={{ width: "400px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{ fontSize: "36px", fontWeight: "900", color: "#c8b8ff", letterSpacing: "-1px" }}>وصال</div>
            <p style={{ color: "#555", marginTop: "8px", fontSize: "14px" }}>{view === "login" ? "سجل دخولك للمتابعة" : "أنشئ حساباً جديداً"}</p>
          </div>
          <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "20px", padding: "32px" }}>
            {view === "register" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "13px", color: "#888", display: "block", marginBottom: "8px" }}>اسم الشركة</label>
                <input
                  value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="شركتي للتجارة"
                  style={{ width: "100%", padding: "12px 16px", background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                />
              </div>
            )}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "13px", color: "#888", display: "block", marginBottom: "8px" }}>البريد الإلكتروني</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="example@company.com"
                style={{ width: "100%", padding: "12px 16px", background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "24px" }}>
              <label style={{ fontSize: "13px", color: "#888", display: "block", marginBottom: "8px" }}>كلمة المرور</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", padding: "12px 16px", background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            {error && <div style={{ color: "#ff6b6b", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>{error}</div>}
            <button
              onClick={view === "login" ? handleLogin : handleRegister}
              disabled={loading}
              style={{ width: "100%", padding: "14px", background: "#c8b8ff", color: "#0a0a0f", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "جاري التحميل..." : view === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
            </button>
            <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#555" }}>
              {view === "login" ? (
                <span>ليس لديك حساب؟ <span style={{ color: "#c8b8ff", cursor: "pointer" }} onClick={() => setView("register")}>سجل الآن</span></span>
              ) : (
                <span>لديك حساب؟ <span style={{ color: "#c8b8ff", cursor: "pointer" }} onClick={() => setView("login")}>سجل دخولك</span></span>
              )}
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: "24px" }}>
            <span style={{ color: "#555", fontSize: "13px", cursor: "pointer" }} onClick={() => setView("landing")}>← العودة للرئيسية</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Landing Page ───
  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", background: "#0a0a0f", color: "#e8e8f0", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 60px", borderBottom: "1px solid #1e1e2e" }}>
        <div style={{ fontSize: "26px", fontWeight: "900", color: "#c8b8ff", letterSpacing: "-0.5px" }}>وصال</div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={() => setView("login")} style={{ padding: "10px 24px", background: "transparent", border: "1px solid #2a2a4e", borderRadius: "10px", color: "#888", fontSize: "14px", cursor: "pointer" }}>دخول</button>
          <button onClick={() => setView("register")} style={{ padding: "10px 24px", background: "#c8b8ff", border: "none", borderRadius: "10px", color: "#0a0a0f", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>ابدأ مجاناً</button>
        </div>
      </nav>
      <div style={{ textAlign: "center", padding: "100px 60px 80px", position: "relative" }}>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(200,184,255,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <div style={{ display: "inline-block", padding: "6px 16px", background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: "20px", fontSize: "12px", color: "#c8b8ff", marginBottom: "24px" }}>منصة SaaS للتجارة الإلكترونية 🚀</div>
        <h1 style={{ fontSize: "64px", fontWeight: "900", lineHeight: "1.1", margin: "0 0 24px", letterSpacing: "-2px" }}>
          أتمتة عمليات<br /><span style={{ color: "#c8b8ff" }}>تجارتك الإلكترونية</span>
        </h1>
        <p style={{ fontSize: "18px", color: "#555", maxWidth: "500px", margin: "0 auto 40px", lineHeight: "1.8" }}>وصال يربط متاجرك، يدير طلباتك، ويشغّل AI agent يتصفح ويشتري بشكل تلقائي</p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button onClick={() => setView("register")} style={{ padding: "16px 36px", background: "#c8b8ff", border: "none", borderRadius: "14px", color: "#0a0a0f", fontSize: "16px", fontWeight: "800", cursor: "pointer" }}>ابدأ مجاناً</button>
          <button onClick={() => setView("login")} style={{ padding: "16px 36px", background: "transparent", border: "1px solid #2a2a4e", borderRadius: "14px", color: "#888", fontSize: "16px", cursor: "pointer" }}>تسجيل الدخول</button>
        </div>
      </div>
      <div style={{ padding: "60px", borderTop: "1px solid #1e1e2e" }}>
        <h2 style={{ textAlign: "center", fontSize: "36px", fontWeight: "800", marginBottom: "48px", letterSpacing: "-1px" }}>كل ما تحتاجه في مكان واحد</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", maxWidth: "900px", margin: "0 auto" }}>
          {[
            { icon: "◈", title: "AI Shopping Agent", desc: "يتصفح المواقع ويشتري المنتجات تلقائياً بدون تدخل" },
            { icon: "◉", title: "ربط المتاجر", desc: "يتكامل مع Shopify وInstagram وأي منصة تجارية" },
            { icon: "◎", title: "إدارة الطلبات", desc: "تتبع كل طلب من اللحظة الأولى حتى التسليم" },
            { icon: "◇", title: "لوحة تحكم ذكية", desc: "إحصائيات وتقارير لحظية لمتجرك" },
            { icon: "○", title: "Multi-tenant", desc: "خدم عدة متاجر وعملاء من نفس المنصة" },
            { icon: "🔍", title: "مراقبة المنافسين", desc: "تتبع أسعار المنافسين وتوفر منتجاتهم تلقائياً" },
          ].map((f) => (
            <div key={f.title} style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "28px" }}>
              <div style={{ fontSize: "28px", color: "#c8b8ff", marginBottom: "12px" }}>{f.icon}</div>
              <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "8px" }}>{f.title}</div>
              <div style={{ fontSize: "13px", color: "#555", lineHeight: "1.7" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "80px 60px", borderTop: "1px solid #1e1e2e" }}>
        <h2 style={{ fontSize: "40px", fontWeight: "900", marginBottom: "16px", letterSpacing: "-1px" }}>جاهز تبدأ؟</h2>
        <p style={{ color: "#555", fontSize: "16px", marginBottom: "32px" }}>انضم الآن وأتمت عمليات متجرك</p>
        <button onClick={() => setView("register")} style={{ padding: "16px 48px", background: "#c8b8ff", border: "none", borderRadius: "14px", color: "#0a0a0f", fontSize: "18px", fontWeight: "800", cursor: "pointer" }}>ابدأ مجاناً ←</button>
      </div>
      <div style={{ textAlign: "center", padding: "24px", borderTop: "1px solid #1e1e2e", color: "#333", fontSize: "12px" }}>© 2025 وصال — جميع الحقوق محفوظة</div>
    </div>
  );
}
