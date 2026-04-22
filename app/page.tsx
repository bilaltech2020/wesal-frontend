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
interface CompRow { id: string; sku: string; query: string; status: "idle"|"searching"|"done"|"error"; results: CompResult[]; }
interface CompResult { competitor: string; title: string|null; price: number|null; currency: string; link: string|null; available: boolean|null; error: string|null; }

type ViewType = "landing" | "login" | "register" | "dashboard" | "competitors" | "inventory" | "reports" | "content";

const NAV = [
  { icon: "⬡", label: "لوحة التحكم", v: "dashboard" },
  { icon: "🔍", label: "مراقبة المنافسين", v: "competitors" },
  { icon: "📦", label: "مراقبة المخزون", v: "inventory" },
  { icon: "◈", label: "التكاملات", v: "dashboard" },
  { icon: "◇", label: "التقارير", v: "reports" },
  { icon: "○", label: "الإعدادات", v: "dashboard" },
  { icon: "✨", label: "Content Studio", v: "content" },
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

  // ── Competitor Monitor v2 state ──
  const [compSites, setCompSites] = useState<{id:string;name:string;url:string}[]>([]);
  const [compNewSiteName, setCompNewSiteName] = useState("");
  const [compNewSiteUrl, setCompNewSiteUrl] = useState("");
  const [compRows, setCompRows] = useState<CompRow[]>([{ id: "1", sku: "", query: "", status: "idle", results: [] }]);
  const [compExcelFile, setCompExcelFile] = useState("");
  const [compExcelRows, setCompExcelRows] = useState<Record<string,string>[]>([]);
  const [compExcelCols, setCompExcelCols] = useState<string[]>([]);
  const [compSkuCol, setCompSkuCol] = useState("");
  const [compNameCol, setCompNameCol] = useState("");
  const [compSearching, setCompSearching] = useState(false);
  const [compTab, setCompTab] = useState<"manual"|"excel"|"results">("manual");
  const compExcelRef = useRef<HTMLInputElement>(null);


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

  // ── Competitor Monitor v2 functions ──
  const compAddSite = async () => {
    if (!compNewSiteName.trim() || !compNewSiteUrl.trim()) return;
    const rawUrl  = compNewSiteUrl.trim();
    const fullUrl = rawUrl.startsWith("http") ? rawUrl : "https://" + rawUrl;
    const key     = compNewSiteName.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    try {
      await fetch(`${API_URL}/competitors/add`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, name: compNewSiteName.trim(), url: fullUrl }),
      });
    } catch {}
    setCompSites(p => [...p, { id: key, name: compNewSiteName.trim(), url: fullUrl }]);
    setCompNewSiteName(""); setCompNewSiteUrl("");
  };

  const compRemoveSite = async (siteId: string) => {
    try { await fetch(`${API_URL}/competitors/${siteId}`, { method: "DELETE" }); } catch {}
    setCompSites(p => p.filter(s => s.id !== siteId));
  };

  const compAddRow = () => setCompRows(p => [...p, { id: Date.now().toString(), sku: "", query: "", status: "idle", results: [] }]);
  const compRemoveRow = (id: string) => { if (compRows.length > 1) setCompRows(p => p.filter(r => r.id !== id)); };
  const compUpdateRow = (id: string, field: "sku"|"query", val: string) => setCompRows(p => p.map(r => r.id === id ? {...r, [field]: val} : r));

  const compSearchRow = async (id: string) => {
    const row = compRows.find(r => r.id === id);
    if (!row || !row.query.trim()) return;
    setCompRows(p => p.map(r => r.id === id ? {...r, status: "searching", results: []} : r));
    try {
      const rowSite = (row as any).site?.trim();

      // إذا في موقع مخصص في الصف — أضفه في backend أولاً ثم ابحث فيه
      let siteKeys: string[];
      if (rowSite) {
        const rawUrl  = rowSite.startsWith("http") ? rowSite : "https://" + rowSite;
        const domain  = rawUrl.replace("https://","").replace("http://","").replace("www.","").split("/")[0];
        const key     = domain.replace(/[^a-z0-9]/gi, "_").toLowerCase();
        // أضف في backend إذا مو موجود
        try {
          await fetch(`${API_URL}/competitors/add`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, name: domain, url: rawUrl }),
          });
        } catch {}
        siteKeys = [key];
      } else {
        // بدون موقع مخصص → ابحث في كل المواقع المضافة
        siteKeys = compSites.map(s => s.id);
        if (siteKeys.length === 0) {
          setCompRows(p => p.map(r => r.id === id ? {...r, status: "done", results: [{ competitor: "—", title: null, price: null, currency: "SAR", link: null, available: null, error: "أدخل موقعاً في خانة الموقع" }]} : r));
          return;
        }
      }

      const res = await fetch(`${API_URL}/competitors/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku:             row.sku || row.query,
          query:           row.query,
          competitor_keys: siteKeys,
          background:      false,
          max_results:     0,       // 0 = كل النتائج الممكنة
          fetch_details:   false,   // false = أسرع (السعر من snippet)
        })
      });
      const data = await res.json();
      const flat: CompResult[] = [];
      const displayName = rowSite
        ? rowSite.replace("https://","").replace("http://","").replace("www.","").split("/")[0]
        : "";
      Object.entries(data.results || {}).forEach(([comp, items]: [string, any[]]) => {
        const siteName = displayName || compSites.find(s => s.id === comp)?.name || comp;
        if (!items || items.length === 0) {
          flat.push({ competitor: siteName, title: null, price: null, currency: "SAR", link: null, available: null, error: "لم يُعثر على المنتج" });
        } else {
          items.forEach((i: any) => flat.push({ competitor: siteName, title: i.title, price: i.price, currency: i.currency || "SAR", link: i.link, available: i.available, error: i.error }));
        }
      });
      setCompRows(p => p.map(r => r.id === id ? {...r, status: "done", results: flat} : r));
    } catch(e: any) {
      setCompRows(p => p.map(r => r.id === id ? {...r, status: "error", results: []} : r));
    }
  };

  const compSearchAll = async () => {
    setCompSearching(true);
    for (const row of compRows.filter(r => r.query.trim())) await compSearchRow(row.id);
    setCompSearching(false);
  };

  const compHandleExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setCompExcelFile(file.name);
    await loadXLSX();
    const XLSX = (window as any).XLSX;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      setCompExcelCols(cols);
      const skuC = cols.find(c => /sku|style/i.test(c)) || cols[0];
      const nameC = cols.find(c => /title|name|product/i.test(c)) || cols[1] || cols[0];
      setCompSkuCol(skuC); setCompNameCol(nameC);
      setCompExcelRows(rows as any);
      setCompRows((rows as any[]).slice(0, 50).map((row: any) => ({
        id: Math.random().toString(36).slice(2),
        sku: String(row[skuC] || "").trim(),
        query: String(row[nameC] || row[skuC] || "").trim(),
        status: "idle" as const, results: []
      })).filter((r: any) => r.query));
    }
  };

  const [compAnalyzing, setCompAnalyzing] = useState(false);
  const [compOurPrice, setCompOurPrice] = useState("");

  const compAnalyzeResults = async (rowId: string) => {
    const row = compRows.find(r => r.id === rowId);
    if (!row || row.results.length === 0) return;
    setCompAnalyzing(true);
    try {
      const res = await fetch(`${API_URL}/competitors/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query:     row.query,
          our_price: compOurPrice ? parseFloat(compOurPrice) : null,
          results:   row.results,
        })
      });
      const data = await res.json();
      // حدّث النتائج مع التحليل
      setCompRows(p => p.map(r => r.id === rowId ? {
        ...r,
        results: data.results || r.results,
        analysis_summary: data.summary,
      } as any : r));
    } catch {}
    setCompAnalyzing(false);
  };

  const compExportExcel = () => {
    const XLSX = (window as any).XLSX;
    const data: any[] = [];
    compRows.forEach(row => {
      if (row.results.length === 0) {
        data.push({ "SKU": row.sku, "المنتج": row.query, "الموقع": "—", "الاسم عندهم": "—", "السعر": "—", "التوفر": "—", "الرابط": "—" });
      } else {
        row.results.forEach(r => data.push({ "SKU": row.sku, "المنتج": row.query, "الموقع": r.competitor, "الاسم عندهم": r.title||"—", "السعر": r.price||"—", "التوفر": r.available===true?"متوفر":r.available===false?"غير متوفر":"—", "الرابط": r.link||"—" }));
      }
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "مراقبة المنافسين");
    XLSX.writeFile(wb, "مراقبة_المنافسين.xlsx");
  };

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
    const d = erpData as any;
    const sc = (s) => s === "critical" ? "#E24B4A" : s === "warning" ? "#EF9F27" : "#1D9E75";
    const sb = (s) => s === "critical" ? "#1f0d0d" : s === "warning" ? "#1a1400" : "#0d1f0d";
    const sl = (s) => s === "critical" ? "حرج" : s === "warning" ? "تحذير" : "جيد";
    const sev = (n, t1, t2) => !d ? "good" : n > t1 ? "critical" : n > t2 ? "warning" : "good";

    const kpis = [
      { n:"الطلبات المتأخرة", icon:"🚨", val: d ? String(d.late_orders?.count ?? "—") : "—", unit:"طلب", target:"الهدف: أقل من 10", key:"late_orders", sev: sev(d?.late_orders?.count||0, 10, 0), pct: Math.min(100,(d?.late_orders?.count||0)*2), insights:[`${d?.late_orders?.count||0} طلب تجاوز تاريخ التسليم`,`متوسط التأخير ${d?.late_orders?.items?.length>0?Math.round(d.late_orders.items.reduce((s,o)=>s+(o.days_late||0),0)/d.late_orders.items.length):0} يوم`,"تحتاج تدخل فوري"], recs:["تواصل مع العملاء المتأثرين فوراً","راجع سياسة التسليم","فعّل تنبيهات يومية"] },
      { n:"الطلبات العالقة", icon:"⏸", val: d ? String(d.stuck_orders?.count ?? "—") : "—", unit:"طلب", target:"الهدف: أقل من 5", key:"stuck_orders", sev: sev(d?.stuck_orders?.count||0, 8, 3), pct: Math.min(100,(d?.stuck_orders?.count||0)*8), insights:[`${d?.stuck_orders?.count||0} طلب بانتظار مورد أو شحن`,"راجع حالة كل طلب يدوياً"], recs:["راجع حالة الشحن لكل طلب","أنشئ تقرير أسبوعي تلقائي"] },
      { n:"وقت المعالجة", icon:"⏱", val: d ? `${d.avg_processing_days?.value??"—"}` : "—", unit:"يوم", target:"الهدف: 1.5 يوم", key:"avg_processing_days", sev: !d?"good":d.avg_processing_days?.value>3?"critical":d.avg_processing_days?.value>1.5?"warning":"good", pct: Math.min(100,((d?.avg_processing_days?.value||0)/3)*100), insights:[`متوسط ${d?.avg_processing_days?.value||0} يوم`,`مبني على ${d?.avg_processing_days?.sample||0} طلب`], recs:["راجع مراحل التأخير","سرّع إصدار البوليصة"] },
      { n:"المنتجات النافدة", icon:"📦", val: d ? String(d.out_of_stock?.count??"—") : "—", unit:"SKU", target:"الهدف: صفر", key:"out_of_stock", sev: sev(d?.out_of_stock?.count||0, 5, 0), pct: Math.min(100,(d?.out_of_stock?.count||0)*5), insights:[`${d?.out_of_stock?.count||0} منتج نفد من المخزون`,"يؤثر على تنفيذ الطلبات"], recs:["أنشئ أوامر شراء فورية","أعلم فريق المبيعات"] },
      { n:"قريبة من النفاد", icon:"⚠️", val: d ? String(d.low_stock?.count??"—") : "—", unit:"SKU", target:"الهدف: أقل من 15", key:"low_stock", sev: sev(d?.low_stock?.count||0, 20, 0), pct: Math.min(100,(d?.low_stock?.count||0)*3), insights:[`${d?.low_stock?.count||0} SKU أقل من حد إعادة الطلب`,"ستنفد خلال أيام"], recs:["ابدأ أوامر الشراء فوراً","رتّب حسب الأولوية"] },
      { n:"تأخر الموردين", icon:"🏭", val: d ? String(d.late_po?.count??"—") : "—", unit:"PO", target:"الهدف: صفر", key:"late_po", sev: sev(d?.late_po?.count||0, 5, 0), pct: Math.min(100,(d?.late_po?.count||0)*6), insights:[`${d?.late_po?.count||0} أوامر شراء متأخرة`,"يؤثر على تنفيذ طلبات العملاء"], recs:["اتصل بالموردين اليوم","فعّل غرامات التأخير"] },
      { n:"الشكاوى المفتوحة", icon:"💬", val: d ? String(d.open_complaints?.count??"—") : "—", unit:"شكوى", target:"الهدف: صفر", key:"open_complaints", sev: sev(d?.open_complaints?.count||0, 5, 0), pct: Math.min(100,(d?.open_complaints?.count||0)*10), insights:[`${d?.open_complaints?.count||0} شكوى مفتوحة`,`${d?.open_complaints?.no_reply_24h||0} بدون رد منذ 24 ساعة`], recs:["ردّ على الشكاوى غير المجابة فوراً","أضف قوالب ردود سريعة"] },
      { n:"وقت الرد", icon:"📞", val: d ? `${d.avg_response_hours?.value??"—"}` : "—", unit:"ساعة", target:"الهدف: 2 ساعة", key:"avg_response_hours", sev: !d?"good":d.avg_response_hours?.value>6?"critical":d.avg_response_hours?.value>2?"warning":"good", pct: Math.min(100,((d?.avg_response_hours?.value||0)/8)*100), insights:[`متوسط ${d?.avg_response_hours?.value||0} ساعة للرد`,d?.avg_response_hours?.value<=2?"أفضل من الهدف ✓":"تجاوز الهدف"], recs:["حافظ على معدل الرد الجيد","وثّق أفضل الممارسات"] },
      { n:"المبيعات", icon:"💰", val: d ? `${(d.daily_sales?.value||0).toLocaleString("ar-SA")}` : "—", unit:"ر.س", target:`الهدف: 20,000 · ${d?.daily_sales?.period||""}`, key:"daily_sales", sev: !d?"good":d.daily_sales?.value>=20000?"good":d.daily_sales?.value>=10000?"warning":"critical", pct: Math.min(100,((d?.daily_sales?.value||0)/20000)*100), insights:[`${(d?.daily_sales?.value||0).toLocaleString("ar-SA")} ر.س`,`${d?.daily_sales?.orders_count||0} فاتورة`], recs:["تابع أداء المبيعات يومياً","راجع القنوات الأقل أداءً"] },
      { n:"التوصيل في الوقت", icon:"🚚", val: d ? `${d.on_time_delivery?.pct??"—"}` : "—", unit:"%", target:"الهدف: 95%", key:"on_time_delivery", sev: !d?"good":(d.on_time_delivery?.pct||0)>=95?"good":(d.on_time_delivery?.pct||0)>=80?"warning":"critical", pct: d?.on_time_delivery?.pct||0, insights:[`${d?.on_time_delivery?.pct||0}% من الطلبات تُسلّم في الوقت`,`${d?.on_time_delivery?.count||0} تسليم`], recs:["تحليل أسباب التأخير","تحسين التنسيق مع شركات الشحن"] },
    ];

    const critical = kpis.filter(k=>k.sev==="critical").length;
    const warning = kpis.filter(k=>k.sev==="warning").length;
    const good = kpis.filter(k=>k.sev==="good").length;

    const renderDrill = (idx) => {
      const k = kpis[idx];
      const raw = d?.[k.key];
      const items = raw?.items || [];
      return (
        <div style={{background:"#0d0d14",border:"1px solid #378ADD",borderRadius:"14px",padding:"18px",marginBottom:"10px",animation:"fadeIn .2s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
            <div>
              <div style={{fontSize:"15px",fontWeight:"700"}}>{k.icon} {k.n} — تفاصيل</div>
              <div style={{fontSize:"11px",color:"#555",marginTop:"2px"}}>{k.val} {k.unit} · ERPNext</div>
            </div>
            <button onClick={()=>setActiveKpi(null)} style={{padding:"4px 12px",background:"#1a1a2e",border:"1px solid #2a2a4e",borderRadius:"6px",color:"#888",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>✕ إغلاق</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"14px"}}>
            <div style={{background:"#0a1520",border:"1px solid #1e3a5f",borderRadius:"10px",padding:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:"700",color:"#60a5fa",marginBottom:"8px"}}>📊 تحليل</div>
              {k.insights.map((ins,i)=>(
                <div key={i} style={{display:"flex",gap:"6px",marginBottom:"5px"}}>
                  <span style={{color:"#60a5fa",fontSize:"10px",flexShrink:0}}>◆</span>
                  <span style={{fontSize:"12px",color:"#b0c4de",lineHeight:"1.6"}}>{ins}</span>
                </div>
              ))}
            </div>
            <div style={{background:"#0a1a0f",border:"1px solid #1a3a1a",borderRadius:"10px",padding:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:"700",color:"#4ade80",marginBottom:"8px"}}>💡 التوصيات</div>
              {k.recs.map((rec,i)=>(
                <div key={i} style={{display:"flex",gap:"6px",marginBottom:"5px"}}>
                  <span style={{color:"#4ade80",fontSize:"10px",flexShrink:0}}>→</span>
                  <span style={{fontSize:"12px",color:"#86efac",lineHeight:"1.6"}}>{rec}</span>
                </div>
              ))}
            </div>
          </div>
          {items.length > 0 && (
            <div style={{background:"#0a0a0f",borderRadius:"10px",overflow:"hidden",marginBottom:"12px"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                <thead><tr style={{background:"#111118"}}>
                  {k.key==="late_orders" && ["الطلب","العميل","أيام التأخير","المبلغ"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                  {k.key==="stuck_orders" && ["الطلب","العميل","الحالة","التاريخ"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                  {["out_of_stock","low_stock"].includes(k.key) && ["SKU","المستودع","الكمية"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                  {k.key==="late_po" && ["PO","المورد","الاستحقاق","الحالة"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                  {k.key==="open_complaints" && ["#","العميل","الموضوع","الحالة"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"right",color:"#555",fontWeight:"600",borderBottom:"1px solid #1e1e2e"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {items.slice(0,10).map((item,i)=>(
                    <tr key={i} style={{borderBottom:"1px solid #141420",background:i%2===0?"transparent":"#0d0d14"}}>
                      {k.key==="late_orders" && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff",fontSize:"11px"}}>{item.id}</td>
                        <td style={{padding:"7px 10px",maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.customer}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:item.days_late>30?"#1f0d0d":"#1a1400",color:item.days_late>30?"#f87171":"#fbbf24",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.days_late} يوم</span></td>
                        <td style={{padding:"7px 10px",color:"#fbbf24",fontSize:"11px"}}>{item.amount?`${Number(item.amount).toLocaleString()} ر.س`:"—"}</td>
                      </>}
                      {k.key==="stuck_orders" && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff",fontSize:"11px"}}>{item.id}</td>
                        <td style={{padding:"7px 10px"}}>{item.customer}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:"#1a1400",color:"#fbbf24",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.status}</span></td>
                        <td style={{padding:"7px 10px",color:"#888",fontSize:"11px"}}>{item.date}</td>
                      </>}
                      {["out_of_stock","low_stock"].includes(k.key) && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff"}}>{item.sku}</td>
                        <td style={{padding:"7px 10px",color:"#888"}}>{item.warehouse}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:k.key==="out_of_stock"?"#1f0d0d":"#1a1400",color:k.key==="out_of_stock"?"#f87171":"#fbbf24",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.qty}</span></td>
                      </>}
                      {k.key==="late_po" && <>
                        <td style={{padding:"7px 10px",color:"#c8b8ff",fontSize:"11px"}}>{item.id}</td>
                        <td style={{padding:"7px 10px"}}>{item.supplier}</td>
                        <td style={{padding:"7px 10px",color:"#f87171"}}>{item.due}</td>
                        <td style={{padding:"7px 10px"}}><span style={{background:"#1f0d0d",color:"#f87171",padding:"2px 8px",borderRadius:"10px",fontSize:"10px"}}>{item.status}</span></td>
                      </>}
                      {k.key==="open_complaints" && <>
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
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
            <button style={{padding:"7px 14px",background:"#1a2a1e",border:"1px solid #4ade80",borderRadius:"8px",color:"#4ade80",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>📋 إنشاء Tasks</button>
            <button style={{padding:"7px 14px",background:"#1a2a1e",border:"1px solid #25d366",borderRadius:"8px",color:"#25d366",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>💬 واتساب</button>
            <button style={{padding:"7px 14px",background:"#1a1a2e",border:"1px solid #c8b8ff",borderRadius:"8px",color:"#c8b8ff",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>📊 Excel</button>
            <a href="http://144.91.102.29" target="_blank" rel="noopener noreferrer" style={{padding:"7px 14px",background:"#1a1a2e",border:"1px solid #555",borderRadius:"8px",color:"#888",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",textDecoration:"none"}}>🔗 ERPNext ↗</a>
          </div>
        </div>
      );
    };

    const renderKCard = (k, i) => (
      <div onClick={()=>setActiveKpi(activeKpi===i?null:i)}
        style={{background:"#111118",border:`1px solid ${activeKpi===i?"#378ADD":"#1e1e2e"}`,borderTop:`3px solid ${sc(k.sev)}`,borderRadius:"12px",padding:"14px",cursor:"pointer",position:"relative",transition:"all .15s"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
          <div style={{fontSize:"11px",color:"#666"}}>{k.n}</div>
          <span style={{background:sb(k.sev),color:sc(k.sev),padding:"1px 7px",borderRadius:"8px",fontSize:"10px"}}>{sl(k.sev)}</span>
        </div>
        <div style={{fontSize:"24px",fontWeight:"700",color:sc(k.sev),lineHeight:"1.1",marginBottom:"2px"}}>
          {erpLoading?<span style={{width:10,height:10,border:`2px solid #333`,borderTopColor:sc(k.sev),borderRadius:"50%",display:"inline-block",animation:"spin .8s linear infinite"}}/>:k.val}
          <span style={{fontSize:"12px",fontWeight:"400",color:"#555",marginRight:"4px"}}>{k.unit}</span>
        </div>
        <div style={{fontSize:"10px",color:"#555"}}>{k.target}</div>
        <div style={{height:"3px",background:"#1a1a2e",borderRadius:"2px",marginTop:"8px"}}>
          <div style={{width:`${k.pct}%`,height:"100%",background:sc(k.sev),borderRadius:"2px",transition:"width .6s"}}></div>
        </div>
      </div>
    );

    return (
      <div style={{fontFamily:"'Tajawal', sans-serif",direction:"rtl",minHeight:"100vh",background:"#0a0a0f",color:"#e8e8f0"}}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        <div style={{display:"flex",minHeight:"100vh"}}>
          {sidebarJSX}
          <div style={{flex:1,padding:"28px 32px",overflowY:"auto"}}>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px"}}>
              <div>
                <h1 style={{fontSize:"22px",fontWeight:"800",margin:"0 0 3px"}}>مركز القرار 📊</h1>
                <div style={{fontSize:"12px",display:"flex",alignItems:"center",gap:"6px"}}>
                  {erpLoading?<span style={{color:"#555",display:"flex",alignItems:"center",gap:"4px"}}><span style={{width:7,height:7,border:"2px solid #333",borderTopColor:"#c8b8ff",borderRadius:"50%",display:"inline-block",animation:"spin .8s linear infinite"}}/>جاري الجلب...</span>
                  :erpError?<span style={{color:"#f87171"}}>⚠️ {erpError}</span>
                  :d?<span style={{color:"#4ade80",display:"flex",alignItems:"center",gap:"4px"}}><span style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",animation:"pulse 2s infinite"}}/>ERPNext متصل · {lastFetched}</span>
                  :null}
                </div>
              </div>
              <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                {["اليوم","الأسبوع","الشهر","الربع","السنة"].map((p,i)=>(
                  <button key={p} onClick={()=>{setTimePeriod(i);fetchKpis(i);}} style={{padding:"5px 12px",background:timePeriod===i?"#1a1a2e":"transparent",border:`1px solid ${timePeriod===i?"#c8b8ff":"#2a2a3e"}`,borderRadius:"20px",color:timePeriod===i?"#c8b8ff":"#666",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>{p}</button>
                ))}
                <button onClick={()=>fetchKpis()} disabled={erpLoading} style={{padding:"5px 14px",background:"#1a1a2e",border:"1px solid #c8b8ff",borderRadius:"20px",color:"#c8b8ff",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",marginRight:"4px"}}>↻ تحديث</button>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px",marginBottom:"18px"}}>
              {[{l:"🔥 حرج",c:critical,col:"#E24B4A",bg:"#1f0d0d",br:"#3a1a1a"},{l:"⚠️ تحذير",c:warning,col:"#EF9F27",bg:"#1a1400",br:"#3a2800"},{l:"✅ جيد",c:good,col:"#1D9E75",bg:"#0d1f0d",br:"#1a3a1a"}].map(g=>(
                <div key={g.l} style={{background:g.bg,border:`1px solid ${g.br}`,borderRadius:"12px",padding:"14px 16px"}}>
                  <div style={{fontSize:"12px",fontWeight:"700",color:g.col,marginBottom:"4px"}}>{g.l}</div>
                  <div style={{fontSize:"30px",fontWeight:"800",color:g.col}}>{g.c}</div>
                  <div style={{fontSize:"10px",color:"#555",marginTop:"2px"}}>مؤشر</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"10px",marginBottom:"8px"}}>
              {kpis.slice(0,5).map((k,i)=>renderKCard(k, i))}
            </div>
            {activeKpi!==null&&activeKpi<5&&renderDrill(activeKpi)}

            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"10px",marginBottom:"8px"}}>
              {kpis.slice(5).map((k,ii)=>renderKCard(k, ii+5))}
            </div>
            {activeKpi!==null&&activeKpi>=5&&renderDrill(activeKpi)}

            <div style={{display:"grid",gridTemplateColumns:"1.2fr .8fr",gap:"12px",marginTop:"8px"}}>
              <div style={{background:"#111118",border:"1px solid #1e1e2e",borderRadius:"14px",padding:"18px"}}>
                <div style={{fontSize:"14px",fontWeight:"700",marginBottom:"12px"}}>الملخص التنفيذي</div>
                <div style={{background:"#0a1520",border:"1px solid #1e3a5f",borderRadius:"10px",padding:"12px",marginBottom:"12px"}}>
                  <div style={{fontSize:"11px",color:"#60a5fa",fontWeight:"700",marginBottom:"6px"}}>أعلى مخاطرة</div>
                  <p style={{fontSize:"12px",color:"#b0c4de",lineHeight:"1.7",margin:0}}>
                    {d?`الطلبات المتأخرة: ${d.late_orders?.count||0} · النافدة: ${d.out_of_stock?.count||0} SKU · تأخر الموردين: ${d.late_po?.count||0} PO`:"جاري تحميل البيانات..."}
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
                <div style={{display:"flex",gap:"8px"}}>
                  <button style={{padding:"7px 14px",background:"#1a2a1e",border:"1px solid #4ade80",borderRadius:"8px",color:"#4ade80",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>📋 إنشاء مهام</button>
                  <button style={{padding:"7px 14px",background:"#1a1a2e",border:"1px solid #c8b8ff",borderRadius:"8px",color:"#c8b8ff",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>💬 واتساب للإدارة</button>
                </div>
              </div>
              <div style={{background:"#111118",border:"1px solid #1e1e2e",borderRadius:"14px",padding:"18px"}}>
                <div style={{fontSize:"14px",fontWeight:"700",marginBottom:"12px"}}>جودة البيانات</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"12px"}}>
                  {[["آخر مزامنة",lastFetched||"—"],["مصدر","ERPNext"],["متأخرة",String(d?.late_orders?.count||0)],["نافدة",String(d?.out_of_stock?.count||0)+" SKU"]].map(([l,v])=>(
                    <div key={l} style={{background:"#0a0a0f",borderRadius:"8px",padding:"10px",textAlign:"center"}}>
                      <div style={{fontSize:"10px",color:"#555",marginBottom:"4px"}}>{l}</div>
                      <div style={{fontSize:"13px",fontWeight:"600",color:"#c8b8ff"}}>{v}</div>
                    </div>
                  ))}
                </div>
                <a href="http://144.91.102.29" target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"8px",background:"#1a1a2e",border:"1px solid #2a2a4e",borderRadius:"8px",color:"#c8b8ff",fontSize:"12px",textDecoration:"none",textAlign:"center"}}>🔗 فتح ERPNext ↗</a>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // COMPETITORS VIEW
  // ══════════════════════════════════════
  // COMPETITORS VIEW — محدّث بالكامل
  // ══════════════════════════════════════
  // ══════════════════════════════════════
  // COMPETITORS VIEW v2 — مواقع + منتجات
  // ══════════════════════════════════════
  if (view === "competitors") return (
    <div style={{ fontFamily:"'Tajawal',sans-serif", direction:"rtl", minHeight:"100vh", background:"#0a0a0f", color:"#e8e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{ display:"flex", minHeight:"100vh" }}>
        {sidebarJSX}
        <div style={{ flex:1, padding:"40px", overflowY:"auto" }}>

          <h1 style={{ fontSize:"24px", fontWeight:"800", margin:"0 0 4px" }}>مراقبة المنافسين 🔍</h1>
          <p style={{ color:"#555", fontSize:"13px", margin:"0 0 24px" }}>أدخل المنتج والموقع في كل صف — ابحث في أي موقع تريده</p>

          {/* Tabs */}
          <div style={{ display:"flex", borderBottom:"1px solid #1e1e2e", marginBottom:"20px" }}>
            {[
              { k:"manual", l:"إدخال يدوي" },
              { k:"excel",  l:"رفع Excel" },
              { k:"results", l:`النتائج${compRows.some(r=>r.status==="done")?` (${compRows.filter(r=>r.status==="done").length})`:""}` }
            ].map(t => (
              <button key={t.k} onClick={() => setCompTab(t.k as any)}
                style={{ padding:"9px 20px", background:"none", border:"none", borderBottom:compTab===t.k?"2px solid #c8b8ff":"2px solid transparent", color:compTab===t.k?"#c8b8ff":"#555", fontSize:"14px", fontWeight:compTab===t.k?"700":"400", cursor:"pointer", fontFamily:"inherit", marginBottom:"-1px" }}>
                {t.l}
              </button>
            ))}
          </div>

          {/* ── MANUAL TAB ── */}
          {compTab === "manual" && (
            <div>
              {/* Table header */}
              <div style={{ display:"grid", gridTemplateColumns:"140px 1fr 180px 32px", gap:"8px", padding:"0 4px 8px", fontSize:"12px", color:"#555", fontWeight:"600" }}>
                <span>SKU</span>
                <span>اسم المنتج للبحث *</span>
                <span>الموقع (مثال: noon.com)</span>
                <span></span>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:"6px", marginBottom:"14px" }}>
                {compRows.map((row, idx) => (
                  <div key={row.id} style={{ display:"grid", gridTemplateColumns:"140px 1fr 180px 32px", gap:"8px", background:"#111118", border:"1px solid #1e1e2e", borderRadius:"10px", padding:"9px 12px", alignItems:"center" }}>
                    <input value={row.sku} onChange={e => compUpdateRow(row.id, "sku", e.target.value)}
                      placeholder={`SKU-${idx+1}`}
                      style={{ ...inputStyle, padding:"7px 10px", fontSize:"12px", fontFamily:"monospace" }} />
                    <input value={row.query} onChange={e => compUpdateRow(row.id, "query", e.target.value)}
                      onKeyDown={e => e.key === "Enter" && compSearchRow(row.id)}
                      placeholder="مثال: سرير، طاولة رخام..."
                      style={{ ...inputStyle, padding:"7px 10px", fontSize:"13px" }} />
                    <input value={(row as any).site || ""} onChange={e => compUpdateRow(row.id, "site" as any, e.target.value)}
                      placeholder="noon.com أو homecenter.com.sa"
                      style={{ ...inputStyle, padding:"7px 10px", fontSize:"12px", direction:"ltr", textAlign:"left" }} />
                    <button onClick={() => compRemoveRow(row.id)} disabled={compRows.length===1}
                      style={{ width:30, height:30, background:"none", border:"1px solid #2a2a3e", borderRadius:"6px", color:"#555", cursor:compRows.length===1?"not-allowed":"pointer", fontSize:"13px", opacity:compRows.length===1?0.3:1 }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex", gap:"8px", marginBottom:"24px", flexWrap:"wrap" }}>
                <button onClick={compAddRow} style={{ padding:"9px 16px", background:"#111118", border:"1px solid #2a2a3e", borderRadius:"10px", color:"#c8b8ff", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" }}>+ صف</button>
                <button onClick={compSearchAll} disabled={compSearching || !compRows.some(r => r.query.trim())}
                  style={{ padding:"9px 22px", background:compSearching||!compRows.some(r=>r.query.trim())?"#2a2a3e":"#c8b8ff", color:compSearching||!compRows.some(r=>r.query.trim())?"#888":"#0a0a0f", border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:"700", cursor:compSearching||!compRows.some(r=>r.query.trim())?"not-allowed":"pointer", fontFamily:"inherit" }}>
                  {compSearching?`جاري... (${compRows.filter(r=>r.status==="done").length}/${compRows.filter(r=>r.query.trim()).length})`:`ابدأ البحث ←`}
                </button>
                {compRows.some(r=>r.status==="done") && (
                  <button onClick={compExportExcel} style={{ padding:"9px 16px", background:"#111118", border:"1px solid #1e3a2e", borderRadius:"10px", color:"#80ffdb", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" }}>تصدير Excel ↓</button>
                )}
              </div>

              {/* نتائج inline */}
              {compRows.filter(r=>r.status!=="idle").map(row => (
                <div key={row.id} style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:"14px", marginBottom:"10px", overflow:"hidden" }}>
                  <div style={{ padding:"11px 16px", borderBottom:"1px solid #1e1e2e", display:"flex", alignItems:"center", gap:"10px" }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", flexShrink:0, background:row.status==="searching"?"#ffd166":row.status==="done"?"#4ade80":"#ff6b6b", animation:row.status==="searching"?"pulse 1s infinite":"none" }} />
                    <span style={{ fontSize:"14px", fontWeight:"700", color:"#c8b8ff" }}>{row.query}</span>
                    {row.sku && <span style={{ fontSize:"10px", color:"#555", fontFamily:"monospace", background:"#0a0a0f", padding:"2px 5px", borderRadius:"3px" }}>{row.sku}</span>}
                    {(row as any).site && <span style={{ fontSize:"11px", color:"#555", direction:"ltr" }}>{(row as any).site}</span>}
                    <span style={{ marginRight:"auto", fontSize:"11px", color:"#555" }}>
                      {row.status==="searching"&&"جاري البحث..."}
                      {row.status==="done"&&`${row.results.filter(r=>r.title).length} نتيجة`}
                      {row.status==="error"&&<span style={{color:"#ff6b6b"}}>خطأ</span>}
                    </span>
                    <button onClick={()=>compSearchRow(row.id)} disabled={row.status==="searching"}
                      style={{ padding:"3px 9px", background:"none", border:"1px solid #2a2a3e", borderRadius:"5px", color:"#888", cursor:"pointer", fontSize:"11px", fontFamily:"inherit" }}>↻</button>
                    {row.status==="done" && row.results.filter(r=>r.title).length > 0 && (
                      <button onClick={()=>compAnalyzeResults(row.id)} disabled={compAnalyzing}
                        style={{ padding:"3px 10px", background:compAnalyzing?"#2a2a3e":"#1a2a1a", border:"1px solid #2a4a2a", borderRadius:"5px", color:compAnalyzing?"#555":"#4ade80", cursor:compAnalyzing?"not-allowed":"pointer", fontSize:"11px", fontFamily:"inherit" }}>
                        {compAnalyzing ? "..." : "🤖 تحليل ذكي"}
                      </button>
                    )}
                  </div>
                  {row.status==="done" && row.results.map((r,i) => {
                    const ai = (r as any).ai_analysis;
                    const recColor = ai?.price_recommendation === "increase" ? "#4ade80" : ai?.price_recommendation === "decrease" ? "#f87171" : "#888";
                    return (
                    <div key={i} style={{ borderBottom:"1px solid #141420", background:i%2?"#0d0d14":"transparent" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"110px 1fr 120px 90px 65px", alignItems:"center", padding:"9px 16px", gap:"10px" }}>
                        <span style={{ fontSize:"11px", padding:"3px 8px", background:"#1a1a2e", color:"#c8b8ff", borderRadius:"6px", textAlign:"center", fontWeight:"600", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.competitor}</span>
                        <div>
                          <div style={{ fontSize:"12px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:r.title?"#e8e8f0":"#555" }}>{r.title||r.error||"—"}</div>
                          {ai && <div style={{ fontSize:"10px", color:"#555", marginTop:"2px" }}>
                            <span style={{ color: ai.confidence >= 75 ? "#4ade80" : ai.confidence >= 60 ? "#ffd166" : "#f87171" }}>{ai.match_type}</span>
                            <span style={{ margin:"0 4px", color:"#333" }}>·</span>
                            <span>{ai.match_reason}</span>
                          </div>}
                        </div>
                        <span style={{ fontSize:"13px", fontWeight:"700", color:r.price?"#c8b8ff":"#555" }}>{r.price?`${r.price.toLocaleString()} ${r.currency}`:"—"}</span>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:"4px", padding:"2px 8px", borderRadius:"20px", fontSize:"11px", background:r.available===true?"#0d1f0d":r.available===false?"#1f0d0d":"#1a1a2e", color:r.available===true?"#4ade80":r.available===false?"#f87171":"#555", border:`1px solid ${r.available===true?"#1a3a1a":r.available===false?"#3a1a1a":"#2a2a3e"}` }}>
                          <span style={{ width:4, height:4, borderRadius:"50%", background:"currentColor" }} />
                          {r.available===true?"متوفر":r.available===false?"غير متوفر":"—"}
                        </span>
                        {r.link?<a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:"12px", color:"#7c6af7", textDecoration:"none" }}>فتح ↗</a>:<span style={{color:"#333",fontSize:"12px"}}>—</span>}
                      </div>
                      {ai?.price_recommendation && ai.price_recommendation !== "unknown" && (
                        <div style={{ padding:"4px 16px 8px", display:"flex", alignItems:"center", gap:"6px" }}>
                          <span style={{ fontSize:"10px", color:"#555" }}>توصية:</span>
                          <span style={{ fontSize:"11px", fontWeight:"600", color:recColor, padding:"1px 8px", background:recColor+"15", borderRadius:"20px" }}>
                            {ai.price_recommendation === "increase" ? "↑ ارفع السعر" : ai.price_recommendation === "decrease" ? "↓ راجع السعر" : "← حافظ على السعر"}
                          </span>
                          <span style={{ fontSize:"10px", color:"#555" }}>{ai.price_recommendation_reason}</span>
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              ))}
            </div>
          )}

          {/* ── EXCEL TAB ── */}
          {compTab === "excel" && (
            <div>
              {!compExcelFile ? (
                <div onClick={()=>compExcelRef.current?.click()} style={{ border:"2px dashed #2a2a3e", borderRadius:"16px", padding:"56px", textAlign:"center", cursor:"pointer", background:"#111118" }}>
                  <input ref={compExcelRef} type="file" accept=".xlsx,.xls" onChange={compHandleExcel} style={{ display:"none" }} />
                  <div style={{ fontSize:"36px", marginBottom:"10px" }}>📊</div>
                  <div style={{ fontSize:"14px", color:"#c8b8ff", marginBottom:"4px" }}>اضغط لرفع ملف Excel</div>
                  <div style={{ fontSize:"12px", color:"#555" }}>يكتشف عمود SKU والاسم تلقائياً | أول 50 منتج</div>
                </div>
              ) : (
                <div>
                  <div style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:"12px", padding:"12px 16px", display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px", flexWrap:"wrap" }}>
                    <span style={{ fontSize:"18px" }}>📄</span>
                    <span style={{ fontSize:"13px", color:"#c8b8ff" }}>{compExcelFile}</span>
                    <span style={{ fontSize:"12px", color:"#555" }}>{compRows.length} منتج</span>
                    <div style={{ marginRight:"auto", display:"flex", gap:"8px", alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                        <span style={{ fontSize:"11px", color:"#666" }}>SKU:</span>
                        <select value={compSkuCol} onChange={e=>{setCompSkuCol(e.target.value);setCompRows(compExcelRows.slice(0,50).map((r:any)=>({id:Math.random().toString(36).slice(2),sku:String(r[e.target.value]||"").trim(),query:String(r[compNameCol]||"").trim(),site:"",status:"idle" as const,results:[]})).filter((r:any)=>r.query));}}
                          style={{...inputStyle,width:"auto",padding:"4px 8px",fontSize:"12px"}}>
                          {compExcelCols.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                        <span style={{ fontSize:"11px", color:"#666" }}>الاسم:</span>
                        <select value={compNameCol} onChange={e=>{setCompNameCol(e.target.value);setCompRows(compExcelRows.slice(0,50).map((r:any)=>({id:Math.random().toString(36).slice(2),sku:String(r[compSkuCol]||"").trim(),query:String(r[e.target.value]||"").trim(),site:"",status:"idle" as const,results:[]})).filter((r:any)=>r.query));}}
                          style={{...inputStyle,width:"auto",padding:"4px 8px",fontSize:"12px"}}>
                          {compExcelCols.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <button onClick={()=>{setCompExcelFile("");setCompExcelRows([]);setCompRows([{id:"1",sku:"",query:"",status:"idle",results:[]}]);}} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:"13px"}}>✕</button>
                    </div>
                  </div>
                  <div style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:"10px", overflow:"hidden", marginBottom:"14px" }}>
                    <div style={{ padding:"9px 14px", borderBottom:"1px solid #1e1e2e", fontSize:"11px", color:"#555", fontWeight:"600" }}>معاينة</div>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
                      <thead><tr style={{background:"#0a0a0f"}}>
                        <th style={{padding:"7px 12px",textAlign:"right",color:"#555",borderBottom:"1px solid #1e1e2e",fontWeight:"500"}}>SKU</th>
                        <th style={{padding:"7px 12px",textAlign:"right",color:"#555",borderBottom:"1px solid #1e1e2e",fontWeight:"500"}}>اسم المنتج</th>
                      </tr></thead>
                      <tbody>
                        {compRows.slice(0,4).map((row,i)=>(<tr key={i} style={{borderBottom:"1px solid #141420"}}><td style={{padding:"7px 12px",color:"#c8b8ff",fontFamily:"monospace",fontSize:"11px"}}>{row.sku||"—"}</td><td style={{padding:"7px 12px"}}>{row.query}</td></tr>))}
                        {compRows.length>4&&<tr><td colSpan={2} style={{padding:"7px 12px",color:"#555",fontStyle:"italic"}}>... و {compRows.length-4} منتج آخر</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:"10px", padding:"12px 14px", marginBottom:"14px" }}>
                    <p style={{ fontSize:"12px", color:"#888", margin:"0 0 8px", fontWeight:"600" }}>موقع البحث لكل المنتجات (اختياري)</p>
                    <input placeholder="مثال: noon.com أو homecenter.com.sa"
                      onChange={e => setCompRows(p => p.map(r => ({...r, site: e.target.value} as any)))}
                      style={{ ...inputStyle, direction:"ltr", textAlign:"left", fontSize:"13px" }} />
                    <p style={{ fontSize:"11px", color:"#555", margin:"6px 0 0" }}>اتركه فارغاً للبحث في Homecenter وNoon تلقائياً</p>
                  </div>
                  <div style={{ display:"flex", gap:"8px" }}>
                    <button onClick={compSearchAll} disabled={compSearching}
                      style={{ padding:"11px 26px", background:compSearching?"#2a2a3e":"#c8b8ff", color:compSearching?"#888":"#0a0a0f", border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:"700", cursor:compSearching?"not-allowed":"pointer", fontFamily:"inherit" }}>
                      {compSearching?`جاري... (${compRows.filter(r=>r.status==="done").length}/${compRows.length})`:`ابدأ البحث في ${compRows.length} منتج ←`}
                    </button>
                    {compRows.some(r=>r.status==="done")&&(<button onClick={()=>setCompTab("results")} style={{padding:"11px 18px",background:"#111118",border:"1px solid #2a2a4e",borderRadius:"10px",color:"#c8b8ff",fontSize:"13px",cursor:"pointer",fontFamily:"inherit"}}>النتائج →</button>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RESULTS TAB ── */}
          {compTab === "results" && (
            <div>
              {!compRows.some(r=>r.status==="done") ? (
                <div style={{ background:"#111118", border:"1px dashed #2a2a3e", borderRadius:"14px", padding:"56px", textAlign:"center" }}>
                  <div style={{fontSize:"32px",marginBottom:"10px"}}>📋</div>
                  <p style={{color:"#555",fontSize:"13px"}}>لا توجد نتائج — ابدأ بحثاً أولاً</p>
                </div>
              ) : (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px", flexWrap:"wrap" }}>
                    <span style={{fontSize:"13px",color:"#888"}}>{compRows.filter(r=>r.status==="done").length} منتج</span>
                    <span style={{padding:"3px 10px",background:"#0d1f0d",color:"#4ade80",borderRadius:"20px",fontSize:"11px",border:"1px solid #1a3a1a"}}>{compRows.filter(r=>r.results.some(x=>x.available===true)).length} متوفر</span>
                    <span style={{padding:"3px 10px",background:"#1f0d0d",color:"#f87171",borderRadius:"20px",fontSize:"11px",border:"1px solid #3a1a1a"}}>{compRows.filter(r=>r.status==="done"&&r.results.every(x=>!x.title)).length} غير موجود</span>
                    <button onClick={compExportExcel} style={{marginRight:"auto",padding:"7px 14px",background:"#1a1a2e",border:"1px solid #1e3a2e",borderRadius:"8px",color:"#80ffdb",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>تصدير Excel ↓</button>
                  </div>
                  <div style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:"14px", overflow:"hidden" }}>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px",minWidth:"700px"}}>
                        <thead><tr style={{background:"#0a0a0f"}}>
                          {["SKU","المنتج","الموقع","الاسم عندهم","السعر","التوفر","رابط"].map(h=>(<th key={h} style={{padding:"9px 12px",textAlign:"right",color:"#555",fontWeight:"500",borderBottom:"1px solid #1e1e2e"}}>{h}</th>))}
                        </tr></thead>
                        <tbody>
                          {compRows.filter(r=>r.status==="done").flatMap(row=>
                            row.results.length===0
                              ?[<tr key={row.id+"-e"} style={{borderBottom:"1px solid #141420"}}><td style={{padding:"9px 12px",color:"#c8b8ff",fontFamily:"monospace",fontSize:"11px"}}>{row.sku||"—"}</td><td style={{padding:"9px 12px",maxWidth:"150px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.query}</td><td colSpan={5} style={{padding:"9px 12px",color:"#555",fontSize:"12px"}}>لا نتائج</td></tr>]
                              :row.results.map((r,i)=>(
                                <tr key={row.id+"-"+i} style={{borderBottom:"1px solid #141420",background:i%2?"#0d0d14":"transparent"}}>
                                  <td style={{padding:"9px 12px",color:"#c8b8ff",fontFamily:"monospace",fontSize:"11px"}}>{row.sku||"—"}</td>
                                  <td style={{padding:"9px 12px",maxWidth:"140px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.query}</td>
                                  <td style={{padding:"9px 12px"}}><span style={{fontSize:"11px",padding:"2px 8px",background:"#1a1a2e",color:"#c8b8ff",borderRadius:"6px",fontWeight:"600"}}>{r.competitor}</span></td>
                                  <td style={{padding:"9px 12px",maxWidth:"180px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title||"—"}</td>
                                  <td style={{padding:"9px 12px",color:"#c8b8ff",fontWeight:"600"}}>{r.price?`${r.price.toLocaleString()} ${r.currency}`:"—"}</td>
                                  <td style={{padding:"9px 12px"}}><span style={{display:"inline-flex",alignItems:"center",gap:"4px",padding:"2px 8px",borderRadius:"20px",fontSize:"11px",background:r.available===true?"#0d1f0d":r.available===false?"#1f0d0d":"#1a1a2e",color:r.available===true?"#4ade80":r.available===false?"#f87171":"#555"}}><span style={{width:4,height:4,borderRadius:"50%",background:"currentColor"}}/>{r.available===true?"متوفر":r.available===false?"غير متوفر":"—"}</span></td>
                                  <td style={{padding:"9px 12px"}}>{r.link?<a href={r.link} target="_blank" rel="noopener noreferrer" style={{color:"#7c6af7",fontSize:"12px",textDecoration:"none"}}>فتح ↗</a>:<span style={{color:"#333"}}>—</span>}</td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );

  
  // ══════════════════════════════════════
  // CONTENT STUDIO VIEW
  // ══════════════════════════════════════
  if (view === "content") {
    const ENV_STYLES = [
      "Minimal Modern","Luxury Modern","Warm Cozy","Scandinavian",
      "Hotel Style","Premium Arabic Interior","Outdoor Resort",
      "Café Style","Office Style","Neutral Editorial"
    ];
    const CATEGORIES = [
      "كنبة / أريكة","طاولة جانبية","طاولة قهوة","طاولة طعام",
      "كرسي","مرآة","خزانة / وحدة TV","إضاءة","أثاث خارجي","ديكور"
    ];
    const SYSTEM_PROMPT = `You are an AI Content Studio Agent for e-commerce product image production. Generate commercial-ready image prompts while preserving the product EXACTLY. Return ONLY valid JSON:
{"product_detected":"brief description","white_background":"complete white studio prompt","environment":"complete environment prompt","dimension":"complete dimension annotation prompt","environment_variations":[{"style":"Luxury Modern","prompt":"..."},{"style":"Warm Cozy","prompt":"..."},{"style":"Scandinavian","prompt":"..."},{"style":"Hotel Style","prompt":"..."},{"style":"Premium Arabic Interior","prompt":"..."}],"notes":"short notes if needed"}
RULE: Every prompt must include: Keep the product exactly the same shape, color, material, structure, proportions, and design. Only change background/lighting.`;

    return (
      <ContentStudioView
        sidebarJSX={sidebarJSX}
        ENV_STYLES={ENV_STYLES}
        CATEGORIES={CATEGORIES}
        SYSTEM_PROMPT={SYSTEM_PROMPT}
        API_URL={API_URL}
      />
    );
  }

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


// ══════════════════════════════════════
// ContentStudioView Component
// ══════════════════════════════════════
function ContentStudioView({ sidebarJSX, ENV_STYLES, CATEGORIES, SYSTEM_PROMPT, API_URL }: any) {
  const [imagePreview, setImagePreview] = useState<string|null>(null);
  const [imageBase64, setImageBase64]   = useState<string|null>(null);
  const [imageUrl, setImageUrl]         = useState("");
  const [category, setCategory]         = useState("");
  const [dimW, setDimW]                 = useState("");
  const [dimD, setDimD]                 = useState("");
  const [dimH, setDimH]                 = useState("");
  const [envStyle, setEnvStyle]         = useState("Luxury Modern");
  const [labelLang, setLabelLang]       = useState("Arabic");
  const [apiKey, setApiKey]             = useState(() => localStorage.getItem("anthropic_key") || "");
  const [notes, setNotes]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState<any>(null);
  const [error, setError]               = useState("");
  const [activeTab, setActiveTab]       = useState("white");
  const [copied, setCopied]             = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
      setImageBase64((ev.target?.result as string).split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(""), 2000);
  };

  const handleGenerate = async () => {
    if (!imageBase64 && !imageUrl && !category) return;
    setLoading(true); setError(""); setResult(null);
    const dims = [dimW?`Width: ${dimW}cm`:null, dimD?`Depth: ${dimD}cm`:null, dimH?`Height: ${dimH}cm`:null].filter(Boolean).join(", ");
    const userContent: any[] = [];
    if (imageBase64) userContent.push({ type:"image", source:{ type:"base64", media_type:"image/jpeg", data: imageBase64 }});
    userContent.push({ type:"text", text:`Category: ${category||"auto"}
Environment: ${envStyle}
Dimensions: ${dims||"not provided"}
Label language: ${labelLang}
Notes: ${notes||"none"}
Image URL: ${imageUrl||"not provided"}` });
    try {
      const apiKey = (window as any).__ANTHROPIC_KEY__ || localStorage.getItem("anthropic_key") || "";
      if (apiKey) localStorage.setItem("anthropic_key", apiKey);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json", "x-api-key": apiKey, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system: SYSTEM_PROMPT, messages:[{role:"user",content:userContent}] })
      });
      const data = await res.json();
      const raw = (data.content?.[0]?.text||"{}").replace(/```json|```/g,"").trim();
      setResult(JSON.parse(raw));
      setActiveTab("white");
    } catch { setError("خطأ في التوليد — تأكد من رفع صورة أو إدخال بيانات"); }
    setLoading(false);
  };

  const inStyle: React.CSSProperties = { width:"100%", padding:"8px 12px", background:"#0d0d1e", border:"1px solid #1e1e3a", borderRadius:"8px", color:"#a0a0c0", fontSize:"12px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  const tabs = [{k:"white",l:"خلفية بيضاء",i:"⬜"},{k:"env",l:"بيئة واقعية",i:"🏠"},{k:"dim",l:"مقاسات",i:"📐"},{k:"vars",l:"5 بيئات",i:"🎨"}];

  return (
    <div style={{ fontFamily:"'Tajawal',sans-serif", direction:"rtl", minHeight:"100vh", background:"#07070f", color:"#e2e2f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ display:"flex", minHeight:"100vh" }}>
        {sidebarJSX}
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"280px 1fr", overflow:"hidden" }}>

          {/* Left panel */}
          <div style={{ background:"#0a0a1a", borderLeft:"1px solid #1a1a3a", padding:"20px", overflowY:"auto", display:"flex", flexDirection:"column", gap:"14px" }}>
            <div>
              <h2 style={{ fontSize:"16px", fontWeight:"800", margin:"0 0 4px", color:"#fff" }}>✨ Content Studio AI</h2>
              <p style={{ fontSize:"12px", color:"#5050a0", margin:0 }}>توليد prompts احترافية لصور المنتجات</p>
            </div>

            {/* Image upload */}
            <div>
              <p style={{ fontSize:"12px", color:"#6060a0", margin:"0 0 6px", fontWeight:"600" }}>صورة المنتج</p>
              {imagePreview ? (
                <div style={{ position:"relative" }}>
                  <img src={imagePreview} alt="" style={{ width:"100%", height:"140px", objectFit:"contain", background:"#111122", borderRadius:"10px", border:"1px solid #1e1e3a" }} />
                  <button onClick={() => { setImagePreview(null); setImageBase64(null); }} style={{ position:"absolute", top:6, left:6, width:22, height:22, background:"#1f0d0d", border:"1px solid #3a1a1a", borderRadius:"50%", color:"#f87171", cursor:"pointer", fontSize:"11px" }}>✕</button>
                </div>
              ) : (
                <div onClick={() => fileRef.current?.click()} style={{ border:"2px dashed #1e1e3a", borderRadius:"10px", padding:"24px", textAlign:"center", cursor:"pointer", background:"#0d0d1e" }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }} />
                  <div style={{ fontSize:"24px", marginBottom:"6px" }}>📷</div>
                  <div style={{ fontSize:"12px", color:"#4040a0" }}>ارفع صورة المنتج</div>
                </div>
              )}
            </div>

            <div>
              <p style={{ fontSize:"12px", color:"#6060a0", margin:"0 0 5px", fontWeight:"600" }}>أو رابط الصورة</p>
              <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." style={{ ...inStyle, direction:"ltr", textAlign:"left" }} />
            </div>

            <div>
              <p style={{ fontSize:"12px", color:"#6060a0", margin:"0 0 5px", fontWeight:"600" }}>فئة المنتج</p>
              <select value={category} onChange={e => setCategory(e.target.value)} style={inStyle}>
                <option value="">اكتشاف تلقائي</option>
                {CATEGORIES.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <p style={{ fontSize:"12px", color:"#6060a0", margin:"0 0 6px", fontWeight:"600" }}>المقاسات (سم)</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"6px" }}>
                {([["العرض",dimW,setDimW],["العمق",dimD,setDimD],["الارتفاع",dimH,setDimH]] as [string,string,any][]).map(([l,v,s]) => (
                  <div key={l}>
                    <div style={{ fontSize:"10px", color:"#4040a0", marginBottom:"3px" }}>{l}</div>
                    <input value={v} onChange={e => s(e.target.value)} placeholder="—" style={{ ...inStyle, padding:"6px 8px" }} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize:"12px", color:"#6060a0", margin:"0 0 5px", fontWeight:"600" }}>أسلوب البيئة</p>
              <select value={envStyle} onChange={e => setEnvStyle(e.target.value)} style={inStyle}>
                {ENV_STYLES.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <p style={{ fontSize:"12px", color:"#6060a0", margin:"0 0 6px", fontWeight:"600" }}>لغة المقاسات</p>
              <div style={{ display:"flex", gap:"6px" }}>
                {["Arabic","English"].map(l => (
                  <button key={l} onClick={() => setLabelLang(l)} style={{ flex:1, padding:"7px", background:labelLang===l?"#1e1a3a":"#0d0d1e", border:`1px solid ${labelLang===l?"#7c3aed":"#1e1e3a"}`, borderRadius:"7px", color:labelLang===l?"#a78bfa":"#4040a0", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize:"12px", color:"#6060a0", margin:"0 0 5px", fontWeight:"600" }}>ملاحظات</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي تفاصيل إضافية..." rows={2}
                style={{ ...inStyle, resize:"none" }} />
            </div>

            <div>
              <p style={{ fontSize:"12px", color:"#6060a0", margin:"0 0 5px", fontWeight:"600" }}>🔑 Anthropic API Key</p>
              <input value={apiKey} onChange={e => { setApiKey(e.target.value); localStorage.setItem("anthropic_key", e.target.value); }}
                placeholder="sk-ant-..." type="password"
                style={{ ...inStyle, direction:"ltr", textAlign:"left", fontFamily:"monospace", fontSize:"11px" }} />
              <p style={{ fontSize:"10px", color:"#3030a0", margin:"4px 0 0" }}>يُحفظ تلقائياً في المتصفح</p>
            </div>

            <button onClick={handleGenerate} disabled={loading || (!imageBase64 && !imageUrl && !category) || !apiKey}
              style={{ width:"100%", padding:"13px", background:loading?"#1a1a3a":"linear-gradient(135deg,#7c3aed,#db2777)", border:"none", borderRadius:"10px", color:loading?"#5050a0":"#fff", fontSize:"14px", fontWeight:"800", cursor:loading?"not-allowed":"pointer", fontFamily:"inherit" }}>
              {loading ? "جاري التوليد..." : "✨ توليد الـ Prompts"}
            </button>
          </div>

          {/* Right: Results */}
          <div style={{ padding:"24px", overflowY:"auto", background:"#07070f" }}>
            {loading && (
              <div style={{ textAlign:"center", padding:"60px 0" }}>
                <div style={{ width:40, height:40, border:"3px solid #1e1e3a", borderTopColor:"#7c3aed", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 14px" }} />
                <p style={{ color:"#5050a0", fontSize:"13px" }}>Claude يولد الـ prompts...</p>
              </div>
            )}

            {error && <div style={{ padding:"12px 16px", background:"#1f0d0d", border:"1px solid #3a1a1a", borderRadius:"10px", color:"#f87171", fontSize:"13px", marginBottom:"16px" }}>⚠ {error}</div>}

            {result && !loading && (
              <>
                {result.product_detected && (
                  <div style={{ background:"#0d1a0d", border:"1px solid #1a3a1a", borderRadius:"10px", padding:"10px 14px", marginBottom:"16px" }}>
                    <span style={{ fontSize:"12px", color:"#4ade80" }}>✅ تم اكتشاف: {result.product_detected}</span>
                  </div>
                )}
                <div style={{ display:"flex", borderBottom:"1px solid #1a1a3a", marginBottom:"16px" }}>
                  {tabs.map(t => (
                    <button key={t.k} onClick={() => setActiveTab(t.k)}
                      style={{ padding:"8px 14px", background:"none", border:"none", borderBottom:activeTab===t.k?"2px solid #7c3aed":"2px solid transparent", color:activeTab===t.k?"#a78bfa":"#5050a0", fontSize:"12px", fontWeight:activeTab===t.k?"700":"400", cursor:"pointer", fontFamily:"inherit", marginBottom:"-1px" }}>
                      {t.i} {t.l}
                    </button>
                  ))}
                </div>

                {activeTab==="white" && result.white_background && (
                  <PromptBox label="⬜ White Studio Background" prompt={result.white_background} id="w" copied={copied} onCopy={copyText} />
                )}
                {activeTab==="env" && result.environment && (
                  <PromptBox label={`🏠 Environment — ${envStyle}`} prompt={result.environment} id="e" copied={copied} onCopy={copyText} />
                )}
                {activeTab==="dim" && result.dimension && (
                  <PromptBox label="📐 Dimension Annotation" prompt={result.dimension} id="d" copied={copied} onCopy={copyText} />
                )}
                {activeTab==="vars" && result.environment_variations?.map((v: any, i: number) => (
                  <PromptBox key={i} label={`🎨 ${v.style}`} prompt={v.prompt} id={`v${i}`} copied={copied} onCopy={copyText} />
                ))}
                {result.notes && (
                  <div style={{ background:"#0d0d1e", border:"1px solid #1e2a3a", borderRadius:"8px", padding:"10px 14px", marginTop:"8px" }}>
                    <span style={{ fontSize:"11px", color:"#5060a0" }}>📝 {result.notes}</span>
                  </div>
                )}
              </>
            )}

            {!result && !loading && !error && (
              <div style={{ textAlign:"center", padding:"80px 0" }}>
                <div style={{ fontSize:"52px", marginBottom:"14px", opacity:0.15 }}>✨</div>
                <p style={{ color:"#4040a0", fontSize:"14px", marginBottom:"6px" }}>ارفع صورة المنتج وحدد الإعدادات</p>
                <p style={{ color:"#2a2a60", fontSize:"12px" }}>سيولد Claude prompts احترافية جاهزة لأدوات توليد الصور</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptBox({ label, prompt, id, copied, onCopy }: { label:string; prompt:string; id:string; copied:string; onCopy:(t:string,k:string)=>void }) {
  return (
    <div style={{ background:"#0d0d1e", border:"1px solid #1e1e3a", borderRadius:"12px", padding:"16px", marginBottom:"12px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
        <span style={{ fontSize:"12px", fontWeight:"700", color:"#a78bfa" }}>{label}</span>
        <button onClick={() => onCopy(prompt, id)}
          style={{ padding:"4px 12px", background:copied===id?"#1a3a1a":"#1a1a3a", border:`1px solid ${copied===id?"#4ade80":"#2a2a5a"}`, borderRadius:"6px", color:copied===id?"#4ade80":"#6060c0", fontSize:"11px", cursor:"pointer", fontFamily:"inherit" }}>
          {copied===id ? "✓ تم النسخ" : "نسخ"}
        </button>
      </div>
      <p style={{ fontSize:"12px", color:"#8080b0", lineHeight:"1.7", margin:0, direction:"ltr", textAlign:"left", whiteSpace:"pre-wrap" }}>{prompt}</p>
    </div>
  );
}
