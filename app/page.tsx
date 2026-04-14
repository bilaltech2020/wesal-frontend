// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";

function loadXLSX(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).XLSX) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

const API_URL = "https://wesal-backend-production.up.railway.app";

interface ScrapedProduct {
  id: string; url: string; name: string; price: string; image: string; available: boolean; scrapedAt: string;
}
interface Store { id: string; name: string; url: string; urlTemplate: string; }
interface ProductResult {
  name: string; url: string; price: string; available: boolean; snippet: string;
}
interface InventoryResult {
  storeId: string; storeName: string; count: number; products: ProductResult[]; status: "loading" | "done" | "error"; error?: string;
}
interface InventorySearch { id: string; sku: string; results: InventoryResult[]; searchedAt: string; }

type ViewType = "landing" | "login" | "register" | "dashboard" | "competitors" | "inventory" | "reports";

const NAV = [
  { icon: "⬡", label: "لوحة التحكم", v: "dashboard" },
  { icon: "🔍", label: "مراقبة المنافسين", v: "competitors" },
  { icon: "📦", label: "مراقبة المخزون", v: "inventory" },
  { icon: "◈", label: "التكاملات", v: "dashboard" },
  { icon: "◇", label: "التقارير", v: "reports" },
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

  useEffect(() => {
    loadXLSX();
    const token = localStorage.getItem("wesal_token");
    const savedUser = localStorage.getItem("wesal_user");
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      setView("dashboard");
    }
  }, []);

  // Competitors
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Inventory
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [storeTemplate, setStoreTemplate] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [skuInput, setSkuInput] = useState("");
  const [searches, setSearches] = useState<InventorySearch[]>([]);
  const [searching, setSearching] = useState(false);

  // Excel upload
  const [excelRows, setExcelRows] = useState<Record<string, string>[]>([]);
  const [excelCols, setExcelCols] = useState<string[]>([]);
  const [searchCol, setSearchCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [excelSearching, setExcelSearching] = useState(false);
  const [excelResults, setExcelResults] = useState<{sku:string; productName:string; storeName:string; price:string; url:string; found:boolean}[]>([]);
  const [excelFileName, setExcelFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlCol, setUrlCol] = useState("");

  // Reports / KPIs
  const [activeKpi, setActiveKpi] = useState<number | null>(null);

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    await loadXLSX();
    const XLSX = (window as any).XLSX;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      setExcelCols(cols);
      setSearchCol(cols[0]);
      setNameCol(cols[0]);
      // Auto-detect URL column
      const urlColCandidate = cols.find(c => c.toLowerCase().includes("url") || c.toLowerCase().includes("link"));
      setUrlCol(urlColCandidate || "");
      setExcelRows(rows);
    }
  };

  const handleExcelSearch = async () => {
    if (!searchCol || excelRows.length === 0 || stores.length === 0) return;
    setExcelSearching(true);
    setExcelResults([]);
    const allResults: {sku:string; productName:string; storeName:string; price:string; url:string; found:boolean}[] = [];
    for (const row of excelRows.slice(0, 50)) {
      const sku = String(row[searchCol] || "").trim();
      const productName = String(row[nameCol] || sku).trim();
      if (!sku) continue;
      let found = false;
      // إذا عندنا عمود URL، نستخدمه مباشرة بدون المتاجر
      const directUrl = urlCol ? String(row[urlCol] || "").trim() : "";
      if (directUrl && directUrl.startsWith("http")) {
        try {
          const res = await fetch(`${API_URL}/scrape-dynamic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: directUrl }) });
          const data = await res.json();
          if (data.name && data.name !== "0") {
            allResults.push({ sku, productName, storeName: "مباشر", price: data.price || "—", url: directUrl, found: true });
            found = true;
          }
        } catch {}
      } else {
        for (const store of stores) {
          try {
            let fetchUrl: string;
            if (store.urlTemplate && store.urlTemplate.includes("{SKU}")) {
              fetchUrl = store.urlTemplate.replace("{SKU}", encodeURIComponent(sku));
            } else {
              fetchUrl = `${store.url.replace(/\/+$/, "")}/search?q=${encodeURIComponent(sku)}`;
            }
            const res2 = await fetch(`${API_URL}/scrape-dynamic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: fetchUrl }) });
            const data2 = await res2.json();
            if (data2.name && data2.name !== "0") {
              allResults.push({ sku, productName, storeName: store.name, price: data2.price || "—", url: fetchUrl, found: true });
              found = true;
            } else if (data2.results && data2.results.length > 0) {
              data2.results.slice(0, 2).forEach((p: any) => {
                allResults.push({ sku, productName, storeName: store.name, price: p.price || "—", url: p.url || fetchUrl, found: true });
              });
              found = true;
            }
          } catch {}
        }
      }
      if (!found) allResults.push({ sku, productName, storeName: "—", price: "—", url: "", found: false });
      setExcelResults([...allResults]);
    }
    setExcelSearching(false);
  };

  // ── Auth ──
  const handleLogin = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const res = await fetch(`${API_URL}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail || "خطأ");
      const u = { email, company: email.split("@")[0] };
      localStorage.setItem("wesal_token", data.token);
      localStorage.setItem("wesal_user", JSON.stringify(u));
      setUser(u); setView("dashboard");
    } catch (e: unknown) { setAuthError(e instanceof Error ? e.message : "حدث خطأ"); }
    finally { setAuthLoading(false); }
  };

  const handleRegister = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const res = await fetch(`${API_URL}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, name: companyName }) });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail || "خطأ");
      const u = { email, company: companyName };
      localStorage.setItem("wesal_token", data.token);
      localStorage.setItem("wesal_user", JSON.stringify(u));
      setUser(u); setView("dashboard");
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
    setStores(p => [...p, { id: Math.random().toString(36).slice(2), name: storeName.trim(), url, urlTemplate: storeTemplate.trim() }]);
    setStoreName(""); setStoreUrl(""); setStoreTemplate("");
  };

  const doSearch = async () => {
    if (!skuInput.trim() || stores.length === 0) return;
    setSearching(true);
    const sid = Math.random().toString(36).slice(2);
    const sku = skuInput.trim();
    const init: InventoryResult[] = stores.map(s => ({ storeId: s.id, storeName: s.name, count: 0, products: [], status: "loading" }));
    setSearches(p => [{ id: sid, sku, results: init, searchedAt: new Date().toLocaleTimeString("ar-SA") }, ...p]);
    setSkuInput("");
    await Promise.all(stores.map(async (store) => {
      try {
        if (store.urlTemplate && store.urlTemplate.includes("{SKU}")) {
          const directUrl = store.urlTemplate.replace("{SKU}", encodeURIComponent(sku));
          const r = await fetch(`${API_URL}/scrape-dynamic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: directUrl }) });
          const d = await r.json();
          const prod2 = d.name && d.name !== "0"
            ? [{ name: d.name, url: directUrl, price: d.price || "—", available: true, snippet: "" }]
            : d.results && d.results.length > 0
            ? d.results.slice(0,3).map((p: any) => ({ name: p.name, url: p.url || directUrl, price: p.price || "—", available: true, snippet: "" }))
            : [];
          setSearches(p => p.map(s => s.id !== sid ? s : { ...s, results: s.results.map(r2 => r2.storeId !== store.id ? r2 : { ...r2, count: prod2.length, products: prod2, status: "done" as const }) }));
          return;
        }
        const site = store.url.replace("https://", "").replace("http://", "").replace(/\/+$/, "");
        const res = await fetch(`${API_URL}/search-product`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku, site }) });
        const data = await res.json();
        const prod = data.results && data.results.length > 0 ? data.results.slice(0, 3).map((p: any) => ({ name: p.name, url: p.url, price: p.price || "—", available: true, snippet: "" })) : [];
        setSearches(p => p.map(s => s.id !== sid ? s : { ...s, results: s.results.map(r => r.storeId !== store.id ? r : { ...r, count: prod.length, products: prod, status: "done" as const }) }));
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
      <div style={{ marginTop: "auto", padding: "10px 14px", borderRadius: "10px", background: "#1a1a2e", cursor: "pointer" }} onClick={() => { localStorage.removeItem("wesal_token"); localStorage.removeItem("wesal_user"); setView("landing"); setUser(null); }}>
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
          <p style={{ color: "#555", fontSize: "13px", margin: "0 0 28px" }}>ارفع ملف Excel أو ابحث يدوياً في عدة متاجر بنفس الوقت</p>

          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", alignItems: "start" }}>

            {/* ─ Left: Stores ─ */}
            <div>
              <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#888", fontWeight: "600" }}>إضافة متجر</p>
                <input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="اسم المتجر" style={{ ...inputStyle, marginBottom: "8px" }} />
                <input value={storeUrl} onChange={e => setStoreUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && addStore()} placeholder="https://store.com" style={{ ...inputStyle, marginBottom: "10px", direction: "ltr", textAlign: "left" }} />
                <button onClick={addStore} style={{ width: "100%", padding: "10px", background: "#c8b8ff", color: "#0a0a0f", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}>+ إضافة</button>
              </div>
              {stores.length > 0 && (
                <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", overflow: "hidden", marginBottom: "12px" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e2e", fontSize: "11px", color: "#555", fontWeight: "600" }}>المتاجر ({stores.length})</div>
                  {stores.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #141420", gap: "8px" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: "13px", fontWeight: "500" }}>{s.name}</div>
                        <div style={{ fontSize: "11px", color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "ltr", textAlign: "left" }}>{s.urlTemplate || s.url}</div>
                        {s.urlTemplate && <div style={{ fontSize: "10px", color: "#4ade80", marginTop: "2px" }}>✓ template رابط</div>}
                      </div>
                      <button onClick={() => setStores(p => p.filter(x => x.id !== s.id))} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "13px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─ Right: Search ─ */}
            <div>

              {/* Excel Upload Section */}
              <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#888", fontWeight: "600" }}>رفع ملف Excel 📊</p>

                {!excelRows.length ? (
                  <div>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{ border: "2px dashed #2a2a3e", borderRadius: "10px", padding: "28px", textAlign: "center", cursor: "pointer" }}
                    >
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>📊</div>
                      <div style={{ fontSize: "14px", color: "#c8b8ff", marginBottom: "4px" }}>اضغط لرفع ملف Excel</div>
                      <div style={{ fontSize: "12px", color: "#555" }}>.xlsx أو .xls</div>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{ display: "none" }} />
                  </div>
                ) : (
                  <div>
                    <div style={{ background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                      <span style={{ fontSize: "16px" }}>📄</span>
                      <span style={{ fontSize: "13px", color: "#c8b8ff" }}>{excelFileName}</span>
                      <span style={{ marginRight: "auto", fontSize: "12px", color: "#555" }}>{excelRows.length} صف</span>
                      <button onClick={() => { setExcelRows([]); setExcelCols([]); setExcelResults([]); setExcelFileName(""); }} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "13px" }}>✕</button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                      <div>
                        <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#666" }}>عمود البحث (SKU)</p>
                        <select value={searchCol} onChange={e => setSearchCol(e.target.value)} style={{ ...inputStyle, padding: "8px 12px" }}>
                          {excelCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#666" }}>عمود الاسم (للعرض)</p>
                        <select value={nameCol} onChange={e => setNameCol(e.target.value)} style={{ ...inputStyle, padding: "8px 12px" }}>
                          {excelCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#666" }}>عمود URL (اختياري)</p>
                        <select value={urlCol} onChange={e => setUrlCol(e.target.value)} style={{ ...inputStyle, padding: "8px 12px" }}>
                          <option value="">-- بدون --</option>
                          {excelCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    {urlCol && <p style={{ margin: "0 0 12px", fontSize: "11px", color: "#4ade80" }}>✓ سيبحث مباشرة من عمود الـ URL — لا يحتاج متاجر</p>}

                    {/* Preview */}
                    <div style={{ background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: "8px", overflow: "hidden", marginBottom: "14px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr>{excelCols.slice(0, 4).map(c => <th key={c} style={{ padding: "8px 12px", textAlign: "right", color: "#555", borderBottom: "1px solid #1e1e2e", fontWeight: "500" }}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {excelRows.slice(0, 3).map((row, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #141420" }}>
                              {excelCols.slice(0, 4).map(c => <td key={c} style={{ padding: "7px 12px", color: c === searchCol ? "#c8b8ff" : "#e8e8f0" }}>{String(row[c] || "")}</td>)}
                            </tr>
                          ))}
                          {excelRows.length > 3 && <tr><td colSpan={4} style={{ padding: "7px 12px", color: "#555", fontStyle: "italic", fontSize: "11px" }}>... و {excelRows.length - 3} صف آخر</td></tr>}
                        </tbody>
                      </table>
                    </div>

                    <button
                      onClick={handleExcelSearch}
                      disabled={excelSearching || stores.length === 0}
                      style={{ width: "100%", padding: "12px", background: excelSearching || stores.length === 0 ? "#2a2a3e" : "#c8b8ff", color: excelSearching || stores.length === 0 ? "#888" : "#0a0a0f", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: excelSearching || stores.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                    >
                      {excelSearching ? `جاري البحث... (${excelResults.length} نتيجة)` : `ابدأ البحث في ${excelRows.length} منتج ←`}
                    </button>
                    {stores.length === 0 && <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#ff6b6b" }}>⚠️ أضف متجراً أولاً من القائمة على اليسار</p>}
                  </div>
                )}
              </div>

              {/* Manual SKU Search */}
              <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#888", fontWeight: "600" }}>بحث يدوي بـ SKU</p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input value={skuInput} onChange={e => setSkuInput(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder="مثال: كنبة L-shape أو SKU-1234"
                    style={{ flex: 1, padding: "12px 16px", background: "#0a0a0f", border: "1px solid #2a2a3e", borderRadius: "10px", color: "#e8e8f0", fontSize: "14px", outline: "none", fontFamily: "inherit" }} />
                  <button onClick={doSearch} disabled={searching || !skuInput.trim() || stores.length === 0}
                    style={{ padding: "12px 22px", background: (searching || stores.length === 0) ? "#2a2a3e" : "#c8b8ff", color: (searching || stores.length === 0) ? "#888" : "#0a0a0f", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: (searching || stores.length === 0) ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    {searching ? "جاري..." : "بحث ←"}
                  </button>
                </div>
              </div>

              {/* Excel Results Table */}
              {excelResults.length > 0 && (
                <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#e8e8f0" }}>نتائج البحث</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: "#0d1f0d", color: "#4ade80", border: "1px solid #1a3a1a" }}>
                      {excelResults.filter(r => r.found).length} موجود
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: "#1f0d0d", color: "#f87171", border: "1px solid #3a1a1a" }}>
                      {excelResults.filter(r => !r.found).length} غير موجود
                    </span>
                    {!excelSearching && (
                      <button
                        onClick={() => {
                          const XLSX = (window as any).XLSX;
                          const ws = XLSX.utils.json_to_sheet(excelResults.map((r,i) => ({ "#": i+1, "اسم المنتج": r.productName, "SKU": r.sku, "المتجر": r.storeName, "السعر": r.price, "الحالة": r.found ? "موجود" : "غير موجود", "الرابط": r.url })));
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "النتائج");
                          XLSX.writeFile(wb, "نتائج_المخزون.xlsx");
                        }}
                        style={{ marginRight: "auto", padding: "6px 14px", background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: "8px", color: "#c8b8ff", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        تصدير Excel ↓
                      </button>
                    )}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "600px" }}>
                      <thead>
                        <tr style={{ background: "#0a0a0f" }}>
                          <th style={{ padding: "9px 14px", textAlign: "right", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e", width: "30px" }}>#</th>
                          <th style={{ padding: "9px 14px", textAlign: "right", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e" }}>اسم المنتج</th>
                          <th style={{ padding: "9px 14px", textAlign: "right", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e", width: "90px" }}>SKU</th>
                          <th style={{ padding: "9px 14px", textAlign: "right", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e", width: "100px" }}>المتجر</th>
                          <th style={{ padding: "9px 14px", textAlign: "center", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e", width: "100px" }}>السعر</th>
                          <th style={{ padding: "9px 14px", textAlign: "center", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e", width: "90px" }}>الحالة</th>
                          <th style={{ padding: "9px 14px", textAlign: "center", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e", width: "60px" }}>رابط</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelResults.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #141420", background: i % 2 === 0 ? "transparent" : "#0d0d14" }}>
                            <td style={{ padding: "10px 14px", color: "#555" }}>{i + 1}</td>
                            <td style={{ padding: "10px 14px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.productName}</td>
                            <td style={{ padding: "10px 14px", color: "#c8b8ff", fontSize: "12px" }}>{r.sku}</td>
                            <td style={{ padding: "10px 14px", color: "#888", fontSize: "12px" }}>{r.storeName}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center", color: "#c8b8ff", fontWeight: "600" }}>{r.price}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: r.found ? "#0d1f0d" : "#1f0d0d", color: r.found ? "#4ade80" : "#f87171", border: `1px solid ${r.found ? "#1a3a1a" : "#3a1a1a"}` }}>
                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: r.found ? "#4ade80" : "#f87171" }} />
                                {r.found ? "موجود" : "غير موجود"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#7c6af7", fontSize: "12px", textDecoration: "none" }}>فتح ↗</a> : <span style={{ color: "#333" }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Manual Search Results */}
              {searches.length > 0 && searches.map(search => (
                <div key={search.id} style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "700", color: "#c8b8ff" }}>{search.sku}</span>
                    <span style={{ fontSize: "11px", color: "#555" }}>{search.searchedAt}</span>
                    <span style={{ marginRight: "auto", fontSize: "11px", color: "#888" }}>{search.results.reduce((acc, r) => acc + (r.status === "done" ? r.count : 0), 0)} نتيجة</span>
                  </div>
                  {search.results.map(r => (
                    <div key={r.storeId}>
                      <div style={{ padding: "10px 20px", background: "#0f0f1a", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #1e1e2e" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: r.status === "loading" ? "#ffd166" : r.status === "error" ? "#ff6b6b" : "#4ade80" }} />
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#c8b8ff" }}>{r.storeName}</span>
                        {r.status === "loading" && <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#555" }}><span style={{ width: 10, height: 10, border: "2px solid #333", borderTopColor: "#c8b8ff", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />جاري البحث...</span>}
                        {r.status === "done" && <span style={{ fontSize: "12px", color: "#555" }}>{r.count} منتج</span>}
                        {r.status === "error" && <span style={{ fontSize: "12px", color: "#ff6b6b" }}>⚠️ {r.error}</span>}
                      </div>
                      {r.status === "done" && r.products.length > 0 && (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead><tr style={{ background: "#0a0a0f" }}>
                            <th style={{ padding: "8px 16px", textAlign: "right", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e" }}>اسم المنتج</th>
                            <th style={{ padding: "8px 16px", textAlign: "center", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e", width: "110px" }}>السعر</th>
                            <th style={{ padding: "8px 16px", textAlign: "center", color: "#555", fontWeight: "500", borderBottom: "1px solid #1e1e2e", width: "70px" }}>رابط</th>
                          </tr></thead>
                          <tbody>
                            {r.products.map((p, idx) => (
                              <tr key={idx} style={{ borderBottom: "1px solid #141420", background: idx % 2 === 0 ? "transparent" : "#0d0d14" }}>
                                <td style={{ padding: "10px 16px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                                <td style={{ padding: "10px 16px", textAlign: "center", color: "#c8b8ff", fontWeight: "600" }}>{p.price || "—"}</td>
                                <td style={{ padding: "10px 16px", textAlign: "center" }}><a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: "#7c6af7", fontSize: "12px", textDecoration: "none" }}>فتح ↗</a></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {r.status === "done" && r.products.length === 0 && <div style={{ padding: "16px 20px", fontSize: "13px", color: "#555" }}>لا توجد نتائج</div>}
                    </div>
                  ))}
                </div>
              ))}

            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════

  // ══════════════════════════════════════
  // REPORTS / KPI DASHBOARD VIEW
  // ══════════════════════════════════════
  if (view === "reports") {
    const d = erpData;

    const kpiDefs = [
      { id:"late", n:"الطلبات المتأخرة", val: d ? String(d.late_orders?.count ?? "—") : "—", unit:"طلب", target:"الهدف: أقل من 10", severity: d ? (d.late_orders?.count > 10 ? "critical" : d.late_orders?.count > 0 ? "warning" : "good") : "good", pct: d ? Math.min(100,(d.late_orders?.count??0)*2) : 0, rawKey:"late_orders",
        insights: d?.late_orders?.items?.length > 0 ? [`${d.late_orders.count} طلب تجاوز تاريخ التسليم`,`متوسط التأخير ${Math.round(d.late_orders.items.reduce((s:number,o:any)=>s+(o.days_late||0),0)/Math.max(d.late_orders.items.length,1))} يوم`,d.late_orders.items.filter((o:any)=>(o.days_late||0)>30).length > 0 ? `${d.late_orders.items.filter((o:any)=>(o.days_late||0)>30).length} طلب متأخر أكثر من 30 يوم` : "لا توجد طلبات متأخرة أكثر من 30 يوم"] : ["لا توجد طلبات متأخرة حالياً ✓"],
        recs: ["تواصل مع العملاء المتأثرين فوراً","راجع سياسة التسليم مع فريق اللوجستيات","فعّل تنبيهات يومية للطلبات المتأخرة"] },
      { id:"stuck", n:"الطلبات العالقة", val: d ? String(d.stuck_orders?.count ?? "—") : "—", unit:"طلب", target:"الهدف: أقل من 5", severity: d ? (d.stuck_orders?.count > 8 ? "critical" : d.stuck_orders?.count > 3 ? "warning" : "good") : "good", pct: d ? Math.min(100,(d.stuck_orders?.count??0)*8) : 0, rawKey:"stuck_orders",
        insights: [`${d?.stuck_orders?.count??0} طلب بانتظار مورد أو تحديث شحن`,"راجع حالة كل طلب يدوياً","بعض الطلبات قد تكون عالقة منذ أسبوع"],
        recs: ["راجع حالة الشحن لكل طلب","تواصل مع موردي القنوات المتأثرة","أنشئ تقرير عالق أسبوعي تلقائي"] },
      { id:"processing", n:"وقت المعالجة", val: d ? `${d.avg_processing_days?.value??"—"}` : "—", unit:"يوم", target:"الهدف: 1.5 يوم", severity: d ? (d.avg_processing_days?.value > 3 ? "critical" : d.avg_processing_days?.value > 1.5 ? "warning" : "good") : "good", pct: d ? Math.min(100,((d.avg_processing_days?.value??0)/3)*100) : 0, rawKey:"avg_processing_days",
        insights: [`متوسط ${d?.avg_processing_days?.value??0} يوم لكل طلب`,d?.avg_processing_days?.value <= 1.5 ? "الأداء ضمن الهدف ✓" : "تجاوز الهدف — يحتاج مراجعة",`مبني على ${d?.avg_processing_days?.sample??0} طلب هذا الشهر`],
        recs: ["راجع مراحل التأخير في كل طلب","سرّع عمليات إصدار البوليصة","تتبع الأداء أسبوعياً"] },
      { id:"oos", n:"المنتجات النافدة", val: d ? String(d.out_of_stock?.count??"—") : "—", unit:"SKU", target:"الهدف: صفر", severity: d ? (d.out_of_stock?.count > 5 ? "critical" : d.out_of_stock?.count > 0 ? "warning" : "good") : "good", pct: d ? Math.min(100,(d.out_of_stock?.count??0)*5) : 0, rawKey:"out_of_stock",
        insights: [`${d?.out_of_stock?.count??0} منتج نفد من المخزون`,"يؤثر مباشرة على تنفيذ الطلبات","يستدعي أوامر شراء فورية"],
        recs: ["أنشئ أوامر شراء فورية","أعلم فريق المبيعات بالمنتجات غير المتوفرة","فعّل تنبيه نفاد المخزون في ERPNext"] },
      { id:"low", n:"قريبة من النفاد", val: d ? String(d.low_stock?.count??"—") : "—", unit:"SKU", target:"الهدف: أقل من 15", severity: d ? (d.low_stock?.count > 20 ? "critical" : d.low_stock?.count > 0 ? "warning" : "good") : "good", pct: d ? Math.min(100,(d.low_stock?.count??0)*3) : 0, rawKey:"low_stock",
        insights: [`${d?.low_stock?.count??0} SKU أقل من حد إعادة الطلب`,"إذا لم يُتخذ إجراء ستنفد خلال أيام","الأولوية: الأعلى مبيعاً أولاً"],
        recs: ["ابدأ أوامر الشراء للـ SKUs المنخفضة","رتّب حسب الأولوية: الأعلى مبيعاً","اتفق مع الموردين على تسريع التوريد"] },
      { id:"po", n:"تأخر الموردين", val: d ? String(d.late_po?.count??"—") : "—", unit:"PO", target:"الهدف: صفر", severity: d ? (d.late_po?.count > 5 ? "critical" : d.late_po?.count > 0 ? "warning" : "good") : "good", pct: d ? Math.min(100,(d.late_po?.count??0)*6) : 0, rawKey:"late_po",
        insights: [`${d?.late_po?.count??0} أوامر شراء متأخرة عن موعدها`,"يؤثر مباشرة على تنفيذ طلبات العملاء","راجع أسباب التأخير مع كل مورد"],
        recs: ["اتصل بالموردين المتأخرين اليوم","فعّل غرامات التأخير حسب العقد","ابحث عن موردين بديلين للمنتجات الحرجة"] },
      { id:"complaints", n:"الشكاوى المفتوحة", val: d ? String(d.open_complaints?.count??"—") : "—", unit:"شكوى", target:"الهدف: صفر", severity: d ? (d.open_complaints?.count > 5 ? "critical" : d.open_complaints?.count > 0 ? "warning" : "good") : "good", pct: d ? Math.min(100,(d.open_complaints?.count??0)*10) : 0, rawKey:"open_complaints",
        insights: [`${d?.open_complaints?.count??0} شكوى مفتوحة`,`${d?.open_complaints?.no_reply_24h??0} شكوى بدون رد منذ 24 ساعة`,"يؤثر على تقييم رضا العملاء"],
        recs: ["ردّ على الشكاوى غير المجابة فوراً","أضف قالب ردود سريعة","تتبع أسباب الشكاوى لمنعها مستقبلاً"] },
      { id:"response", n:"وقت الرد", val: d ? `${d.avg_response_hours?.value??"—"}` : "—", unit:"ساعة", target:"الهدف: 2 ساعة", severity: d ? (d.avg_response_hours?.value > 6 ? "critical" : d.avg_response_hours?.value > 2 ? "warning" : "good") : "good", pct: d ? Math.min(100,((d.avg_response_hours?.value??0)/8)*100) : 0, rawKey:"avg_response_hours",
        insights: [`متوسط ${d?.avg_response_hours?.value??0} ساعة للرد`,d?.avg_response_hours?.value <= 2 ? "أفضل من الهدف ✓" : "تجاوز الهدف — يحتاج مراجعة",`مبني على ${d?.avg_response_hours?.sample??0} حالة مغلقة`],
        recs: ["حافظ على معدل الرد الجيد","وثّق أفضل الممارسات وشاركها","استمر في مراقبة المعدل يومياً"] },
      { id:"sales", n:"المبيعات", val: d ? `${(d.daily_sales?.value??0).toLocaleString("ar-SA")}` : "—", unit:"ر.س", target:`الهدف: 20,000 ر.س · ${d?.daily_sales?.period??""}`, severity: d ? (d.daily_sales?.value >= 20000 ? "good" : d.daily_sales?.value >= 10000 ? "warning" : "critical") : "good", pct: d ? Math.min(100,((d.daily_sales?.value??0)/20000)*100) : 0, rawKey:"daily_sales",
        insights: [`${(d?.daily_sales?.value??0).toLocaleString("ar-SA")} ر.س — ${d?.daily_sales?.period??""}`,d?.daily_sales?.value >= 20000 ? "تجاوز الهدف ✓" : "لم يصل للهدف بعد",`${d?.daily_sales?.orders_count??0} فاتورة`],
        recs: ["تابع أداء المبيعات يومياً","راجع القنوات الأقل أداءً","فعّل حملات ترويجية للمنتجات الراكدة"] },
      { id:"delivery", n:"التوصيل في الوقت", val: d ? `${d.on_time_delivery?.pct??"—"}` : "—", unit:"%", target:"الهدف: 95%", severity: d ? ((d.on_time_delivery?.pct??0) >= 95 ? "good" : (d.on_time_delivery?.pct??0) >= 80 ? "warning" : "critical") : "good", pct: d?.on_time_delivery?.pct??0, rawKey:"on_time_delivery",
        insights: [`${d?.on_time_delivery?.pct??0}% من الطلبات تُسلّم في الوقت`,`${d?.on_time_delivery?.count??0} تسليم هذا الشهر`,d?.on_time_delivery?.pct >= 95 ? "ضمن الهدف ✓" : "دون الهدف — يحتاج مراجعة"],
        recs: ["تحليل أسباب التأخير في التسليم","تحسين التنسيق مع شركات الشحن","فعّل تتبع التسليم في الوقت الفعلي"] },
    ];

    const sevColor = (s: string) => s === "critical" ? "#E24B4A" : s === "warning" ? "#EF9F27" : "#1D9E75";
    const sevBg = (s: string) => s === "critical" ? "#1f0d0d" : s === "warning" ? "#1a1400" : "#0d1f0d";
    const sevLabel = (s: string) => s === "critical" ? "حرج" : s === "warning" ? "تحذير" : "جيد";

    const critical = kpiDefs.filter(k=>k.severity==="critical").length;
    const warning = kpiDefs.filter(k=>k.severity==="warning").length;
    const good = kpiDefs.filter(k=>k.severity==="good").length;

    const renderDrill = (idx: number) => {
      const k = kpiDefs[idx];
      const raw = d?.[k.rawKey];
      const items = raw?.items ?? [];
      return (
        <div style={{background:"#0d0d14",border:"1px solid #378ADD",borderRadius:"14px",padding:"18px",marginBottom:"10px",animation:"fadeIn .2s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <div>
              <div style={{fontSize:"15px",fontWeight:"700"}}>{k.n} — تحليل تفصيلي</div>
              <div style={{fontSize:"12px",color:"#555",marginTop:"2px"}}>{k.val} {k.unit} · مصدر: ERPNext</div>
            </div>
            <button onClick={()=>setActiveKpi(null)} style={{padding:"4px 12px",background:"#1a1a2e",border:"1px solid #2a2a4e",borderRadius:"6px",color:"#888",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>✕ إغلاق</button>
          </div>

          {/* AI Analysis */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
            <div style={{background:"#0a1520",border:"1px solid #1e3a5f",borderRadius:"10px",padding:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:"700",color:"#60a5fa",marginBottom:"8px"}}>📊 تحليل AI</div>
              {k.insights.map((ins,i)=>(
                <div key={i} style={{display:"flex",gap:"6px",marginBottom:"5px",alignItems:"flex-start"}}>
                  <span style={{color:"#60a5fa",fontSize:"10px",marginTop:"2px",flexShrink:0}}>◆</span>
                  <span style={{fontSize:"12px",color:"#b0c4de",lineHeight:"1.6"}}>{ins}</span>
                </div>
              ))}
            </div>
            <div style={{background:"#0a1a0f",border:"1px solid #1a3a1a",borderRadius:"10px",padding:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:"700",color:"#4ade80",marginBottom:"8px"}}>💡 التوصيات</div>
              {k.recs.map((rec,i)=>(
                <div key={i} style={{display:"flex",gap:"6px",marginBottom:"5px",alignItems:"flex-start"}}>
                  <span style={{color:"#4ade80",fontSize:"10px",marginTop:"2px",flexShrink:0}}>→</span>
                  <span style={{fontSize:"12px",color:"#86efac",lineHeight:"1.6"}}>{rec}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data Table */}
          {items.length > 0 && (
            <div style={{background:"#0a0a0f",borderRadius:"10px",overflow:"hidden",marginBottom:"12px"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                <thead>
                  <tr style={{background:"#111118"}}>
                    {k.rawKey==="late_orders" && ["الطلب","العميل","أيام التأخير","المبلغ","الحالة"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                    {k.rawKey==="stuck_orders" && ["الطلب","العميل","الحالة","التاريخ"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                    {["out_of_stock","low_stock"].includes(k.rawKey) && ["SKU","المستودع","الكمية"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                    {k.rawKey==="late_po" && ["PO","المورد","الاستحقاق","الحالة"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                    {k.rawKey==="open_complaints" && ["#","العميل","الموضوع","الحالة"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0,10).map((item: any, i: number)=>(
                    <tr key={i} style={{borderBottom:"1px solid #141420",background:i%2===0?"transparent":"#0d0d14"}}>
                      {k.rawKey==="late_orders" && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff",fontSize:"11px"}}>{item.id}</td>
                        <td style={{padding:"7px 10px",maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.customer}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:item.days_late>30?"#1f0d0d":"#1a1400",color:item.days_late>30?"#f87171":"#fbbf24",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.days_late} يوم</span></td>
                        <td style={{padding:"7px 10px",color:"#fbbf24",fontSize:"11px"}}>{item.amount?`${Number(item.amount).toLocaleString()} ر.س`:"—"}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:"#1f0d0d",color:"#f87171",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.status}</span></td>
                      </>}
                      {k.rawKey==="stuck_orders" && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff",fontSize:"11px"}}>{item.id}</td>
                        <td style={{padding:"7px 10px"}}>{item.customer}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:"#1a1400",color:"#fbbf24",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.status}</span></td>
                        <td style={{padding:"7px 10px",color:"#888",fontSize:"11px"}}>{item.date}</td>
                      </>}
                      {["out_of_stock","low_stock"].includes(k.rawKey) && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff"}}>{item.sku}</td>
                        <td style={{padding:"7px 10px",color:"#888"}}>{item.warehouse}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:k.rawKey==="out_of_stock"?"#1f0d0d":"#1a1400",color:k.rawKey==="out_of_stock"?"#f87171":"#fbbf24",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.qty}</span></td>
                      </>}
                      {k.rawKey==="late_po" && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff",fontSize:"11px"}}>{item.id}</td>
                        <td style={{padding:"7px 10px"}}>{item.supplier}</td>
                        <td style={{padding:"7px 10px",color:"#f87171"}}>{item.due}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:"#1f0d0d",color:"#f87171",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.status}</span></td>
                      </>}
                      {k.rawKey==="open_complaints" && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff",fontSize:"11px"}}>{item.id}</td>
                        <td style={{padding:"7px 10px"}}>{item.customer}</td>
                        <td style={{padding:"7px 10px",color:"#888",maxWidth:"150px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.subject}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:"#1a1400",color:"#fbbf24",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.status}</span></td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > 10 && <div style={{padding:"8px",fontSize:"11px",color:"#555",textAlign:"center"}}>+ {items.length-10} سجل إضافي</div>}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
            <button style={{padding:"7px 14px",background:"#1a2a1e",border:"1px solid #4ade80",borderRadius:"8px",color:"#4ade80",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>📋 إنشاء Tasks</button>
            <button style={{padding:"7px 14px",background:"#1a2a1e",border:"1px solid #25d366",borderRadius:"8px",color:"#25d366",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>💬 إرسال واتساب</button>
            <button style={{padding:"7px 14px",background:"#1a1a2e",border:"1px solid #c8b8ff",borderRadius:"8px",color:"#c8b8ff",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>📊 تصدير Excel</button>
            <a href={`http://144.91.102.29`} target="_blank" rel="noopener noreferrer" style={{padding:"7px 14px",background:"#1a1a2e",border:"1px solid #555",borderRadius:"8px",color:"#888",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",textDecoration:"none"}}>🔗 فتح ERPNext ↗</a>
          </div>
        </div>
      );
    };

    const KpiCard = ({k, i}: {k: any, i: number}) => (
      <div onClick={()=>setActiveKpi(activeKpi===i?null:i)}
        style={{background:"#111118",border:`1px solid ${activeKpi===i?"#378ADD":"#1e1e2e"}`,borderTop:`3px solid ${sevColor(k.severity)}`,borderRadius:"12px",padding:"14px",cursor:"pointer",position:"relative",transition:"all .15s",boxShadow:activeKpi===i?"0 0 0 2px rgba(55,138,221,0.15)":"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"6px"}}>
          <div style={{fontSize:"11px",color:"#666"}}>{k.n}</div>
          <span style={{background:sevBg(k.severity),color:sevColor(k.severity),padding:"1px 7px",borderRadius:"8px",fontSize:"10px"}}>{sevLabel(k.severity)}</span>
        </div>
        <div style={{fontSize:"24px",fontWeight:"700",color:sevColor(k.severity),lineHeight:"1.1",marginBottom:"2px"}}>
          {erpLoading ? <span style={{width:10,height:10,border:`2px solid #333`,borderTopColor:sevColor(k.severity),borderRadius:"50%",display:"inline-block",animation:"spin .8s linear infinite"}}/> : k.val}
          <span style={{fontSize:"13px",fontWeight:"400",color:"#555",marginRight:"4px"}}>{k.unit}</span>
        </div>
        <div style={{fontSize:"10px",color:"#555"}}>{k.target}</div>
        <div style={{height:"3px",background:"#1a1a2e",borderRadius:"2px",marginTop:"8px"}}>
          <div style={{width:`${k.pct}%`,height:"100%",background:sevColor(k.severity),borderRadius:"2px",transition:"width .6s"}}></div>
        </div>
        {activeKpi===i && <div style={{position:"absolute",bottom:"-8px",left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"7px solid transparent",borderRight:"7px solid transparent",borderTop:"7px solid #378ADD"}}></div>}
      </div>
    );

    return (
      <div style={{fontFamily:"'Tajawal', sans-serif",direction:"rtl",minHeight:"100vh",background:"#0a0a0f",color:"#e8e8f0"}}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        <div style={{display:"flex",minHeight:"100vh"}}>
          {sidebarJSX}
          <div style={{flex:1,padding:"28px 32px",overflowY:"auto"}}>

            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px"}}>
              <div>
                <h1 style={{fontSize:"22px",fontWeight:"800",margin:"0 0 3px"}}>مركز القرار 📊</h1>
                <div style={{fontSize:"12px",display:"flex",alignItems:"center",gap:"6px"}}>
                  {erpLoading
                    ? <span style={{color:"#555",display:"flex",alignItems:"center",gap:"4px"}}><span style={{width:7,height:7,border:"2px solid #333",borderTopColor:"#c8b8ff",borderRadius:"50%",display:"inline-block",animation:"spin .8s linear infinite"}}/>جاري الجلب من ERPNext...</span>
                    : erpError ? <span style={{color:"#f87171"}}>⚠️ {erpError}</span>
                    : d ? <span style={{color:"#4ade80",display:"flex",alignItems:"center",gap:"4px"}}><span style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",animation:"pulse 2s infinite"}}/>ERPNext متصل · {lastFetched}</span>
                    : null}
                </div>
              </div>
              <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                {["اليوم","الأسبوع","الشهر","الربع","السنة"].map((p,i)=>(
                  <button key={p} onClick={()=>{setTimePeriod(i);fetchKpis(i);}} style={{padding:"5px 12px",background:timePeriod===i?"#1a1a2e":"transparent",border:`1px solid ${timePeriod===i?"#c8b8ff":"#2a2a3e"}`,borderRadius:"20px",color:timePeriod===i?"#c8b8ff":"#666",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>{p}</button>
                ))}
                <button onClick={()=>fetchKpis()} disabled={erpLoading} style={{padding:"5px 14px",background:"#1a1a2e",border:"1px solid #c8b8ff",borderRadius:"20px",color:"#c8b8ff",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",marginRight:"4px"}}>↻ تحديث</button>
              </div>
            </div>

            {/* Priority Score */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px",marginBottom:"18px"}}>
              {[{label:"🔥 حرج",count:critical,color:"#E24B4A",bg:"#1f0d0d",border:"#3a1a1a"},{label:"⚠️ تحذير",count:warning,color:"#EF9F27",bg:"#1a1400",border:"#3a2800"},{label:"✅ جيد",count:good,color:"#1D9E75",bg:"#0d1f0d",border:"#1a3a1a"}].map(g=>(
                <div key={g.label} style={{background:g.bg,border:`1px solid ${g.border}`,borderRadius:"12px",padding:"14px 16px"}}>
                  <div style={{fontSize:"12px",fontWeight:"700",color:g.color,marginBottom:"6px"}}>{g.label}</div>
                  <div style={{fontSize:"28px",fontWeight:"800",color:g.color}}>{g.count}</div>
                  <div style={{fontSize:"10px",color:"#555",marginTop:"2px"}}>مؤشر</div>
                </div>
              ))}
            </div>

            {/* KPI Grid Row 1 */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"10px",marginBottom:"8px"}}>
              {kpiDefs.slice(0,5).map((k,i)=><KpiCard key={i} k={k} i={i}/>)}
            </div>
            {activeKpi!==null && activeKpi<5 && renderDrill(activeKpi)}

            {/* KPI Grid Row 2 */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"10px",marginBottom:"8px"}}>
              {kpiDefs.slice(5).map((k,ii)=><KpiCard key={ii+5} k={k} i={ii+5}/>)}
            </div>
            {activeKpi!==null && activeKpi>=5 && renderDrill(activeKpi)}

            {/* Bottom: Executive Summary + Alerts */}
            <div style={{display:"grid",gridTemplateColumns:"1.2fr .8fr",gap:"12px",marginTop:"8px"}}>
              <div style={{background:"#111118",border:"1px solid #1e1e2e",borderRadius:"14px",padding:"18px"}}>
                <div style={{fontSize:"14px",fontWeight:"700",marginBottom:"14px"}}>الملخص التنفيذي</div>
                <div style={{background:"#0a1520",border:"1px solid #1e3a5f",borderRadius:"10px",padding:"12px",marginBottom:"12px"}}>
                  <div style={{fontSize:"11px",color:"#f87171",fontWeight:"700",marginBottom:"6px"}}>أعلى مخاطرة</div>
                  <p style={{fontSize:"12px",color:"#b0c4de",lineHeight:"1.7",margin:0}}>
                    {d ? `الطلبات المتأخرة ${d.late_orders?.count??0} طلب · المنتجات النافدة ${d.out_of_stock?.count??0} SKU · تأخر الموردين ${d.late_po?.count??0} PO` : "جاري تحميل البيانات..."}
                  </p>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginBottom:"12px"}}>
                  {[["السبب","تأخر الموردين + نفاد المخزون"],["الأثر","طلبات متأخرة + عملاء غير راضين"],["القرار","شراء عاجل + تصعيد الموردين"]].map(([l,v])=>(
                    <div key={l} style={{background:"#0a0a0f",borderRadius:"8px",padding:"10px"}}>
                      <div style={{fontSize:"10px",color:"#555",marginBottom:"4px"}}>{l}</div>
                      <div style={{fontSize:"11px",fontWeight:"600"}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  <button style={{padding:"7px 14px",background:"#1a2a1e",border:"1px solid #4ade80",borderRadius:"8px",color:"#4ade80",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>📋 إنشاء مهام للفريق</button>
                  <button style={{padding:"7px 14px",background:"#1a1a2e",border:"1px solid #c8b8ff",borderRadius:"8px",color:"#c8b8ff",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>💬 واتساب للإدارة</button>
                </div>
              </div>

              <div style={{background:"#111118",border:"1px solid #1e1e2e",borderRadius:"14px",padding:"18px"}}>
                <div style={{fontSize:"14px",fontWeight:"700",marginBottom:"12px"}}>جودة البيانات</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"12px"}}>
                  {[["آخر مزامنة",lastFetched||"—"],["مصدر","ERPNext"],["الطلبات",String(d?.late_orders?.count??0)+" متأخرة"],["المخزون",String(d?.out_of_stock?.count??0)+" نافد"]].map(([l,v])=>(
                    <div key={l} style={{background:"#0a0a0f",borderRadius:"8px",padding:"10px",textAlign:"center"}}>
                      <div style={{fontSize:"10px",color:"#555",marginBottom:"4px"}}>{l}</div>
                      <div style={{fontSize:"13px",fontWeight:"600",color:"#c8b8ff"}}>{v}</div>
                    </div>
                  ))}
                </div>
                <a href="http://144.91.102.29" target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"8px 14px",background:"#1a1a2e",border:"1px solid #2a2a4e",borderRadius:"8px",color:"#c8b8ff",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",textDecoration:"none",textAlign:"center"}}>🔗 فتح ERPNext ↗</a>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

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
