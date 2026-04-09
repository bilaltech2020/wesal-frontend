"use client";
import { useState } from "react";

const API_URL = "https://wesal-backend-production.up.railway.app";

interface ScrapedProduct {
  id: string; url: string; name: string; price: string; image: string; available: boolean; scrapedAt: string;
}
interface Store { id: string; name: string; url: string; }
interface InventoryResult {
  storeId: string; storeName: string; name: string; price: string; available: boolean; status: "loading" | "done" | "error"; error?: string;
}
interface InventorySearch { id: string; sku: string; results: InventoryResult[]; searchedAt: string; }

type ViewType = "landing" | "login" | "register" | "dashboard" | "competitors" | "inventory";

const NAV = [
  { icon: "⬡", label: "لوحة التحكم", v: "dashboard" },
  { icon: "🔍", label: "مراقبة المنافسين", v: "competitors" },
  { icon: "📦", label: "مراقبة المخزون", v: "inventory" },
  { icon: "◈", label: "التكاملات", v: "dashboard" },
  { icon: "◇", label: "التقارير", v: "dashboard" },
  { icon: "○", label: "الإعدادات", v: "dashboard" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: "#0a0a0f",
  border: "1px solid #2a2a3e", borderRadius: "8px", color: "#e8e8f0",
  fontSize: "13px", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

export default function Home() {
  const [view, setView] = useState<ViewType>("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState<{ email: string; company: string } | null>(null);

  // Competitors
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Inventory
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [skuInput, setSkuInput] = useState("");
  const [searches, setSearches] = useState<InventorySearch[]>([]);
  const [searching, setSearching] = useState(false);

  // ── Auth ──
  const handleLogin = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const res = await fetch(`${API_URL}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail || "خطأ");
      setUser({ email, company: email.split("@")[0] }); setView("dashboard");
    } catch (e: unknown) { setAuthError(e instanceof Error ? e.message : "حدث خطأ"); }
    finally { setAuthLoading(false); }
  };

  const handleRegister = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const res = await fetch(`${API_URL}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, name: companyName }) });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail || "خطأ");
      setUser({ email, company: companyName }); setView("dashboard");
    } catch (e: unknown) { setAuthError(e instanceof Error ? e.message : "حدث خطأ"); }
    finally { setAuthLoading(false); }
  };

  // ── Competitors ──
  const handleScrape = async (targetUrl: string, existingId?: string) => {
    if (!targetUrl.trim()) return;
    if (existingId) setRefreshingId(existingId); else setScrapeLoading(true);
    setScrapeError("");
    try {
      const res = await fetch(`${API_URL}/scrape`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: targetUrl }) });
      if (!res.ok) throw new Error("فشل في جلب البيانات");
      const data = await res.json();
      const product: ScrapedProduct = { id: existingId || Math.random().toString(36).slice(2), url: targetUrl, name: data.name || "—", price: data.price || "—", image: data.image || "", available: !!data.name, scrapedAt: new Date().toLocaleTimeString("ar-SA") };
      if (existingId) setProducts(p => p.map(x => x.id === existingId ? product : x));
      else { setProducts(p => [product, ...p]); setScrapeUrl(""); }
    } catch (e: unknown) { setScrapeError(e instanceof Error ? e.message : "خطأ"); }
    finally { setScrapeLoading(false); setRefreshingId(null); }
  };

  // ── Inventory ──
  const addStore = () => {
    if (!storeName.trim() || !storeUrl.trim()) return;
    const url = storeUrl.startsWith("http") ? storeUrl.trim() : "https://" + storeUrl.trim();
    setStores(p => [...p, { id: Math.random().toString(36).slice(2), name: storeName.trim(), url }]);
    setStoreName(""); setStoreUrl("");
  };

  const doSearch = async () => {
    if (!skuInput.trim() || stores.length === 0) return;
    setSearching(true);
    const sid = Math.random().toString(36).slice(2);
    const sku = skuInput.trim();
    const init: InventoryResult[] = stores.map(s => ({ storeId: s.id, storeName: s.name, name: "", price: "", available: false, status: "loading" }));
    setSearches(p => [{ id: sid, sku, results: init, searchedAt: new Date().toLocaleTimeString("ar-SA") }, ...p]);
    setSkuInput("");
    await Promise.all(stores.map(async (store) => {
      try {
        const searchUrl = `${store.url}/search?q=${encodeURIComponent(sku)}`;
        const res = await fetch(`${API_URL}/scrape`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: searchUrl }) });
        const data = await res.json();
        setSearches(p => p.map(s => s.id !== sid ? s : { ...s, results: s.results.map(r => r.storeId !== store.id ? r : { ...r, name: data.name || "0", price: data.price || "0", available: !!(data.name && data.name !== "0"), status: "done" as const }) }));
      } catch {
        setSearches(p => p.map(s => s.id !== sid ? s : { ...s, results: s.results.map(r => r.storeId !== store.id ? r : { ...r, status: "error" as const, error: "فشل الاتصال" }) }));
      }
    }));
    setSearching(false);
  };

  // ── Sidebar JSX ──
  const sidebarJSX = (
    <div style={{ width: "240px", background: "#111118", borderLeft: "1px solid #1e1e2e", padding: "32px 20px", display: "flex", flexDirection: "column", gap: "8px", minHeight: "100vh", flexShrink: 0 }}>
      <div style={{ fontSize: "22px", fontWeight: "900", color: "#c8b8ff", marginBottom: "32px" }}>وصال</div>
      {NAV.map(item => (
        <div key={item.label} onClick={() => setView(item.v as ViewType)}
          style={{ padding: "10px 14px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", background: view === item.v && (item.v === "competitors" || item.v === "inventory") ? "#1a1a2e" : view === "dashboard" && item.v === "dashboard" && item.label === "لوحة التحكم" ? "#1a1a2e" : "transparent", color: (view === item.v && (item.v === "competitors" || item.v === "inventory")) || (view === "dashboard" && item.label === "لوحة التحكم") ? "#c8b8ff" : "#666", fontSize: "14px", fontWeight: "500" }}>
          <span>{item.icon}</span>{item.label}
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: "10px 14px", borderRadius: "10px", background: "#1a1a2e", cursor: "pointer" }} onClick={() => { setView("landing"); setUser(null); }}>
        <span style={{ color: "#ff6b6b", fontSize: "14px" }}>⬡ تسجيل الخروج</span>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // INVENTORY VIEW
  // ══════════════════════════════════════
  if (view === "inventory") return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {sidebarJSX}
        <div style={{ flex: 1, padding: "40px", overflowY: "auto" }}>
          <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px" }}>مراقبة المخزون 📦</h1>
          <p style={{ color: "#555", fontSize: "13px", margin: "0 0 32px" }}>أضف المتاجر واكتب SKU للبحث في عدة متاجر بنفس الوقت</p>

          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", alignItems: "start" }}>

            {/* ─ Stores Panel ─ */}
            <div>
              <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#888", fontWeight: "600" }}>إضافة متجر</p>
                <input
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  placeholder="اسم المتجر"
                  style={{ ...inputStyle, marginBottom: "8px" }}
                />
                <input
                  value={storeUrl}
                  onChange={e => setStoreUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addStore()}
                  placeholder="https://store.com"
                  style={{ ...inputStyle, marginBottom: "10px", direction: "ltr", textAlign: "left" }}
                />
                <button
                  onClick={addStore}
                  style={{ width: "100%", padding: "10px", background: "#c8b8ff", color: "#0a0a0f", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}
                >
                  + إضافة
                </button>
              </div>

              {stores.length > 0 && (
                <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e2e", fontSize: "11px", color: "#555", fontWeight: "600" }}>المتاجر ({stores.length})</div>
                  {stores.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #141420", gap: "8px" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: "13px", fontWeight: "500" }}>{s.name}</div>
                        <div style={{ fontSize: "11px", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "ltr", textAlign: "left" }}>{s.url}</div>
                      </div>
                      <button onClick={() => setStores(p => p.filter(x => x.id !== s.id))} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "13px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─ Search Panel ─ */}
            <div>
              <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "20px", marginBottom: "24px" }}>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#888", fontWeight: "600" }}>بحث بـ SKU أو اسم المنتج</p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    value={skuInput}
                    onChange={e => setSkuInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && doSearch()}
                    placeholder="مثال: كنبة L-shape أو SKU-1234"
                    style={{ flex: 1, padding: "12px 16px", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={doSearch}
                    disabled={searching || !skuInput.trim() || stores.length === 0}
                    style={{ padding: "12px 22px", background: (searching || stores.length === 0) ? "#2a2a3e" : "#c8b8ff", color: (searching || stores.length === 0) ? "#888" : "#0a0a0f", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: (searching || stores.length === 0) ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                  >
                    {searching ? "جاري البحث..." : "بحث في الكل ←"}
                  </button>
                </div>
                {stores.length === 0 && <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#ff6b6b" }}>⚠️ أضف متجراً أولاً</p>}
              </div>

              {searches.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#333" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>📦</div>
                  <p style={{ fontSize: "14px", margin: 0 }}>ابحث عن منتج لترى النتائج هنا</p>
                </div>
              ) : searches.map(search => (
                <div key={search.id} style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "700", color: "#c8b8ff" }}>{search.sku}</span>
                    <span style={{ fontSize: "11px", color: "#555" }}>{search.searchedAt}</span>
                    <span style={{ marginRight: "auto", fontSize: "11px", color: "#555" }}>{search.results.filter(r => r.status === "done" && r.available).length} متوفر من {search.results.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1px", background: "#141420" }}>
                    {search.results.map(r => (
                      <div key={r.storeId} style={{ background: "#111118", padding: "16px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "600", color: "#666", marginBottom: "8px" }}>{r.storeName}</div>
                        {r.status === "loading" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#555", fontSize: "12px" }}>
                            <span style={{ width: 12, height: 12, border: "2px solid #333", borderTopColor: "#c8b8ff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                            جاري...
                          </div>
                        ) : r.status === "error" ? (
                          <div style={{ fontSize: "12px", color: "#ff6b6b" }}>⚠️ {r.error}</div>
                        ) : (
                          <>
                            <div style={{ fontSize: "13px", marginBottom: "4px", color: "#e8e8f0" }}>{r.name}</div>
                            <div style={{ fontSize: "15px", fontWeight: "700", color: "#c8b8ff", marginBottom: "8px" }}>{r.price}</div>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: r.available ? "#0d1f0d" : "#1f0d0d", color: r.available ? "#4ade80" : "#f87171", border: "1px solid " + (r.available ? "#1a3a1a" : "#3a1a1a") }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: r.available ? "#4ade80" : "#f87171" }} />
                              {r.available ? "متوفر" : "غير متوفر"}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // COMPETITORS VIEW
  // ══════════════════════════════════════
  if (view === "competitors") return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {sidebarJSX}
        <div style={{ flex: 1, padding: "40px" }}>
          <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px" }}>مراقبة المنافسين 🔍</h1>
          <p style={{ color: "#555", fontSize: "13px", margin: "0 0 28px" }}>أضف روابط منتجات المنافسين لتتبع أسعارهم وتوفرهم</p>
          <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "24px", marginBottom: "28px" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <input value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleScrape(scrapeUrl)} placeholder="https://competitor-store.com/products/sofa"
                style={{ flex: 1, padding: "12px 16px", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit", direction: "ltr", textAlign: "left" }} />
              <button onClick={() => handleScrape(scrapeUrl)} disabled={scrapeLoading || !scrapeUrl.trim()}
                style={{ background: scrapeLoading ? "#2a2a3e" : "#c8b8ff", color: scrapeLoading ? "#888" : "#0a0a0f", border: "none", borderRadius: "10px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", cursor: scrapeLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {scrapeLoading ? "جاري..." : "جلب البيانات ←"}
              </button>
            </div>
            {scrapeError && <div style={{ marginTop: "12px", padding: "10px", background: "#1a0a0a", border: "1px solid #3a1a1a", borderRadius: "8px", fontSize: "13px", color: "#ff6b6b" }}>⚠️ {scrapeError}</div>}
          </div>
          {products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#333" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
              <p style={{ fontSize: "15px", margin: 0 }}>أضف رابط منتج لبدء المراقبة</p>
            </div>
          ) : (
            <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 130px 110px 90px 80px", padding: "12px 20px", borderBottom: "1px solid #1e1e2e", fontSize: "11px", color: "#555", fontWeight: "600" }}>
                <span>صورة</span><span>المنتج</span><span>السعر</span><span>التوفر</span><span>التحديث</span><span></span>
              </div>
              {products.map((p, i) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "70px 1fr 130px 110px 90px 80px", padding: "16px 20px", alignItems: "center", borderBottom: i < products.length - 1 ? "1px solid #141420" : "none" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "10px", background: "#1a1a2e", overflow: "hidden", border: "1px solid #2a2a3e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {p.image ? <img src={p.image.startsWith("//") ? "https:" + p.image : p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <span style={{ fontSize: "20px" }}>🪑</span>}
                  </div>
                  <div style={{ paddingRight: "8px" }}>
                    <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "4px" }}>{p.name}</div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#555", textDecoration: "none", direction: "ltr", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "280px" }}>{p.url}</a>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "700", color: "#c8b8ff" }}>{p.price}</div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", background: p.available ? "#0d1f0d" : "#1f0d0d", color: p.available ? "#4ade80" : "#f87171", border: "1px solid " + (p.available ? "#1a3a1a" : "#3a1a1a") }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.available ? "#4ade80" : "#f87171" }} />
                    {p.available ? "متوفر" : "غير متوفر"}
                  </span>
                  <div style={{ fontSize: "12px", color: "#555" }}>{p.scrapedAt}</div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => handleScrape(p.url, p.id)} disabled={refreshingId === p.id} style={{ background: "none", border: "1px solid #2a2a3e", borderRadius: "8px", width: 30, height: 30, cursor: "pointer", color: "#888", fontSize: "14px" }}>↻</button>
                    <button onClick={() => setProducts(p2 => p2.filter(x => x.id !== p.id))} style={{ background: "none", border: "1px solid #2a2a3e", borderRadius: "8px", width: 30, height: 30, cursor: "pointer", color: "#555", fontSize: "12px" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // DASHBOARD VIEW
  // ══════════════════════════════════════
  if (view === "dashboard") return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#0a0a0f", color: "#e8e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {sidebarJSX}
        <div style={{ flex: 1, padding: "40px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 6px" }}>أهلاً، {user?.company} 👋</h1>
          <p style={{ color: "#555", marginTop: "6px", fontSize: "14px", marginBottom: "32px" }}>هذه نظرة عامة على نشاطك</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
            {[{ label: "العمليات النشطة", value: "0", color: "#c8b8ff" }, { label: "التكاملات", value: "0", color: "#80ffdb" }, { label: "المهام المكتملة", value: "0", color: "#ffd166" }, { label: "التوفير في الوقت", value: "0h", color: "#ff6b6b" }].map(stat => (
              <div key={stat.label} style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "24px" }}>
                <div style={{ fontSize: "28px", fontWeight: "900", color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: "12px", color: "#555", marginTop: "6px" }}>{stat.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "linear-gradient(135deg, #1a1a2e, #16213e)", border: "1px solid #2a2a4e", borderRadius: "20px", padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🚀</div>
            <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#c8b8ff", margin: "0 0 12px" }}>مرحباً بك في وصال</h2>
            <p style={{ color: "#666", fontSize: "14px", lineHeight: "1.8", maxWidth: "400px", margin: "0 auto 24px" }}>منصتك لأتمتة عمليات التجارة الإلكترونية.</p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={() => setView("competitors")} style={{ background: "#c8b8ff", color: "#0a0a0f", border: "none", borderRadius: "12px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>مراقبة المنافسين 🔍</button>
              <button onClick={() => setView("inventory")} style={{ background: "#1a1a2e", color: "#c8b8ff", border: "1px solid #2a2a4e", borderRadius: "12px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>مراقبة المخزون 📦</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // LOGIN / REGISTER
  // ══════════════════════════════════════
  if (view === "login" || view === "register") return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <div style={{ width: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "36px", fontWeight: "900", color: "#c8b8ff" }}>وصال</div>
          <p style={{ color: "#555", marginTop: "8px", fontSize: "14px" }}>{view === "login" ? "سجل دخولك للمتابعة" : "أنشئ حساباً جديداً"}</p>
        </div>
        <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "20px", padding: "32px" }}>
          {view === "register" && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "13px", color: "#888", display: "block", marginBottom: "8px" }}>اسم الشركة</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="شركتي للتجارة"
                style={{ width: "100%", padding: "12px 16px", background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
          )}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "13px", color: "#888", display: "block", marginBottom: "8px" }}>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@company.com"
              style={{ width: "100%", padding: "12px 16px", background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: "24px" }}>
            <label style={{ fontSize: "13px", color: "#888", display: "block", marginBottom: "8px" }}>كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              style={{ width: "100%", padding: "12px 16px", background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
          </div>
          {authError && <div style={{ color: "#ff6b6b", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>{authError}</div>}
          <button onClick={view === "login" ? handleLogin : handleRegister} disabled={authLoading}
            style={{ width: "100%", padding: "14px", background: "#c8b8ff", color: "#0a0a0f", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "700", cursor: authLoading ? "not-allowed" : "pointer", opacity: authLoading ? 0.7 : 1 }}>
            {authLoading ? "جاري التحميل..." : view === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
          </button>
          <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#555" }}>
            {view === "login"
              ? <span>ليس لديك حساب؟ <span style={{ color: "#c8b8ff", cursor: "pointer" }} onClick={() => setView("register")}>سجل الآن</span></span>
              : <span>لديك حساب؟ <span style={{ color: "#c8b8ff", cursor: "pointer" }} onClick={() => setView("login")}>سجل دخولك</span></span>}
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <span style={{ color: "#555", fontSize: "13px", cursor: "pointer" }} onClick={() => setView("landing")}>← العودة للرئيسية</span>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // LANDING PAGE
  // ══════════════════════════════════════
  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", background: "#0a0a0f", color: "#e8e8f0", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 60px", borderBottom: "1px solid #1e1e2e" }}>
        <div style={{ fontSize: "26px", fontWeight: "900", color: "#c8b8ff" }}>وصال</div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={() => setView("login")} style={{ padding: "10px 24px", background: "transparent", border: "1px solid #2a2a4e", borderRadius: "10px", color: "#888", fontSize: "14px", cursor: "pointer" }}>دخول</button>
          <button onClick={() => setView("register")} style={{ padding: "10px 24px", background: "#c8b8ff", border: "none", borderRadius: "10px", color: "#0a0a0f", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>ابدأ مجاناً</button>
        </div>
      </nav>
      <div style={{ textAlign: "center", padding: "100px 60px 80px" }}>
        <h1 style={{ fontSize: "64px", fontWeight: "900", lineHeight: "1.1", margin: "0 0 24px", letterSpacing: "-2px" }}>أتمتة عمليات<br /><span style={{ color: "#c8b8ff" }}>تجارتك الإلكترونية</span></h1>
        <p style={{ fontSize: "18px", color: "#555", maxWidth: "500px", margin: "0 auto 40px", lineHeight: "1.8" }}>وصال يربط متاجرك، يدير طلباتك، ويشغّل AI agent يتصفح ويشتري بشكل تلقائي</p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button onClick={() => setView("register")} style={{ padding: "16px 36px", background: "#c8b8ff", border: "none", borderRadius: "14px", color: "#0a0a0f", fontSize: "16px", fontWeight: "800", cursor: "pointer" }}>ابدأ مجاناً</button>
          <button onClick={() => setView("login")} style={{ padding: "16px 36px", background: "transparent", border: "1px solid #2a2a4e", borderRadius: "14px", color: "#888", fontSize: "16px", cursor: "pointer" }}>تسجيل الدخول</button>
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "24px", borderTop: "1px solid #1e1e2e", color: "#333", fontSize: "12px" }}>© 2025 وصال — جميع الحقوق محفوظة</div>
    </div>
  );
}
