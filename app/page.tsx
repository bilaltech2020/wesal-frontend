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

type ViewType = "landing" | "login" | "register" | "dashboard" | "competitors" | "inventory" | "reports" | "content" | "library";

const NAV = [
  { icon: "⬡", label: "لوحة التحكم", v: "dashboard" },
  { icon: "🔍", label: "مراقبة المنافسين", v: "competitors" },
  { icon: "📦", label: "مراقبة المخزون", v: "inventory" },
  { icon: "◈", label: "التكاملات", v: "dashboard" },
  { icon: "◇", label: "التقارير", v: "reports" },
  { icon: "○", label: "الإعدادات", v: "dashboard" },
  { icon: "✨", label: "Content Studio", v: "content" },
  { icon: "📚", label: "مكتبة الأوامر", v: "library" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: "#ffffff",
  border: "1px solid #c8c8e8", borderRadius: "8px", color: "#1a1a2e",
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

  // ── Report Chat AI ──
  const [reportChat, setReportChat] = useState<{role:"user"|"assistant";text:string}[]>([]);
  const [reportChatInput, setReportChatInput] = useState("");
  const [reportChatLoading, setReportChatLoading] = useState(false);

  const sendReportChat = async () => {
    if (!reportChatInput.trim() || reportChatLoading) return;
    const userMsg = reportChatInput.trim();
    setReportChatInput("");
    setReportChat(p => [...p, {role:"user", text: userMsg}]);
    setReportChatLoading(true);
    const d = erpData as any;
    const ctx = d ? [
      "الطلبات المتأخرة: "+(d.late_orders?.count??"—"),
      "الطلبات العالقة: "+(d.stuck_orders?.count??"—"),
      "المنتجات النافدة: "+(d.out_of_stock?.count??"—")+" SKU",
      "تأخر الموردين: "+(d.late_po?.count??"—")+" PO",
      "الشكاوى: "+(d.open_complaints?.count??"—"),
      "المبيعات: "+(d.daily_sales?.value?.toLocaleString("ar-SA")??"—")+" ر.س",
      "التوصيل في الوقت: "+(d.on_time_delivery?.pct??"—")+"%",
    ].join(", ") : "لا توجد بيانات";
    const sys = "أنت مساعد تحليل أعمال لشركة أثاث سعودية. البيانات: "+ctx+". أجب بالعربية بشكل مختصر.";
    try {
      const res = await fetch(API_URL+"/report-chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({message:userMsg, system:sys, history:reportChat.slice(-6)})
      });
      const data = await res.json();
      setReportChat(p => [...p, {role:"assistant", text:data.reply||"لا يمكنني الإجابة حالياً"}]);
    } catch {
      setReportChat(p => [...p, {role:"assistant", text:"خطأ في الاتصال"}]);
    }
    setReportChatLoading(false);
  };

  // Reports / KPIs
  const [activeKpi, setActiveKpi]   = useState<number | null>(null);
  const [erpData, setErpData]        = useState<any>(null);
  const [erpLoading, setErpLoading]  = useState(false);
  const [erpError, setErpError]      = useState("");
  const [lastFetched, setLastFetched]= useState("");
  const [timePeriod, setTimePeriod]  = useState(2); // 0=today,1=week,2=month,3=quarter,4=year

  const fetchKpis = async (period = ["today","week","month","quarter","year"][timePeriod] as string) => {
    setErpLoading(true); setErpError("");
    try {
      const res = await fetch(`${API_URL}/erpnext-kpis?period=${period}`);
      const json = await res.json();
      if (json.status === "ok") {
        setErpData(json.data);
        setLastFetched(new Date().toLocaleTimeString("ar-SA"));
      } else {
        setErpError(json.message || "خطأ في جلب البيانات");
      }
    } catch (e) {
      setErpError("تعذّر الاتصال بـ ERPNext");
    }
    setErpLoading(false);
  };

  useEffect(() => { fetchKpis(); }, []);

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
    <div style={{ width: "240px", background: "#f5f5fb", borderLeft: "1px solid #e0e0f0", padding: "32px 20px", display: "flex", flexDirection: "column", gap: "8px", minHeight: "100vh", flexShrink: 0 }}>
      <div style={{ fontSize: "22px", fontWeight: "900", color: "#7c3aed", marginBottom: "32px" }}>وصال</div>
      {NAV.map(item => (
        <div key={item.label} onClick={() => setView(item.v as ViewType)}
          style={{ padding: "10px 14px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", background: view === item.v && (item.v === "competitors" || item.v === "inventory") ? "#1a1a2e" : view === "dashboard" && item.v === "dashboard" && item.label === "لوحة التحكم" ? "#1a1a2e" : "transparent", color: (view === item.v && (item.v === "competitors" || item.v === "inventory")) || (view === "dashboard" && item.label === "لوحة التحكم") ? "#7c3aed" : "#666", fontSize: "14px", fontWeight: "500" }}>
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
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#ffffff", color: "#1a1a2e" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />

      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {sidebarJSX}
        <div style={{ flex: 1, padding: "40px", overflowY: "auto" }}>
          <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px" }}>مراقبة المخزون 📦</h1>
          <p style={{ color: "#777", fontSize: "13px", margin: "0 0 28px" }}>ارفع ملف Excel أو ابحث يدوياً في عدة متاجر بنفس الوقت</p>

          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px", alignItems: "start" }}>

            {/* ─ Left: Stores ─ */}
            <div>
              <div style={{ background: "#f5f5fb", border: "1px solid #e0e0f0", borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#666", fontWeight: "600" }}>إضافة متجر</p>
                <input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="اسم المتجر" style={{ ...inputStyle, marginBottom: "8px" }} />
                <input value={storeUrl} onChange={e => setStoreUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && addStore()} placeholder="https://store.com" style={{ ...inputStyle, marginBottom: "10px", direction: "ltr", textAlign: "left" }} />
                <button onClick={addStore} style={{ width: "100%", padding: "10px", background: "#7c3aed", color: "#ffffff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}>+ إضافة</button>
              </div>
              {stores.length > 0 && (
                <div style={{ background: "#f5f5fb", border: "1px solid #e0e0f0", borderRadius: "16px", overflow: "hidden", marginBottom: "12px" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #e0e0f0", fontSize: "11px", color: "#777", fontWeight: "600" }}>المتاجر ({stores.length})</div>
                  {stores.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #141420", gap: "8px" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: "13px", fontWeight: "500" }}>{s.name}</div>
                        <div style={{ fontSize: "11px", color: "#777", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "ltr", textAlign: "left" }}>{s.urlTemplate || s.url}</div>
                        {s.urlTemplate && <div style={{ fontSize: "10px", color: "#4ade80", marginTop: "2px" }}>✓ template رابط</div>}
                      </div>
                      <button onClick={() => setStores(p => p.filter(x => x.id !== s.id))} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: "13px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─ Right: Search ─ */}
            <div>

              {/* Excel Upload Section */}
              <div style={{ background: "#f5f5fb", border: "1px solid #e0e0f0", borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
                <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#666", fontWeight: "600" }}>رفع ملف Excel 📊</p>

                {!excelRows.length ? (
                  <div>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{ border: "2px dashed #2a2a3e", borderRadius: "10px", padding: "28px", textAlign: "center", cursor: "pointer" }}
                    >
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>📊</div>
                      <div style={{ fontSize: "14px", color: "#7c3aed", marginBottom: "4px" }}>اضغط لرفع ملف Excel</div>
                      <div style={{ fontSize: "12px", color: "#777" }}>.xlsx أو .xls</div>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} style={{ display: "none" }} />
                  </div>
                ) : (
                  <div>
                    <div style={{ background: "#f0f0fa", border: "1px solid #e0e0f0", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                      <span style={{ fontSize: "16px" }}>📄</span>
                      <span style={{ fontSize: "13px", color: "#7c3aed" }}>{excelFileName}</span>
                      <span style={{ marginRight: "auto", fontSize: "12px", color: "#777" }}>{excelRows.length} صف</span>
                      <button onClick={() => { setExcelRows([]); setExcelCols([]); setExcelResults([]); setExcelFileName(""); }} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: "13px" }}>✕</button>
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
                    <div style={{ background: "#ffffff", border: "1px solid #e0e0f0", borderRadius: "8px", overflow: "hidden", marginBottom: "14px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr>{excelCols.slice(0, 4).map(c => <th key={c} style={{ padding: "8px 12px", textAlign: "right", color: "#777", borderBottom: "1px solid #e0e0f0", fontWeight: "500" }}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {excelRows.slice(0, 3).map((row, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #141420" }}>
                              {excelCols.slice(0, 4).map(c => <td key={c} style={{ padding: "7px 12px", color: c === searchCol ? "#7c3aed" : "#1a1a2e" }}>{String(row[c] || "")}</td>)}
                            </tr>
                          ))}
                          {excelRows.length > 3 && <tr><td colSpan={4} style={{ padding: "7px 12px", color: "#777", fontStyle: "italic", fontSize: "11px" }}>... و {excelRows.length - 3} صف آخر</td></tr>}
                        </tbody>
                      </table>
                    </div>

                    <button
                      onClick={handleExcelSearch}
                      disabled={excelSearching || stores.length === 0}
                      style={{ width: "100%", padding: "12px", background: excelSearching || stores.length === 0 ? "#d0d0ec" : "#7c3aed", color: excelSearching || stores.length === 0 ? "#666" : "#ffffff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: excelSearching || stores.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                    >
                      {excelSearching ? `جاري البحث... (${excelResults.length} نتيجة)` : `ابدأ البحث في ${excelRows.length} منتج ←`}
                    </button>
                    {stores.length === 0 && <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#ff6b6b" }}>⚠️ أضف متجراً أولاً من القائمة على اليسار</p>}
                  </div>
                )}
              </div>

              {/* Manual SKU Search */}
              <div style={{ background: "#f5f5fb", border: "1px solid #e0e0f0", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#666", fontWeight: "600" }}>بحث يدوي بـ SKU</p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input value={skuInput} onChange={e => setSkuInput(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder="مثال: كنبة L-shape أو SKU-1234"
                    style={{ flex: 1, padding: "12px 16px", background: "#ffffff", border: "1px solid #c8c8e8", borderRadius: "10px", color: "#1a1a2e", fontSize: "14px", outline: "none", fontFamily: "inherit" }} />
                  <button onClick={doSearch} disabled={searching || !skuInput.trim() || stores.length === 0}
                    style={{ padding: "12px 22px", background: (searching || stores.length === 0) ? "#d0d0ec" : "#7c3aed", color: (searching || stores.length === 0) ? "#666" : "#ffffff", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: "700", cursor: (searching || stores.length === 0) ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    {searching ? "جاري..." : "بحث ←"}
                  </button>
                </div>
              </div>

              {/* Excel Results Table */}
              {excelResults.length > 0 && (
                <div style={{ background: "#f5f5fb", border: "1px solid #e0e0f0", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #e0e0f0", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#1a1a2e" }}>نتائج البحث</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: "#0d1f0d", color: "#4ade80", border: "1px solid #1a3a1a" }}>
                      {excelResults.filter(r => r.found).length} موجود
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: "#fdeaea", color: "#f87171", border: "1px solid #3a1a1a" }}>
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
                        style={{ marginRight: "auto", padding: "6px 14px", background: "#1a1a2e", border: "1px solid #2a2a4e", borderRadius: "8px", color: "#7c3aed", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        تصدير Excel ↓
                      </button>
                    )}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "600px" }}>
                      <thead>
                        <tr style={{ background: "#ffffff" }}>
                          <th style={{ padding: "9px 14px", textAlign: "right", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0", width: "30px" }}>#</th>
                          <th style={{ padding: "9px 14px", textAlign: "right", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0" }}>اسم المنتج</th>
                          <th style={{ padding: "9px 14px", textAlign: "right", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0", width: "90px" }}>SKU</th>
                          <th style={{ padding: "9px 14px", textAlign: "right", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0", width: "100px" }}>المتجر</th>
                          <th style={{ padding: "9px 14px", textAlign: "center", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0", width: "100px" }}>السعر</th>
                          <th style={{ padding: "9px 14px", textAlign: "center", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0", width: "90px" }}>الحالة</th>
                          <th style={{ padding: "9px 14px", textAlign: "center", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0", width: "60px" }}>رابط</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelResults.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #141420", background: i % 2 === 0 ? "transparent" : "#f0f0fa" }}>
                            <td style={{ padding: "10px 14px", color: "#777" }}>{i + 1}</td>
                            <td style={{ padding: "10px 14px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.productName}</td>
                            <td style={{ padding: "10px 14px", color: "#7c3aed", fontSize: "12px" }}>{r.sku}</td>
                            <td style={{ padding: "10px 14px", color: "#666", fontSize: "12px" }}>{r.storeName}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center", color: "#7c3aed", fontWeight: "600" }}>{r.price}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: r.found ? "#0d1f0d" : "#fdeaea", color: r.found ? "#4ade80" : "#f87171", border: `1px solid ${r.found ? "#d0f0d0" : "#f8d0d0"}` }}>
                                <span style={{ width: 5, height: 5, borderRadius: "50%", background: r.found ? "#4ade80" : "#f87171" }} />
                                {r.found ? "موجود" : "غير موجود"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#7c6af7", fontSize: "12px", textDecoration: "none" }}>فتح ↗</a> : <span style={{ color: "#999" }}>—</span>}
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
                <div key={search.id} style={{ background: "#f5f5fb", border: "1px solid #e0e0f0", borderRadius: "16px", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #e0e0f0", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "700", color: "#7c3aed" }}>{search.sku}</span>
                    <span style={{ fontSize: "11px", color: "#777" }}>{search.searchedAt}</span>
                    <span style={{ marginRight: "auto", fontSize: "11px", color: "#666" }}>{search.results.reduce((acc, r) => acc + (r.status === "done" ? r.count : 0), 0)} نتيجة</span>
                  </div>
                  {search.results.map(r => (
                    <div key={r.storeId}>
                      <div style={{ padding: "10px 20px", background: "#0f0f1a", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #e0e0f0" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: r.status === "loading" ? "#ffd166" : r.status === "error" ? "#ff6b6b" : "#4ade80" }} />
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#7c3aed" }}>{r.storeName}</span>
                        {r.status === "loading" && <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#777" }}><span style={{ width: 10, height: 10, border: "2px solid #333", borderTopColor: "#7c3aed", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />جاري البحث...</span>}
                        {r.status === "done" && <span style={{ fontSize: "12px", color: "#777" }}>{r.count} منتج</span>}
                        {r.status === "error" && <span style={{ fontSize: "12px", color: "#ff6b6b" }}>⚠️ {r.error}</span>}
                      </div>
                      {r.status === "done" && r.products.length > 0 && (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead><tr style={{ background: "#ffffff" }}>
                            <th style={{ padding: "8px 16px", textAlign: "right", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0" }}>اسم المنتج</th>
                            <th style={{ padding: "8px 16px", textAlign: "center", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0", width: "110px" }}>السعر</th>
                            <th style={{ padding: "8px 16px", textAlign: "center", color: "#777", fontWeight: "500", borderBottom: "1px solid #e0e0f0", width: "70px" }}>رابط</th>
                          </tr></thead>
                          <tbody>
                            {r.products.map((p, idx) => (
                              <tr key={idx} style={{ borderBottom: "1px solid #141420", background: idx % 2 === 0 ? "transparent" : "#f0f0fa" }}>
                                <td style={{ padding: "10px 16px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
                                <td style={{ padding: "10px 16px", textAlign: "center", color: "#7c3aed", fontWeight: "600" }}>{p.price || "—"}</td>
                                <td style={{ padding: "10px 16px", textAlign: "center" }}><a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: "#7c6af7", fontSize: "12px", textDecoration: "none" }}>فتح ↗</a></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {r.status === "done" && r.products.length === 0 && <div style={{ padding: "16px 20px", fontSize: "13px", color: "#777" }}>لا توجد نتائج</div>}
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
  // REPORTS / EXECUTIVE DASHBOARD VIEW
  // ══════════════════════════════════════
  if (view === "reports") {
    const d = erpData as any;
    const sev = (n, t1, t2) => !d ? "good" : n > t1 ? "critical" : n > t2 ? "warning" : "good";
    const sevColor = (s) => s === "critical" ? "#E24B4A" : s === "warning" ? "#EF9F27" : "#1D9E75";
    const sevBg = (s) => s === "critical" ? "#FCEBEB" : s === "warning" ? "#FAEEDA" : "#E1F5EE";
    const sevLabel = (s) => s === "critical" ? "حرج" : s === "warning" ? "تحذير" : "جيد";

    const kpis = [
      { n:"الطلبات المتأخرة",  val: d?.late_orders?.count??0,       unit:"طلب",  target:"الهدف: أقل من 10",  sev: sev(d?.late_orders?.count||0,10,0) },
      { n:"الطلبات العالقة",   val: d?.stuck_orders?.count??0,      unit:"طلب",  target:"الهدف: أقل من 5",   sev: sev(d?.stuck_orders?.count||0,8,3) },
      { n:"وقت المعالجة",      val: d?.avg_processing_days?.value??0,unit:"يوم",  target:"الهدف: 1.5 يوم",    sev: !d?"good":d?.avg_processing_days?.value>3?"critical":d?.avg_processing_days?.value>1.5?"warning":"good" },
      { n:"المنتجات النافدة",  val: d?.out_of_stock?.count??0,      unit:"SKU",  target:"الهدف: صفر",         sev: sev(d?.out_of_stock?.count||0,5,0) },
      { n:"قريبة من النفاد",   val: d?.low_stock?.count??0,         unit:"SKU",  target:"الهدف: أقل من 15",  sev: sev(d?.low_stock?.count||0,20,0) },
      { n:"تأخر الموردين",     val: d?.late_po?.count??0,           unit:"PO",   target:"الهدف: صفر",         sev: sev(d?.late_po?.count||0,5,0) },
      { n:"الشكاوى المفتوحة", val: d?.open_complaints?.count??0,   unit:"شكوى", target:"الهدف: صفر",         sev: sev(d?.open_complaints?.count||0,5,0) },
      { n:"وقت الرد",          val: d?.avg_response_hours?.value??0, unit:"ساعة", target:"الهدف: 2 ساعة",     sev: !d?"good":d?.avg_response_hours?.value>6?"critical":d?.avg_response_hours?.value>2?"warning":"good" },
      { n:"المبيعات",           val: d?.daily_sales?.value??0,       unit:"ر.س",  target:"الهدف: 20,000",      sev: !d?"good":d?.daily_sales?.value>=20000?"good":d?.daily_sales?.value>=10000?"warning":"critical" },
      { n:"التوصيل في الوقت",  val: d?.on_time_delivery?.pct??0,    unit:"%",    target:"الهدف: 95%",         sev: !d?"good":(d?.on_time_delivery?.pct||0)>=95?"good":(d?.on_time_delivery?.pct||0)>=80?"warning":"critical" },
    ];

    const critical = kpis.filter(k=>k.sev==="critical").length;
    const warning  = kpis.filter(k=>k.sev==="warning").length;
    const good     = kpis.filter(k=>k.sev==="good").length;

    // Employee data
    const employees = d?.employee_performance?.employees || [];
    const procSpeed = d?.procurement_speed;
    const shipSpeed = d?.shipping_speed;

    // Sales trend (daily_sales value as single point — will expand later)
    const revenue  = d?.daily_sales?.value || 0;
    const orders   = d?.stuck_orders?.count || 0;
    const aov      = orders > 0 ? Math.round(revenue / orders) : 0;
    const fulfRate = d?.on_time_delivery?.pct || 0;
    const delayRate = d?.late_orders?.count > 0 && d?.stuck_orders?.count > 0
      ? Math.round((d.late_orders.count / Math.max(d.stuck_orders.count, 1)) * 100)
      : 0;

    // AI decisions
    const aiDecisions: any[] = [];
    if ((d?.late_po?.count||0) > 5)   aiDecisions.push({ title:"استبدل المورد المتأخر", reason:`${d.late_po.count} أوامر شراء متأخرة تؤثر على التنفيذ`, priority:"عالية", color:"#534AB7", bg:"#EEEDFE" });
    if ((d?.out_of_stock?.count||0) > 0) aiDecisions.push({ title:"أوامر شراء فورية للمنتجات النافدة", reason:`${d.out_of_stock.count} SKU نفدت — يؤثر على المبيعات`, priority:"عالية", color:"#A32D2D", bg:"#FCEBEB" });
    if ((d?.late_orders?.count||0) > 10) aiDecisions.push({ title:"تحقق في تأخيرات الشحن", reason:`${d.late_orders.count} طلب متأخر — راجع شركة الشحن`, priority:"مراجعة", color:"#854F0B", bg:"#FAEEDA" });
    if (revenue > 15000) aiDecisions.push({ title:"ارفع أسعار المنتجات الأفضل مبيعاً", reason:"الطلب مرتفع — فرصة لتحسين الهامش", priority:"اقتراح", color:"#0F6E56", bg:"#E1F5EE" });
    if (aiDecisions.length === 0) aiDecisions.push({ title:"الأداء ضمن الحدود المقبولة", reason:"لا توجد إجراءات عاجلة مطلوبة", priority:"جيد", color:"#0F6E56", bg:"#E1F5EE" });

    const iStyle: React.CSSProperties = { fontFamily:"'Tajawal',sans-serif", direction:"rtl" };

    return (
      <div style={{ fontFamily:"'Tajawal',sans-serif", direction:"rtl", minHeight:"100vh", background:"var(--color-background-tertiary)", color:"var(--color-text-primary)" }}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          .exec-card{background:var(--color-background-primary);border:0.5px solid var(--color-border-tertiary);border-radius:12px;padding:14px 16px;}
          .exec-metric{background:var(--color-background-secondary);border-radius:8px;padding:14px 16px;}
        `}</style>
        <div style={{ display:"flex", minHeight:"100vh" }}>
          {sidebarJSX}
          <div style={{ flex:1, padding:"24px", overflowY:"auto", display:"flex", flexDirection:"column", gap:"16px" }}>

            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <h1 style={{ fontSize:"20px", fontWeight:"500", margin:"0 0 4px" }}>لوحة التحكم التنفيذية</h1>
                <p style={{ fontSize:"12px", color:"var(--color-text-secondary)", margin:0 }}>
                  {d ? `البيانات من ${d.from_date} إلى ${d.to_date}` : "جاري تحميل البيانات..."}
                </p>
              </div>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                {(["اليوم","الأسبوع","الشهر","الربع","السنة"] as const).map((label, idx) => (
                  <button key={idx} onClick={() => { setTimePeriod(idx); fetchKpis(["today","week","month","quarter","year"][idx]); }}
                    style={{ padding:"6px 12px", background:timePeriod===idx?"#534AB7":"var(--color-background-primary)", border:`0.5px solid ${timePeriod===idx?"#534AB7":"var(--color-border-secondary)"}`, borderRadius:"7px", color:timePeriod===idx?"#EEEDFE":"var(--color-text-secondary)", fontSize:"11px", cursor:"pointer", fontFamily:"inherit" }}>
                    {label}
                  </button>
                ))}
                <button onClick={() => fetchKpis(["today","week","month","quarter","year"][timePeriod])}
                  style={{ padding:"6px 12px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"7px", color:"var(--color-text-secondary)", fontSize:"11px", cursor:"pointer", fontFamily:"inherit" }}>
                  ↺ تحديث
                </button>
              </div>
            </div>

            {/* Status Summary */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"10px" }}>
              {[
                {label:"حرج", count:critical, bg:"#FCEBEB", color:"#A32D2D", icon:"🔴"},
                {label:"تحذير", count:warning, bg:"#FAEEDA", color:"#854F0B", icon:"🟡"},
                {label:"جيد",  count:good,    bg:"#E1F5EE", color:"#0F6E56", icon:"🟢"},
              ].map(s => (
                <div key={s.label} style={{ background:s.bg, borderRadius:"10px", padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <p style={{ fontSize:"12px", color:s.color, margin:"0 0 4px", fontWeight:"500" }}>{s.icon} {s.label}</p>
                    <p style={{ fontSize:"24px", fontWeight:"500", color:s.color, margin:0 }}>{s.count} مؤشر</p>
                  </div>
                </div>
              ))}
            </div>

            {/* KPI Cards Row 1 */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"10px" }}>
              {kpis.slice(0,5).map((k,i) => (
                <div key={i} className="exec-metric">
                  <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px" }}>{k.n}</p>
                  <p style={{ fontSize:"20px", fontWeight:"500", color:sevColor(k.sev), margin:"0 0 4px" }}>
                    {typeof k.val === "number" && k.unit === "ر.س" ? k.val.toLocaleString("ar-SA") : k.val} {k.unit}
                  </p>
                  <span style={{ fontSize:"10px", background:sevBg(k.sev), color:sevColor(k.sev), padding:"1px 7px", borderRadius:"20px" }}>{sevLabel(k.sev)}</span>
                  <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"5px 0 0" }}>{k.target}</p>
                </div>
              ))}
            </div>

            {/* KPI Cards Row 2 */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"10px" }}>
              {kpis.slice(5).map((k,i) => (
                <div key={i} className="exec-metric">
                  <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px" }}>{k.n}</p>
                  <p style={{ fontSize:"20px", fontWeight:"500", color:sevColor(k.sev), margin:"0 0 4px" }}>
                    {typeof k.val === "number" && k.unit === "ر.س" ? k.val.toLocaleString("ar-SA") : k.val} {k.unit}
                  </p>
                  <span style={{ fontSize:"10px", background:sevBg(k.sev), color:sevColor(k.sev), padding:"1px 7px", borderRadius:"20px" }}>{sevLabel(k.sev)}</span>
                  <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"5px 0 0" }}>{k.target}</p>
                </div>
              ))}
            </div>

            {/* Middle Row: Operations + Suppliers + Employees */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>

              {/* Operations */}
              <div className="exec-card">
                <p style={{ fontSize:"13px", fontWeight:"500", margin:"0 0 12px" }}>العمليات</p>
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  {[
                    { label:"معدل التوصيل في الوقت", val:`${fulfRate}%`, target:95, sev:fulfRate>=95?"good":fulfRate>=80?"warning":"critical" },
                    { label:"متوسط وقت التوصيل", val:`${shipSpeed?.avg_dn_days||"—"} يوم`, target:null, sev:"good" },
                    { label:"سرعة الشراء", val:`${procSpeed?.avg_days_to_delivery||"—"} يوم`, target:null, sev:"good" },
                  ].map((op,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", background:"var(--color-background-secondary)", borderRadius:"8px" }}>
                      <p style={{ fontSize:"12px", color:"var(--color-text-secondary)", margin:0 }}>{op.label}</p>
                      <span style={{ fontSize:"13px", fontWeight:"500", color:sevColor(op.sev) }}>{op.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Procurement */}
              <div className="exec-card">
                <p style={{ fontSize:"13px", fontWeight:"500", margin:"0 0 12px" }}>المشتريات</p>
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  <div style={{ padding:"10px 12px", background:"#E1F5EE", borderRadius:"8px" }}>
                    <p style={{ fontSize:"11px", color:"#0F6E56", margin:"0 0 3px", fontWeight:"500" }}>أفضل مورد</p>
                    <p style={{ fontSize:"13px", color:"#085041", margin:0 }}>
                      {procSpeed?.details?.[0]?.supplier || "—"}
                    </p>
                    <p style={{ fontSize:"10px", color:"#0F6E56", margin:"2px 0 0" }}>
                      {procSpeed?.details?.[0] ? `${procSpeed.details[0].days_to_delivery} يوم تسليم` : "لا بيانات"}
                    </p>
                  </div>
                  <div style={{ padding:"10px 12px", background:"var(--color-background-secondary)", borderRadius:"8px" }}>
                    <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 3px" }}>إجمالي أوامر الشراء</p>
                    <p style={{ fontSize:"18px", fontWeight:"500", color:"var(--color-text-primary)", margin:0 }}>{procSpeed?.total_pos||0}</p>
                  </div>
                  <div style={{ padding:"8px 12px", background: (d?.late_po?.count||0)>0?"#FCEBEB":"#E1F5EE", borderRadius:"8px" }}>
                    <p style={{ fontSize:"11px", color:(d?.late_po?.count||0)>0?"#A32D2D":"#0F6E56", margin:0 }}>
                      {(d?.late_po?.count||0)>0 ? `${d.late_po.count} PO متأخر` : "لا توجد PO متأخرة ✓"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Employees */}
              <div className="exec-card">
                <p style={{ fontSize:"13px", fontWeight:"500", margin:"0 0 12px" }}>أداء الموظفين</p>
                {employees.length > 0 ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                    {employees.slice(0,4).map((emp: any, i: number) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"6px 8px", background:i===0?"#E1F5EE":"var(--color-background-secondary)", borderRadius:"8px" }}>
                        <div style={{ width:28, height:28, borderRadius:"50%", background:i===0?"#5DCAA5":"var(--color-background-tertiary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontWeight:"500", color:i===0?"#04342C":"var(--color-text-secondary)", flexShrink:0 }}>
                          {(emp.employee||"").substring(0,2)}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:"11px", fontWeight:"500", color:i===0?"#085041":"var(--color-text-primary)", margin:"0 0 1px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{emp.employee||"—"}</p>
                          <p style={{ fontSize:"10px", color:i===0?"#0F6E56":"var(--color-text-tertiary)", margin:0 }}>{emp.orders||0} طلب · {emp.avg_exec_days||"—"} يوم</p>
                        </div>
                        {i===0 && <span style={{ fontSize:"9px", background:"#E1F5EE", color:"#085041", padding:"1px 5px", borderRadius:"8px", flexShrink:0 }}>الأفضل</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign:"center", padding:"20px 0", color:"var(--color-text-tertiary)" }}>
                    <p style={{ fontSize:"12px", margin:0 }}>لا توجد بيانات موظفين</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Alerts + AI Decisions + Chat */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>

              {/* Alerts */}
              <div className="exec-card">
                <p style={{ fontSize:"13px", fontWeight:"500", margin:"0 0 12px" }}>التنبيهات</p>
                <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                  {kpis.filter(k=>k.sev!=="good").length === 0 ? (
                    <div style={{ padding:"12px", background:"#E1F5EE", borderRadius:"8px", textAlign:"center" }}>
                      <p style={{ fontSize:"12px", color:"#0F6E56", margin:0 }}>لا توجد تنبيهات ✓</p>
                    </div>
                  ) : kpis.filter(k=>k.sev!=="good").map((k,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:"8px", padding:"8px 10px", background:sevBg(k.sev), borderRadius:"8px" }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:sevColor(k.sev), marginTop:4, flexShrink:0 }}></div>
                      <p style={{ fontSize:"11px", color:sevColor(k.sev), margin:0 }}>{k.n}: {typeof k.val === "number" && k.unit === "ر.س" ? k.val.toLocaleString("ar-SA") : k.val} {k.unit} — {sevLabel(k.sev)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Decisions */}
              <div className="exec-card">
                <p style={{ fontSize:"13px", fontWeight:"500", margin:"0 0 12px" }}>قرارات الذكاء الاصطناعي</p>
                <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                  {aiDecisions.map((dec,i) => (
                    <div key={i} style={{ padding:"8px 10px", background:dec.bg, borderRadius:"8px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"3px" }}>
                        <span style={{ fontSize:"12px", fontWeight:"500", color:dec.color }}>{dec.title}</span>
                        <span style={{ fontSize:"10px", background:dec.bg, color:dec.color, padding:"1px 6px", borderRadius:"8px", border:`0.5px solid ${dec.color}30` }}>{dec.priority}</span>
                      </div>
                      <p style={{ fontSize:"10px", color:dec.color, margin:0 }}>{dec.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Chat */}
              <div className="exec-card" style={{ display:"flex", flexDirection:"column" }}>
                <p style={{ fontSize:"13px", fontWeight:"500", margin:"0 0 10px" }}>مساعد التقارير</p>
                <div style={{ flex:1, overflowY:"auto", maxHeight:"200px", display:"flex", flexDirection:"column", gap:"6px", marginBottom:"10px" }}>
                  {reportChat.length === 0 ? (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"5px" }}>
                      {["ملخص الأداء","أبرز المشاكل","توصيات للأسبوع","مقارنة المبيعات"].map(q => (
                        <button key={q} onClick={() => setReportChatInput(q)}
                          style={{ padding:"5px 10px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"6px", color:"var(--color-text-secondary)", fontSize:"11px", cursor:"pointer", fontFamily:"inherit" }}>
                          {q}
                        </button>
                      ))}
                    </div>
                  ) : reportChat.map((m,i) => (
                    <div key={i} style={{ padding:"8px 10px", background:m.role==="user"?"#EEEDFE":"var(--color-background-secondary)", borderRadius:"8px", alignSelf:m.role==="user"?"flex-start":"flex-end", maxWidth:"90%" }}>
                      <p style={{ fontSize:"11px", color:m.role==="user"?"#534AB7":"var(--color-text-primary)", margin:0, lineHeight:"1.5" }}>{m.text}</p>
                    </div>
                  ))}
                  {reportChatLoading && (
                    <div style={{ padding:"8px 10px", background:"var(--color-background-secondary)", borderRadius:"8px", alignSelf:"flex-end" }}>
                      <p style={{ fontSize:"11px", color:"var(--color-text-tertiary)", margin:0 }}>...</p>
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", gap:"6px" }}>
                  <input value={reportChatInput} onChange={e=>setReportChatInput(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&sendReportChat()}
                    placeholder="اسأل عن الأداء..."
                    style={{ flex:1, padding:"7px 10px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"7px", color:"var(--color-text-primary)", fontSize:"12px", outline:"none", fontFamily:"inherit" }} />
                  <button onClick={sendReportChat} disabled={reportChatLoading||!reportChatInput.trim()}
                    style={{ padding:"7px 14px", background:reportChatLoading||!reportChatInput.trim()?"var(--color-background-secondary)":"#534AB7", border:"none", borderRadius:"7px", color:reportChatLoading||!reportChatInput.trim()?"var(--color-text-tertiary)":"#EEEDFE", fontSize:"12px", cursor:reportChatLoading||!reportChatInput.trim()?"not-allowed":"pointer", fontFamily:"inherit" }}>
                    إرسال
                  </button>
                </div>
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
    <div style={{ fontFamily:"'Tajawal',sans-serif", direction:"rtl", minHeight:"100vh", background:"#ffffff", color:"#1a1a2e" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{ display:"flex", minHeight:"100vh" }}>
        {sidebarJSX}
        <div style={{ flex:1, padding:"40px", overflowY:"auto" }}>

          <h1 style={{ fontSize:"24px", fontWeight:"800", margin:"0 0 4px" }}>مراقبة المنافسين 🔍</h1>
          <p style={{ color:"#777", fontSize:"13px", margin:"0 0 24px" }}>أدخل المنتج والموقع في كل صف — ابحث في أي موقع تريده</p>

          {/* Tabs */}
          <div style={{ display:"flex", borderBottom:"1px solid #e0e0f0", marginBottom:"20px" }}>
            {[
              { k:"manual", l:"إدخال يدوي" },
              { k:"excel",  l:"رفع Excel" },
              { k:"results", l:`النتائج${compRows.some(r=>r.status==="done")?` (${compRows.filter(r=>r.status==="done").length})`:""}` }
            ].map(t => (
              <button key={t.k} onClick={() => setCompTab(t.k as any)}
                style={{ padding:"9px 20px", background:"none", border:"none", borderBottom:compTab===t.k?"2px solid #c8b8ff":"2px solid transparent", color:compTab===t.k?"#7c3aed":"#777", fontSize:"14px", fontWeight:compTab===t.k?"700":"400", cursor:"pointer", fontFamily:"inherit", marginBottom:"-1px" }}>
                {t.l}
              </button>
            ))}
          </div>

          {/* ── MANUAL TAB ── */}
          {compTab === "manual" && (
            <div>
              {/* Table header */}
              <div style={{ display:"grid", gridTemplateColumns:"140px 1fr 180px 32px", gap:"8px", padding:"0 4px 8px", fontSize:"12px", color:"#777", fontWeight:"600" }}>
                <span>SKU</span>
                <span>اسم المنتج للبحث *</span>
                <span>الموقع (مثال: noon.com)</span>
                <span></span>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:"6px", marginBottom:"14px" }}>
                {compRows.map((row, idx) => (
                  <div key={row.id} style={{ display:"grid", gridTemplateColumns:"140px 1fr 180px 32px", gap:"8px", background:"#f5f5fb", border:"1px solid #e0e0f0", borderRadius:"10px", padding:"9px 12px", alignItems:"center" }}>
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
                      style={{ width:30, height:30, background:"none", border:"1px solid #c8c8e8", borderRadius:"6px", color:"#777", cursor:compRows.length===1?"not-allowed":"pointer", fontSize:"13px", opacity:compRows.length===1?0.3:1 }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex", gap:"8px", marginBottom:"24px", flexWrap:"wrap" }}>
                <button onClick={compAddRow} style={{ padding:"9px 16px", background:"#f5f5fb", border:"1px solid #c8c8e8", borderRadius:"10px", color:"#7c3aed", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" }}>+ صف</button>
                <button onClick={compSearchAll} disabled={compSearching || !compRows.some(r => r.query.trim())}
                  style={{ padding:"9px 22px", background:compSearching||!compRows.some(r=>r.query.trim())?"#d0d0ec":"#7c3aed", color:compSearching||!compRows.some(r=>r.query.trim())?"#666":"#ffffff", border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:"700", cursor:compSearching||!compRows.some(r=>r.query.trim())?"not-allowed":"pointer", fontFamily:"inherit" }}>
                  {compSearching?`جاري... (${compRows.filter(r=>r.status==="done").length}/${compRows.filter(r=>r.query.trim()).length})`:`ابدأ البحث ←`}
                </button>
                {compRows.some(r=>r.status==="done") && (
                  <button onClick={compExportExcel} style={{ padding:"9px 16px", background:"#f5f5fb", border:"1px solid #1e3a2e", borderRadius:"10px", color:"#80ffdb", fontSize:"13px", cursor:"pointer", fontFamily:"inherit" }}>تصدير Excel ↓</button>
                )}
              </div>

              {/* نتائج inline */}
              {compRows.filter(r=>r.status!=="idle").map(row => (
                <div key={row.id} style={{ background:"#f5f5fb", border:"1px solid #e0e0f0", borderRadius:"14px", marginBottom:"10px", overflow:"hidden" }}>
                  <div style={{ padding:"11px 16px", borderBottom:"1px solid #e0e0f0", display:"flex", alignItems:"center", gap:"10px" }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", flexShrink:0, background:row.status==="searching"?"#ffd166":row.status==="done"?"#4ade80":"#ff6b6b", animation:row.status==="searching"?"pulse 1s infinite":"none" }} />
                    <span style={{ fontSize:"14px", fontWeight:"700", color:"#7c3aed" }}>{row.query}</span>
                    {row.sku && <span style={{ fontSize:"10px", color:"#777", fontFamily:"monospace", background:"#ffffff", padding:"2px 5px", borderRadius:"3px" }}>{row.sku}</span>}
                    {(row as any).site && <span style={{ fontSize:"11px", color:"#777", direction:"ltr" }}>{(row as any).site}</span>}
                    <span style={{ marginRight:"auto", fontSize:"11px", color:"#777" }}>
                      {row.status==="searching"&&"جاري البحث..."}
                      {row.status==="done"&&`${row.results.filter(r=>r.title).length} نتيجة`}
                      {row.status==="error"&&<span style={{color:"#ff6b6b"}}>خطأ</span>}
                    </span>
                    <button onClick={()=>compSearchRow(row.id)} disabled={row.status==="searching"}
                      style={{ padding:"3px 9px", background:"none", border:"1px solid #c8c8e8", borderRadius:"5px", color:"#666", cursor:"pointer", fontSize:"11px", fontFamily:"inherit" }}>↻</button>
                    {row.status==="done" && row.results.filter(r=>r.title).length > 0 && (
                      <button onClick={()=>compAnalyzeResults(row.id)} disabled={compAnalyzing}
                        style={{ padding:"3px 10px", background:compAnalyzing?"#d0d0ec":"#1a2a1a", border:"1px solid #2a4a2a", borderRadius:"5px", color:compAnalyzing?"#777":"#4ade80", cursor:compAnalyzing?"not-allowed":"pointer", fontSize:"11px", fontFamily:"inherit" }}>
                        {compAnalyzing ? "..." : "🤖 تحليل ذكي"}
                      </button>
                    )}
                  </div>
                  {row.status==="done" && row.results.map((r,i) => {
                    const ai = (r as any).ai_analysis;
                    const recColor = ai?.price_recommendation === "increase" ? "#4ade80" : ai?.price_recommendation === "decrease" ? "#f87171" : "#666";
                    return (
                    <div key={i} style={{ borderBottom:"1px solid #141420", background:i%2?"#f0f0fa":"transparent" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"110px 1fr 120px 90px 65px", alignItems:"center", padding:"9px 16px", gap:"10px" }}>
                        <span style={{ fontSize:"11px", padding:"3px 8px", background:"#1a1a2e", color:"#7c3aed", borderRadius:"6px", textAlign:"center", fontWeight:"600", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.competitor}</span>
                        <div>
                          <div style={{ fontSize:"12px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:r.title?"#1a1a2e":"#777" }}>{r.title||r.error||"—"}</div>
                          {ai && <div style={{ fontSize:"10px", color:"#777", marginTop:"2px" }}>
                            <span style={{ color: ai.confidence >= 75 ? "#4ade80" : ai.confidence >= 60 ? "#ffd166" : "#f87171" }}>{ai.match_type}</span>
                            <span style={{ margin:"0 4px", color:"#999" }}>·</span>
                            <span>{ai.match_reason}</span>
                          </div>}
                        </div>
                        <span style={{ fontSize:"13px", fontWeight:"700", color:r.price?"#7c3aed":"#777" }}>{r.price?`${r.price.toLocaleString()} ${r.currency}`:"—"}</span>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:"4px", padding:"2px 8px", borderRadius:"20px", fontSize:"11px", background:r.available===true?"#0d1f0d":r.available===false?"#fdeaea":"#1a1a2e", color:r.available===true?"#4ade80":r.available===false?"#f87171":"#777", border:`1px solid ${r.available===true?"#d0f0d0":r.available===false?"#f8d0d0":"#d0d0ec"}` }}>
                          <span style={{ width:4, height:4, borderRadius:"50%", background:"currentColor" }} />
                          {r.available===true?"متوفر":r.available===false?"غير متوفر":"—"}
                        </span>
                        {r.link?<a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:"12px", color:"#7c6af7", textDecoration:"none" }}>فتح ↗</a>:<span style={{color:"#999",fontSize:"12px"}}>—</span>}
                      </div>
                      {ai?.price_recommendation && ai.price_recommendation !== "unknown" && (
                        <div style={{ padding:"4px 16px 8px", display:"flex", alignItems:"center", gap:"6px" }}>
                          <span style={{ fontSize:"10px", color:"#777" }}>توصية:</span>
                          <span style={{ fontSize:"11px", fontWeight:"600", color:recColor, padding:"1px 8px", background:recColor+"15", borderRadius:"20px" }}>
                            {ai.price_recommendation === "increase" ? "↑ ارفع السعر" : ai.price_recommendation === "decrease" ? "↓ راجع السعر" : "← حافظ على السعر"}
                          </span>
                          <span style={{ fontSize:"10px", color:"#777" }}>{ai.price_recommendation_reason}</span>
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
                <div onClick={()=>compExcelRef.current?.click()} style={{ border:"2px dashed #2a2a3e", borderRadius:"16px", padding:"56px", textAlign:"center", cursor:"pointer", background:"#f5f5fb" }}>
                  <input ref={compExcelRef} type="file" accept=".xlsx,.xls" onChange={compHandleExcel} style={{ display:"none" }} />
                  <div style={{ fontSize:"36px", marginBottom:"10px" }}>📊</div>
                  <div style={{ fontSize:"14px", color:"#7c3aed", marginBottom:"4px" }}>اضغط لرفع ملف Excel</div>
                  <div style={{ fontSize:"12px", color:"#777" }}>يكتشف عمود SKU والاسم تلقائياً | أول 50 منتج</div>
                </div>
              ) : (
                <div>
                  <div style={{ background:"#f5f5fb", border:"1px solid #e0e0f0", borderRadius:"12px", padding:"12px 16px", display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px", flexWrap:"wrap" }}>
                    <span style={{ fontSize:"18px" }}>📄</span>
                    <span style={{ fontSize:"13px", color:"#7c3aed" }}>{compExcelFile}</span>
                    <span style={{ fontSize:"12px", color:"#777" }}>{compRows.length} منتج</span>
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
                      <button onClick={()=>{setCompExcelFile("");setCompExcelRows([]);setCompRows([{id:"1",sku:"",query:"",status:"idle",results:[]}]);}} style={{background:"none",border:"none",color:"#777",cursor:"pointer",fontSize:"13px"}}>✕</button>
                    </div>
                  </div>
                  <div style={{ background:"#f5f5fb", border:"1px solid #e0e0f0", borderRadius:"10px", overflow:"hidden", marginBottom:"14px" }}>
                    <div style={{ padding:"9px 14px", borderBottom:"1px solid #e0e0f0", fontSize:"11px", color:"#777", fontWeight:"600" }}>معاينة</div>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
                      <thead><tr style={{background:"#ffffff"}}>
                        <th style={{padding:"7px 12px",textAlign:"right",color:"#777",borderBottom:"1px solid #e0e0f0",fontWeight:"500"}}>SKU</th>
                        <th style={{padding:"7px 12px",textAlign:"right",color:"#777",borderBottom:"1px solid #e0e0f0",fontWeight:"500"}}>اسم المنتج</th>
                      </tr></thead>
                      <tbody>
                        {compRows.slice(0,4).map((row,i)=>(<tr key={i} style={{borderBottom:"1px solid #141420"}}><td style={{padding:"7px 12px",color:"#7c3aed",fontFamily:"monospace",fontSize:"11px"}}>{row.sku||"—"}</td><td style={{padding:"7px 12px"}}>{row.query}</td></tr>))}
                        {compRows.length>4&&<tr><td colSpan={2} style={{padding:"7px 12px",color:"#777",fontStyle:"italic"}}>... و {compRows.length-4} منتج آخر</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ background:"#f5f5fb", border:"1px solid #e0e0f0", borderRadius:"10px", padding:"12px 14px", marginBottom:"14px" }}>
                    <p style={{ fontSize:"12px", color:"#666", margin:"0 0 8px", fontWeight:"600" }}>موقع البحث لكل المنتجات (اختياري)</p>
                    <input placeholder="مثال: noon.com أو homecenter.com.sa"
                      onChange={e => setCompRows(p => p.map(r => ({...r, site: e.target.value} as any)))}
                      style={{ ...inputStyle, direction:"ltr", textAlign:"left", fontSize:"13px" }} />
                    <p style={{ fontSize:"11px", color:"#777", margin:"6px 0 0" }}>اتركه فارغاً للبحث في Homecenter وNoon تلقائياً</p>
                  </div>
                  <div style={{ display:"flex", gap:"8px" }}>
                    <button onClick={compSearchAll} disabled={compSearching}
                      style={{ padding:"11px 26px", background:compSearching?"#d0d0ec":"#7c3aed", color:compSearching?"#666":"#ffffff", border:"none", borderRadius:"10px", fontSize:"14px", fontWeight:"700", cursor:compSearching?"not-allowed":"pointer", fontFamily:"inherit" }}>
                      {compSearching?`جاري... (${compRows.filter(r=>r.status==="done").length}/${compRows.length})`:`ابدأ البحث في ${compRows.length} منتج ←`}
                    </button>
                    {compRows.some(r=>r.status==="done")&&(<button onClick={()=>setCompTab("results")} style={{padding:"11px 18px",background:"#f5f5fb",border:"1px solid #2a2a4e",borderRadius:"10px",color:"#7c3aed",fontSize:"13px",cursor:"pointer",fontFamily:"inherit"}}>النتائج →</button>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RESULTS TAB ── */}
          {compTab === "results" && (
            <div>
              {!compRows.some(r=>r.status==="done") ? (
                <div style={{ background:"#f5f5fb", border:"1px dashed #2a2a3e", borderRadius:"14px", padding:"56px", textAlign:"center" }}>
                  <div style={{fontSize:"32px",marginBottom:"10px"}}>📋</div>
                  <p style={{color:"#777",fontSize:"13px"}}>لا توجد نتائج — ابدأ بحثاً أولاً</p>
                </div>
              ) : (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px", flexWrap:"wrap" }}>
                    <span style={{fontSize:"13px",color:"#666"}}>{compRows.filter(r=>r.status==="done").length} منتج</span>
                    <span style={{padding:"3px 10px",background:"#0d1f0d",color:"#4ade80",borderRadius:"20px",fontSize:"11px",border:"1px solid #1a3a1a"}}>{compRows.filter(r=>r.results.some(x=>x.available===true)).length} متوفر</span>
                    <span style={{padding:"3px 10px",background:"#fdeaea",color:"#f87171",borderRadius:"20px",fontSize:"11px",border:"1px solid #3a1a1a"}}>{compRows.filter(r=>r.status==="done"&&r.results.every(x=>!x.title)).length} غير موجود</span>
                    <button onClick={compExportExcel} style={{marginRight:"auto",padding:"7px 14px",background:"#1a1a2e",border:"1px solid #1e3a2e",borderRadius:"8px",color:"#80ffdb",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>تصدير Excel ↓</button>
                  </div>
                  <div style={{ background:"#f5f5fb", border:"1px solid #e0e0f0", borderRadius:"14px", overflow:"hidden" }}>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px",minWidth:"700px"}}>
                        <thead><tr style={{background:"#ffffff"}}>
                          {["SKU","المنتج","الموقع","الاسم عندهم","السعر","التوفر","رابط"].map(h=>(<th key={h} style={{padding:"9px 12px",textAlign:"right",color:"#777",fontWeight:"500",borderBottom:"1px solid #e0e0f0"}}>{h}</th>))}
                        </tr></thead>
                        <tbody>
                          {compRows.filter(r=>r.status==="done").flatMap(row=>
                            row.results.length===0
                              ?[<tr key={row.id+"-e"} style={{borderBottom:"1px solid #141420"}}><td style={{padding:"9px 12px",color:"#7c3aed",fontFamily:"monospace",fontSize:"11px"}}>{row.sku||"—"}</td><td style={{padding:"9px 12px",maxWidth:"150px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.query}</td><td colSpan={5} style={{padding:"9px 12px",color:"#777",fontSize:"12px"}}>لا نتائج</td></tr>]
                              :row.results.map((r,i)=>(
                                <tr key={row.id+"-"+i} style={{borderBottom:"1px solid #141420",background:i%2?"#f0f0fa":"transparent"}}>
                                  <td style={{padding:"9px 12px",color:"#7c3aed",fontFamily:"monospace",fontSize:"11px"}}>{row.sku||"—"}</td>
                                  <td style={{padding:"9px 12px",maxWidth:"140px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.query}</td>
                                  <td style={{padding:"9px 12px"}}><span style={{fontSize:"11px",padding:"2px 8px",background:"#1a1a2e",color:"#7c3aed",borderRadius:"6px",fontWeight:"600"}}>{r.competitor}</span></td>
                                  <td style={{padding:"9px 12px",maxWidth:"180px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title||"—"}</td>
                                  <td style={{padding:"9px 12px",color:"#7c3aed",fontWeight:"600"}}>{r.price?`${r.price.toLocaleString()} ${r.currency}`:"—"}</td>
                                  <td style={{padding:"9px 12px"}}><span style={{display:"inline-flex",alignItems:"center",gap:"4px",padding:"2px 8px",borderRadius:"20px",fontSize:"11px",background:r.available===true?"#0d1f0d":r.available===false?"#fdeaea":"#1a1a2e",color:r.available===true?"#4ade80":r.available===false?"#f87171":"#777"}}><span style={{width:4,height:4,borderRadius:"50%",background:"currentColor"}}/>{r.available===true?"متوفر":r.available===false?"غير متوفر":"—"}</span></td>
                                  <td style={{padding:"9px 12px"}}>{r.link?<a href={r.link} target="_blank" rel="noopener noreferrer" style={{color:"#7c6af7",fontSize:"12px",textDecoration:"none"}}>فتح ↗</a>:<span style={{color:"#999"}}>—</span>}</td>
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
      "كنبة / أريكة","طاولة","إضاءة","كرسي","سرير",
      "طاولة جانبية","طاولة قهوة","طاولة طعام",
      "خزانة / وحدة TV","أثاث خارجي","ديكور","أخرى"
    ];
    return (
      <ContentStudioView
        sidebarJSX={sidebarJSX}
        ENV_STYLES={ENV_STYLES}
        CATEGORIES={CATEGORIES}
        API_URL={API_URL}
      />
    );
  }

  if (view === "library") {
    return <PromptLibraryView sidebarJSX={sidebarJSX} />;
  }

  if (view === "dashboard") return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#ffffff", color: "#1a1a2e" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {sidebarJSX}
        <div style={{ flex: 1, padding: "40px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 6px" }}>أهلاً، {user?.company} 👋</h1>
          <p style={{ color: "#777", marginTop: "6px", fontSize: "14px", marginBottom: "32px" }}>هذه نظرة عامة على نشاطك</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
            {[{ label: "العمليات النشطة", value: "0", color: "#7c3aed" }, { label: "التكاملات", value: "0", color: "#80ffdb" }, { label: "المهام المكتملة", value: "0", color: "#ffd166" }, { label: "التوفير في الوقت", value: "0h", color: "#ff6b6b" }].map(stat => (
              <div key={stat.label} style={{ background: "#f5f5fb", border: "1px solid #e0e0f0", borderRadius: "16px", padding: "24px" }}>
                <div style={{ fontSize: "28px", fontWeight: "900", color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: "12px", color: "#777", marginTop: "6px" }}>{stat.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "linear-gradient(135deg, #1a1a2e, #16213e)", border: "1px solid #2a2a4e", borderRadius: "20px", padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🚀</div>
            <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#7c3aed", margin: "0 0 12px" }}>مرحباً بك في وصال</h2>
            <p style={{ color: "#666", fontSize: "14px", lineHeight: "1.8", maxWidth: "400px", margin: "0 auto 24px" }}>منصتك لأتمتة عمليات التجارة الإلكترونية.</p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={() => setView("competitors")} style={{ background: "#7c3aed", color: "#ffffff", border: "none", borderRadius: "12px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>مراقبة المنافسين 🔍</button>
              <button onClick={() => setView("inventory")} style={{ background: "#1a1a2e", color: "#7c3aed", border: "1px solid #2a2a4e", borderRadius: "12px", padding: "12px 24px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>مراقبة المخزون 📦</button>
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
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", minHeight: "100vh", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <div style={{ width: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "36px", fontWeight: "900", color: "#7c3aed" }}>وصال</div>
          <p style={{ color: "#777", marginTop: "8px", fontSize: "14px" }}>{view === "login" ? "سجل دخولك للمتابعة" : "أنشئ حساباً جديداً"}</p>
        </div>
        <div style={{ background: "#f5f5fb", border: "1px solid #e0e0f0", borderRadius: "20px", padding: "32px" }}>
          {view === "register" && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "13px", color: "#666", display: "block", marginBottom: "8px" }}>اسم الشركة</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="شركتي للتجارة"
                style={{ width: "100%", padding: "12px 16px", background: "#ffffff", border: "1px solid #e0e0f0", borderRadius: "10px", color: "#1a1a2e", fontSize: "14px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
          )}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "13px", color: "#666", display: "block", marginBottom: "8px" }}>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@company.com"
              style={{ width: "100%", padding: "12px 16px", background: "#ffffff", border: "1px solid #e0e0f0", borderRadius: "10px", color: "#1a1a2e", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: "24px" }}>
            <label style={{ fontSize: "13px", color: "#666", display: "block", marginBottom: "8px" }}>كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              style={{ width: "100%", padding: "12px 16px", background: "#ffffff", border: "1px solid #e0e0f0", borderRadius: "10px", color: "#1a1a2e", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
          </div>
          {authError && <div style={{ color: "#ff6b6b", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>{authError}</div>}
          <button onClick={view === "login" ? handleLogin : handleRegister} disabled={authLoading}
            style={{ width: "100%", padding: "14px", background: "#7c3aed", color: "#ffffff", border: "none", borderRadius: "12px", fontSize: "16px", fontWeight: "700", cursor: authLoading ? "not-allowed" : "pointer", opacity: authLoading ? 0.7 : 1 }}>
            {authLoading ? "جاري التحميل..." : view === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
          </button>
          <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#777" }}>
            {view === "login"
              ? <span>ليس لديك حساب؟ <span style={{ color: "#7c3aed", cursor: "pointer" }} onClick={() => setView("register")}>سجل الآن</span></span>
              : <span>لديك حساب؟ <span style={{ color: "#7c3aed", cursor: "pointer" }} onClick={() => setView("login")}>سجل دخولك</span></span>}
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <span style={{ color: "#777", fontSize: "13px", cursor: "pointer" }} onClick={() => setView("landing")}>← العودة للرئيسية</span>
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════
  // LANDING PAGE
  // ══════════════════════════════════════
  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", background: "#ffffff", color: "#1a1a2e", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 60px", borderBottom: "1px solid #e0e0f0" }}>
        <div style={{ fontSize: "26px", fontWeight: "900", color: "#7c3aed" }}>وصال</div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={() => setView("login")} style={{ padding: "10px 24px", background: "transparent", border: "1px solid #2a2a4e", borderRadius: "10px", color: "#666", fontSize: "14px", cursor: "pointer" }}>دخول</button>
          <button onClick={() => setView("register")} style={{ padding: "10px 24px", background: "#7c3aed", border: "none", borderRadius: "10px", color: "#ffffff", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>ابدأ مجاناً</button>
        </div>
      </nav>
      <div style={{ textAlign: "center", padding: "100px 60px 80px" }}>
        <h1 style={{ fontSize: "64px", fontWeight: "900", lineHeight: "1.1", margin: "0 0 24px", letterSpacing: "-2px" }}>أتمتة عمليات<br /><span style={{ color: "#7c3aed" }}>تجارتك الإلكترونية</span></h1>
        <p style={{ fontSize: "18px", color: "#777", maxWidth: "500px", margin: "0 auto 40px", lineHeight: "1.8" }}>وصال يربط متاجرك، يدير طلباتك، ويشغّل AI agent يتصفح ويشتري بشكل تلقائي</p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button onClick={() => setView("register")} style={{ padding: "16px 36px", background: "#7c3aed", border: "none", borderRadius: "14px", color: "#ffffff", fontSize: "16px", fontWeight: "800", cursor: "pointer" }}>ابدأ مجاناً</button>
          <button onClick={() => setView("login")} style={{ padding: "16px 36px", background: "transparent", border: "1px solid #2a2a4e", borderRadius: "14px", color: "#666", fontSize: "16px", cursor: "pointer" }}>تسجيل الدخول</button>
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "24px", borderTop: "1px solid #e0e0f0", color: "#999", fontSize: "12px" }}>© 2025 وصال — جميع الحقوق محفوظة</div>
    </div>
  );
}


// ══════════════════════════════════════
// ContentStudioView Component
// ══════════════════════════════════════════════════════════════
// PROMPT LIBRARY — مكتبة الأوامر
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// PROMPT LIBRARY DATA
// ══════════════════════════════════════════════════════════════
const INITIAL_PROMPT_LIBRARY = [
  { id:"sofa_white", category:"كنبة / أريكة", type:"white", typeLabel:"خلفية بيضاء", name:"Sofa — White Studio", tags:"studio,white,catalog", prompt:"Professional product photography of a sofa. Pure white seamless background, soft even studio lighting from multiple angles, no harsh shadows, centered composition, front 3/4 view, commercial catalog quality, 8K resolution. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"sofa_env",   category:"كنبة / أريكة", type:"env",   typeLabel:"بيئة واقعية",  name:"Sofa — Luxury Living Room", tags:"luxury,living,realistic", prompt:"Luxury modern living room, sofa placed naturally on a light oak wood floor, soft natural light from large windows, minimal Scandinavian decor, warm neutral tones, no clutter, realistic interior photography, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"sofa_dim",   category:"كنبة / أريكة", type:"dim",   typeLabel:"مقاسات",        name:"Sofa — Dimensions", tags:"dimensions,annotations,arabic", prompt:"Product on pure white background with professional dimension annotations, clean arrows indicating width, depth, height in centimeters, Arabic labels, minimal design, technical drawing style. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"table_white",category:"طاولة",         type:"white", typeLabel:"خلفية بيضاء", name:"Table — White Studio", tags:"studio,white,catalog", prompt:"Professional product photography of a table. Pure white seamless background, top-front 3/4 view showing table surface and legs clearly, soft studio lighting, no shadows on background, e-commerce catalog style, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"table_env",  category:"طاولة",         type:"env",   typeLabel:"بيئة واقعية",  name:"Table — Modern Dining Room", tags:"dining,modern,realistic", prompt:"Modern dining room or living space, table placed on marble or light wood floor, elegant minimal decor, soft warm lighting from ceiling and windows, no clutter around table, photorealistic interior, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"table_dim",  category:"طاولة",         type:"dim",   typeLabel:"مقاسات",        name:"Table — Dimensions", tags:"dimensions,annotations", prompt:"Table on pure white background, dimension arrows showing table width, depth, height and leg height in centimeters, Arabic dimension labels, clean technical annotation style. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"lamp_white", category:"إضاءة",         type:"white", typeLabel:"خلفية بيضاء", name:"Lamp — White Studio", tags:"lamp,studio,white", prompt:"Professional product photography of a lamp or lighting fixture. Pure white seamless background, lamp shown illuminated with warm glow, soft studio lighting, all design details visible, e-commerce quality, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"lamp_env",   category:"إضاءة",         type:"env",   typeLabel:"بيئة واقعية",  name:"Lamp — Cozy Bedroom", tags:"bedroom,cozy,ambient", prompt:"Luxury bedroom or living room corner, lamp placed on side table or floor, warm ambient lighting creating cozy atmosphere, minimal elegant decor, realistic interior photography, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"lamp_dim",   category:"إضاءة",         type:"dim",   typeLabel:"مقاسات",        name:"Lamp — Dimensions", tags:"dimensions,height,diameter", prompt:"Lamp on white background, arrows showing total height, shade diameter, base diameter in centimeters, Arabic labels, clean technical style. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"chair_white",category:"كرسي",          type:"white", typeLabel:"خلفية بيضاء", name:"Chair — White Studio", tags:"chair,studio,catalog", prompt:"Professional product photography of a chair. Pure white seamless background, front 3/4 view showing seat, back and legs, soft even studio lighting, no shadows, commercial quality, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"chair_env",  category:"كرسي",          type:"env",   typeLabel:"بيئة واقعية",  name:"Chair — Modern Interior", tags:"modern,interior,office", prompt:"Elegant modern living room or office, chair placed naturally on light floor, soft window lighting, minimal decor, no clutter, photorealistic, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"chair_dim",  category:"كرسي",          type:"dim",   typeLabel:"مقاسات",        name:"Chair — Dimensions", tags:"dimensions,seat,height", prompt:"Chair on pure white background, arrows showing seat height, total height, width and depth in centimeters, Arabic labels, clean technical annotation. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"bed_white",  category:"سرير",          type:"white", typeLabel:"خلفية بيضاء", name:"Bed — White Studio", tags:"bed,studio,white", prompt:"Professional product photography of a bed frame. Pure white seamless background, front 3/4 view showing headboard and frame clearly, soft studio lighting, clean commercial presentation, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"bed_env",    category:"سرير",          type:"env",   typeLabel:"بيئة واقعية",  name:"Bed — Luxury Bedroom", tags:"bedroom,luxury,styled", prompt:"Luxury master bedroom, bed styled with premium neutral bedding, soft natural morning light, minimal elegant nightstands, warm tones, no clutter, photorealistic, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"bed_dim",    category:"سرير",          type:"dim",   typeLabel:"مقاسات",        name:"Bed — Dimensions", tags:"dimensions,length,width", prompt:"Bed on pure white background, arrows showing total length, width, headboard height and bed height in centimeters, Arabic labels, technical annotation style. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
];

const TAB_TO_TYPE: Record<string,string> = { white:"white", env:"env", dim:"dim" };

const CAT_COLORS: Record<string,{bg:string,text:string}> = {
  "كنبة / أريكة": {bg:"#EEEDFE", text:"#534AB7"},
  "طاولة":        {bg:"#FAEEDA", text:"#854F0B"},
  "إضاءة":        {bg:"#FAECE7", text:"#993C1D"},
  "كرسي":         {bg:"#EAF3DE", text:"#3B6D11"},
  "سرير":         {bg:"#E6F1FB", text:"#185FA5"},
  "خزانة":        {bg:"#FBEAF0", text:"#993556"},
  "ديكور":        {bg:"#F1EFE8", text:"#5F5E5A"},
  "أخرى":         {bg:"#F1EFE8", text:"#5F5E5A"},
};
const TYPE_COLORS: Record<string,{bg:string,text:string}> = {
  white: {bg:"#E6F1FB", text:"#185FA5"},
  env:   {bg:"#E1F5EE", text:"#0F6E56"},
  dim:   {bg:"#FAEEDA", text:"#854F0B"},
};
const TYPE_LABELS: Record<string,string> = { white:"خلفية بيضاء", env:"بيئة واقعية", dim:"مقاسات" };

const ALL_CATEGORIES = ["كنبة / أريكة","طاولة","إضاءة","كرسي","سرير","خزانة","ديكور","أخرى"];

// ══════════════════════════════════════════════════════════════
// PROMPT LIBRARY VIEW — جدول + modal إضافة/تعديل
// ══════════════════════════════════════════════════════════════
function PromptLibraryView({ sidebarJSX }: any) {
  const loadLib = () => { try { const s = localStorage.getItem("wesal_prompt_library"); return s ? JSON.parse(s) : INITIAL_PROMPT_LIBRARY; } catch { return INITIAL_PROMPT_LIBRARY; } };
  const [library, setLibrary]     = useState<any[]>(loadLib);
  const [filterCat, setFilterCat] = useState("الكل");
  const [filterType, setFilterType] = useState("الكل");
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);
  const [modal, setModal]         = useState<"add"|"edit"|null>(null);
  const [editItem, setEditItem]   = useState<any>(null);
  const [charCount, setCharCount] = useState(0);
  const PER_PAGE = 10;

  const saveLib = (items: any[]) => { setLibrary(items); try { localStorage.setItem("wesal_prompt_library", JSON.stringify(items)); } catch {} };

  const filtered = library.filter(p => {
    const matchCat  = filterCat === "الكل" || p.category === filterCat;
    const matchType = filterType === "الكل" || p.type === filterType;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.prompt.toLowerCase().includes(search.toLowerCase()) || (p.tags||"").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchType && matchSearch;
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const openAdd = () => {
    setEditItem({ id:"", name:"", category:"كنبة / أريكة", type:"white", typeLabel:"خلفية بيضاء", tags:"", prompt:"" });
    setCharCount(0);
    setModal("add");
  };
  const openEdit = (p: any) => { setEditItem({...p}); setCharCount(p.prompt.length); setModal("edit"); };

  const saveItem = () => {
    if (!editItem.name.trim() || !editItem.prompt.trim()) return alert("الاسم والـ Prompt مطلوبان");
    if (modal === "add") {
      saveLib([...library, { ...editItem, id:`custom_${Date.now()}`, typeLabel: TYPE_LABELS[editItem.type]||editItem.type }]);
    } else {
      saveLib(library.map(p => p.id === editItem.id ? { ...editItem, typeLabel: TYPE_LABELS[editItem.type]||editItem.type } : p));
    }
    setModal(null);
  };

  const deleteItem = (id: string) => { if (confirm("حذف هذا الـ Prompt؟")) saveLib(library.filter(p => p.id !== id)); setModal(null); };

  const iStyle: React.CSSProperties = { width:"100%", padding:"8px 10px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"8px", color:"var(--color-text-primary)", fontSize:"12px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as any };

  return (
    <div style={{ fontFamily:"'Tajawal',sans-serif", direction:"rtl", minHeight:"100vh", background:"var(--color-background-tertiary)", color:"var(--color-text-primary)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <div style={{ display:"flex", minHeight:"100vh" }}>
        {sidebarJSX}
        <div style={{ flex:1, padding:"24px", overflowY:"auto" }}>

          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
            <div>
              <h1 style={{ fontSize:"20px", fontWeight:"700", margin:"0 0 3px" }}>📚 مكتبة الأوامر</h1>
              <p style={{ fontSize:"12px", color:"var(--color-text-tertiary)", margin:0 }}>Prompts جاهزة لتوليد صور المنتجات — {library.length} prompt</p>
            </div>
            <button onClick={openAdd} style={{ padding:"9px 18px", background:"#534AB7", color:"#EEEDFE", border:"none", borderRadius:"8px", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" }}>+ إضافة Prompt</button>
          </div>

          {/* Filters */}
          <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"10px", padding:"12px 16px", marginBottom:"16px", display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="🔍 بحث بالاسم أو الـ Prompt أو الوسوم..." style={{ ...iStyle, width:"220px" }} />
            <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }} style={{ ...iStyle, width:"150px" }}>
              <option value="الكل">كل الفئات</option>
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display:"flex", gap:"5px" }}>
              {(["الكل","white","env","dim"] as string[]).map(t => (
                <button key={t} onClick={() => { setFilterType(t); setPage(1); }}
                  style={{ padding:"6px 12px", background:filterType===t?"#534AB7":"var(--color-background-secondary)", border:`0.5px solid ${filterType===t?"#534AB7":"var(--color-border-secondary)"}`, borderRadius:"7px", color:filterType===t?"#EEEDFE":"var(--color-text-secondary)", fontSize:"11px", cursor:"pointer", fontFamily:"inherit" }}>
                  {t === "الكل" ? "الكل" : TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <span style={{ fontSize:"11px", color:"var(--color-text-tertiary)", marginRight:"auto" }}>{filtered.length} نتيجة</span>
          </div>

          {/* Table */}
          <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"10px", overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
              <thead>
                <tr style={{ background:"var(--color-background-secondary)" }}>
                  {["الاسم","الفئة","النوع","الـ Prompt","الوسوم","إجراء"].map((h,i) => (
                    <th key={i} style={{ padding:"10px 14px", textAlign:i===3?"left":"right", fontWeight:"500", color:"var(--color-text-secondary)", borderBottom:"0.5px solid var(--color-border-tertiary)", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < paged.length-1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: i%2===0 ? "var(--color-background-primary)" : "var(--color-background-secondary)" }}>
                    <td style={{ padding:"10px 14px", fontWeight:"500", color:"var(--color-text-primary)", whiteSpace:"nowrap", maxWidth:"180px", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</td>
                    <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                      <span style={{ fontSize:"10px", background:(CAT_COLORS[p.category]||CAT_COLORS["أخرى"]).bg, color:(CAT_COLORS[p.category]||CAT_COLORS["أخرى"]).text, padding:"2px 8px", borderRadius:"20px" }}>{p.category}</span>
                    </td>
                    <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                      <span style={{ fontSize:"10px", background:(TYPE_COLORS[p.type]||{bg:"#f4f4fb",text:"#7070b0"}).bg, color:(TYPE_COLORS[p.type]||{bg:"#f4f4fb",text:"#7070b0"}).text, padding:"2px 8px", borderRadius:"20px" }}>{p.typeLabel}</span>
                    </td>
                    <td style={{ padding:"10px 14px", color:"var(--color-text-secondary)", direction:"ltr", maxWidth:"260px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.prompt}</td>
                    <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                      {p.tags && <span style={{ fontSize:"10px", color:"var(--color-text-tertiary)" }}>{(p.tags||"").split(",").slice(0,2).join(", ")}</span>}
                    </td>
                    <td style={{ padding:"10px 14px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:"5px" }}>
                        <button onClick={() => openEdit(p)} style={{ fontSize:"10px", padding:"3px 8px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"5px", cursor:"pointer", color:"var(--color-text-secondary)", fontFamily:"inherit" }}>تعديل</button>
                        <button onClick={() => deleteItem(p.id)} style={{ fontSize:"10px", padding:"3px 8px", background:"#FCEBEB", border:"0.5px solid #F7C1C1", borderRadius:"5px", cursor:"pointer", color:"#A32D2D", fontFamily:"inherit" }}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {paged.length === 0 && (
              <div style={{ textAlign:"center", padding:"48px 0", color:"var(--color-text-tertiary)" }}>
                <div style={{ fontSize:"32px", marginBottom:"8px" }}>📭</div>
                <p style={{ fontSize:"13px", margin:0 }}>لا توجد نتائج</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding:"10px 16px", borderTop:"0.5px solid var(--color-border-tertiary)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:"11px", color:"var(--color-text-tertiary)" }}>عرض {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} من {filtered.length}</span>
                <div style={{ display:"flex", gap:"5px" }}>
                  <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                    style={{ padding:"5px 12px", fontSize:"11px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"6px", cursor:page===1?"not-allowed":"pointer", color:"var(--color-text-secondary)", fontFamily:"inherit", opacity:page===1?0.5:1 }}>
                    السابق
                  </button>
                  {Array.from({length:Math.min(5,totalPages)},(_,i) => {
                    const p = totalPages <= 5 ? i+1 : page <= 3 ? i+1 : page >= totalPages-2 ? totalPages-4+i : page-2+i;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        style={{ padding:"5px 10px", fontSize:"11px", background:page===p?"#534AB7":"var(--color-background-secondary)", border:`0.5px solid ${page===p?"#534AB7":"var(--color-border-secondary)"}`, borderRadius:"6px", cursor:"pointer", color:page===p?"#EEEDFE":"var(--color-text-secondary)", fontFamily:"inherit" }}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                    style={{ padding:"5px 12px", fontSize:"11px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"6px", cursor:page===totalPages?"not-allowed":"pointer", color:"var(--color-text-secondary)", fontFamily:"inherit", opacity:page===totalPages?0.5:1 }}>
                    التالي
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modal && editItem && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:"var(--color-background-primary)", borderRadius:"12px", border:"0.5px solid var(--color-border-tertiary)", width:"540px", maxHeight:"90vh", overflowY:"auto", display:"flex", flexDirection:"column" }}>

            {/* Modal Header */}
            <div style={{ padding:"16px 20px", borderBottom:"0.5px solid var(--color-border-tertiary)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <p style={{ fontSize:"14px", fontWeight:"600", color:"var(--color-text-primary)", margin:"0 0 2px" }}>{modal==="add" ? "إضافة Prompt جديد" : "تعديل Prompt"}</p>
                <p style={{ fontSize:"11px", color:"var(--color-text-tertiary)", margin:0 }}>{modal==="edit" ? editItem.name : "أضف prompt لمكتبة الأوامر"}</p>
              </div>
              <button onClick={() => setModal(null)} style={{ width:28, height:28, background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"50%", cursor:"pointer", color:"var(--color-text-secondary)", fontSize:"13px", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit" }}>✕</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding:"18px 20px", display:"flex", flexDirection:"column", gap:"14px", flex:1 }}>

              {/* Name */}
              <div>
                <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px", fontWeight:"500" }}>اسم الـ Prompt <span style={{ color:"#E24B4A" }}>*</span></p>
                <input value={editItem.name} onChange={e => setEditItem({...editItem, name:e.target.value})} placeholder="مثال: Sofa — White Studio Premium" style={iStyle} />
              </div>

              {/* Category + Type */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div>
                  <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px", fontWeight:"500" }}>الفئة <span style={{ color:"#E24B4A" }}>*</span></p>
                  <select value={editItem.category} onChange={e => setEditItem({...editItem, category:e.target.value})} style={iStyle}>
                    {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px", fontWeight:"500" }}>نوع المخرج <span style={{ color:"#E24B4A" }}>*</span></p>
                  <select value={editItem.type} onChange={e => setEditItem({...editItem, type:e.target.value, typeLabel:TYPE_LABELS[e.target.value]||e.target.value})} style={iStyle}>
                    {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              {/* Badge Preview */}
              <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                <span style={{ fontSize:"10px", color:"var(--color-text-tertiary)" }}>معاينة:</span>
                <span style={{ fontSize:"10px", background:(CAT_COLORS[editItem.category]||CAT_COLORS["أخرى"]).bg, color:(CAT_COLORS[editItem.category]||CAT_COLORS["أخرى"]).text, padding:"2px 10px", borderRadius:"20px" }}>{editItem.category}</span>
                <span style={{ fontSize:"10px", background:(TYPE_COLORS[editItem.type]||{bg:"#f4f4fb",text:"#7070b0"}).bg, color:(TYPE_COLORS[editItem.type]||{bg:"#f4f4fb",text:"#7070b0"}).text, padding:"2px 10px", borderRadius:"20px" }}>{TYPE_LABELS[editItem.type]||editItem.type}</span>
              </div>

              {/* Prompt */}
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"5px" }}>
                  <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:0, fontWeight:"500" }}>نص الـ Prompt <span style={{ color:"#E24B4A" }}>*</span></p>
                  <span style={{ fontSize:"10px", color:charCount > 1800 ? "#E24B4A" : "var(--color-text-tertiary)" }}>{charCount} / 2000</span>
                </div>
                <textarea
                  value={editItem.prompt}
                  onChange={e => { setEditItem({...editItem, prompt:e.target.value}); setCharCount(e.target.value.length); }}
                  maxLength={2000}
                  rows={6}
                  style={{ ...iStyle, resize:"vertical", direction:"ltr", textAlign:"left", lineHeight:"1.6", fontSize:"11px" }}
                  placeholder="Professional product photography of..."
                />
                <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"4px 0 0" }}>تلميح: أضف دائماً — Keep the product exactly the same shape, color, material, structure.</p>
              </div>

              {/* Tags */}
              <div>
                <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px", fontWeight:"500" }}>وسوم (اختياري)</p>
                <input value={editItem.tags||""} onChange={e => setEditItem({...editItem, tags:e.target.value})} placeholder="premium, 8K, luxury, arabic..." style={iStyle} />
                <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"4px 0 0" }}>افصل بين الوسوم بفاصلة — تُستخدم في البحث</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding:"14px 20px", borderTop:"0.5px solid var(--color-border-tertiary)", display:"flex", justifyContent:modal==="edit"?"space-between":"flex-end", alignItems:"center" }}>
              {modal === "edit" && (
                <button onClick={() => deleteItem(editItem.id)} style={{ padding:"8px 14px", background:"#FCEBEB", border:"0.5px solid #F7C1C1", borderRadius:"8px", color:"#A32D2D", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" }}>حذف</button>
              )}
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={() => setModal(null)} style={{ padding:"8px 18px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"8px", color:"var(--color-text-secondary)", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" }}>إلغاء</button>
                <button onClick={saveItem} style={{ padding:"8px 18px", background:"#534AB7", color:"#EEEDFE", border:"none", borderRadius:"8px", fontSize:"12px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" }}>
                  {modal === "add" ? "حفظ الـ Prompt" : "حفظ التعديلات"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CONTENT STUDIO VIEW — Dropdown + Output Grid + History
// ══════════════════════════════════════════════════════════════
function ContentStudioView({ sidebarJSX, ENV_STYLES, CATEGORIES, API_URL }: any) {
  const loadLib = () => { try { const s = localStorage.getItem("wesal_prompt_library"); return s ? JSON.parse(s) : INITIAL_PROMPT_LIBRARY; } catch { return INITIAL_PROMPT_LIBRARY; } };

  const [imagePreview, setImagePreview] = useState<string|null>(null);
  const [imageBase64, setImageBase64]   = useState<string|null>(null);
  const [imageUrl, setImageUrl]         = useState("");
  const [category, setCategory]         = useState("كنبة / أريكة");
  const [activeType, setActiveType]     = useState("white");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [genLoading, setGenLoading]     = useState(false);
  const [genImages, setGenImages]       = useState<Record<string,string>>({});
  const [history, setHistory]           = useState<any[]>([]);
  const [historyModal, setHistoryModal] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Prompts للفئة + النوع المحدد
  const getPromptsForSelection = () => {
    const lib = loadLib();
    return lib.filter((p: any) => p.category === category && p.type === activeType);
  };

  const promptsForSelection = getPromptsForSelection();

  // تحديد أول prompt تلقائياً عند تغيير الفئة أو النوع
  const prevCatType = useRef({ category, activeType });
  if (prevCatType.current.category !== category || prevCatType.current.activeType !== activeType) {
    prevCatType.current = { category, activeType };
    const newPrompts = loadLib().filter((p: any) => p.category === category && p.type === activeType);
    if (newPrompts.length > 0) setSelectedPromptId(newPrompts[0].id);
    else setSelectedPromptId("");
  }

  const selectedPrompt = loadLib().find((p: any) => p.id === selectedPromptId);

  // ضغط الصورة لـ 2MB
  const compressImage = (file: File): Promise<string> => new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxDim = 1920;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) { if (w > h) { h = Math.round(h*maxDim/w); w = maxDim; } else { w = Math.round(w*maxDim/h); h = maxDim; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const compress = (q: number) => {
        const d = canvas.toDataURL("image/jpeg", q);
        if (Math.round((d.length-22)*3/4) > 2*1024*1024 && q > 0.3) compress(Math.max(q-0.08, 0.3));
        else resolve(d.split(",")[1]);
      };
      compress(0.92);
    };
    img.src = url;
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setImageBase64(await compressImage(file));
  };

  const generateImage = async () => {
    if (!selectedPrompt) return alert("اختر Prompt من القائمة");
    if (!imageBase64 && !imageUrl) return alert("ارفع صورة المنتج أولاً");
    setGenLoading(true);
    const removeText = "Remove any text, watermarks, logos, stickers or written characters from the original product image. ";
    const custom = customPrompt.trim() ? ` ${customPrompt.trim()}` : "";
    const fullPrompt = `${removeText}${selectedPrompt.prompt}${custom}`;
    try {
      const res = await fetch(`${API_URL}/content-studio/generate-image`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ prompt:fullPrompt, image_base64:imageBase64||"", image_url:imageUrl, mode:activeType, width:1024, height:1024 })
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail||"خطأ"); }
      const data = await res.json();
      const key = `${selectedPromptId}_${Date.now()}`;
      setGenImages(p => ({ ...p, [activeType]: data.image_url }));
      setHistory(h => [{ id:key, promptName:selectedPrompt.name, category, type:activeType, typeLabel:TYPE_LABELS[activeType], imageUrl:data.image_url, time:new Date().toLocaleTimeString("ar") }, ...h.slice(0,19)]);
    } catch(e: any) { alert("خطأ: "+e.message); }
    setGenLoading(false);
  };

  const iStyle: React.CSSProperties = { width:"100%", padding:"8px 10px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"8px", color:"var(--color-text-primary)", fontSize:"12px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as any };
  const types = [{k:"white",l:"خلفية بيضاء"},{k:"env",l:"بيئة واقعية"},{k:"dim",l:"مقاسات"}];

  return (
    <div style={{ fontFamily:"'Tajawal',sans-serif", direction:"rtl", minHeight:"100vh", background:"var(--color-background-tertiary)", color:"var(--color-text-primary)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ display:"flex", minHeight:"100vh" }}>
        {sidebarJSX}
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"250px 1fr", overflow:"hidden" }}>

          {/* Left Panel */}
          <div style={{ background:"var(--color-background-secondary)", borderLeft:"0.5px solid var(--color-border-tertiary)", padding:"18px", overflowY:"auto", display:"flex", flexDirection:"column", gap:"12px" }}>
            <div>
              <h2 style={{ fontSize:"15px", fontWeight:"700", margin:"0 0 3px" }}>✨ Content Studio</h2>
              <p style={{ fontSize:"11px", color:"var(--color-text-tertiary)", margin:0 }}>توليد صور من مكتبة الـ Prompts</p>
            </div>

            {/* Image Upload */}
            <div>
              <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px", fontWeight:"500" }}>صورة المنتج</p>
              {imagePreview ? (
                <div style={{ position:"relative" }}>
                  <img src={imagePreview} alt="" style={{ width:"100%", height:"130px", objectFit:"contain", background:"var(--color-background-primary)", borderRadius:"8px", border:"0.5px solid var(--color-border-tertiary)" }} />
                  <button onClick={() => { setImagePreview(null); setImageBase64(null); }} style={{ position:"absolute", top:5, left:5, width:20, height:20, background:"#fdeaea", border:"0.5px solid #f8d0d0", borderRadius:"50%", color:"#e24b4a", cursor:"pointer", fontSize:"10px", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                  <div style={{ position:"absolute", bottom:5, right:5, background:"rgba(0,0,0,0.5)", borderRadius:"4px", padding:"1px 5px" }}>
                    <span style={{ fontSize:"9px", color:"#fff" }}>✅ 2MB</span>
                  </div>
                </div>
              ) : (
                <div onClick={() => fileRef.current?.click()} style={{ border:"1.5px dashed var(--color-border-secondary)", borderRadius:"8px", padding:"20px", textAlign:"center", cursor:"pointer", background:"var(--color-background-primary)" }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }} />
                  <div style={{ fontSize:"22px", marginBottom:"4px" }}>📷</div>
                  <div style={{ fontSize:"11px", color:"var(--color-text-secondary)" }}>ارفع صورة المنتج</div>
                  <div style={{ fontSize:"9px", color:"var(--color-text-tertiary)", marginTop:"3px" }}>يُضغط لـ 2MB + تُحذف النصوص</div>
                </div>
              )}
            </div>

            {/* URL */}
            <div>
              <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 4px", fontWeight:"500" }}>أو رابط الصورة</p>
              <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." style={{ ...iStyle, direction:"ltr", textAlign:"left" }} />
            </div>

            {/* Category */}
            <div>
              <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 4px", fontWeight:"500" }}>فئة المنتج</p>
              <select value={category} onChange={e => setCategory(e.target.value)} style={iStyle}>
                {CATEGORIES.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Output Type */}
            <div>
              <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px", fontWeight:"500" }}>نوع المخرج</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"4px" }}>
                {types.map(t => (
                  <button key={t.k} onClick={() => setActiveType(t.k)}
                    style={{ padding:"6px 4px", fontSize:"10px", background:activeType===t.k?"#534AB7":"var(--color-background-primary)", border:`0.5px solid ${activeType===t.k?"#534AB7":"var(--color-border-secondary)"}`, borderRadius:"7px", color:activeType===t.k?"#EEEDFE":"var(--color-text-secondary)", cursor:"pointer", fontFamily:"inherit" }}>
                    {t.k==="white"?"⬜":t.k==="env"?"🏠":"📐"} {t.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Dropdown */}
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
                <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:0, fontWeight:"500" }}>اختر Prompt</p>
                <span style={{ fontSize:"9px", color:promptsForSelection.length > 0 ? "var(--color-text-success)" : "#E24B4A" }}>
                  {promptsForSelection.length > 0 ? `${promptsForSelection.length} متاح` : "لا يوجد"}
                </span>
              </div>
              {promptsForSelection.length > 0 ? (
                <select value={selectedPromptId} onChange={e => setSelectedPromptId(e.target.value)} style={iStyle}>
                  {promptsForSelection.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <div style={{ padding:"8px 10px", background:"#FCEBEB", border:"0.5px solid #F7C1C1", borderRadius:"8px", fontSize:"11px", color:"#A32D2D" }}>
                  لا يوجد Prompt — أضفه في مكتبة الأوامر
                </div>
              )}
            </div>

            {/* Custom */}
            <div style={{ background:"#fffbf0", border:"0.5px solid #f0e0b0", borderRadius:"8px", padding:"8px 10px" }}>
              <p style={{ fontSize:"11px", color:"#a07010", margin:"0 0 4px", fontWeight:"600" }}>⚡ إضافة مخصصة</p>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={2} placeholder="ultra realistic, 8K..." style={{ ...iStyle, resize:"none", fontSize:"11px", direction:"ltr", textAlign:"left" }} />
            </div>

            {/* Generate Button */}
            <button onClick={generateImage} disabled={genLoading || !selectedPromptId || (!imageBase64 && !imageUrl)}
              style={{ width:"100%", padding:"10px", background:genLoading||!selectedPromptId?"#e0e0f0":"linear-gradient(135deg,#7c3aed,#2563eb)", border:"none", borderRadius:"9px", color:genLoading||!selectedPromptId?"#9090c0":"#fff", fontSize:"13px", fontWeight:"700", cursor:genLoading||!selectedPromptId?"not-allowed":"pointer", fontFamily:"inherit" }}>
              {genLoading ? "⏳ جاري التوليد..." : "🎨 ولّد الصورة"}
            </button>
          </div>

          {/* Right: Output Area */}
          <div style={{ padding:"20px", overflowY:"auto", background:"var(--color-background-tertiary)", display:"flex", flexDirection:"column", gap:"20px" }}>

            {/* Output Cards */}
            <div>
              <p style={{ fontSize:"13px", fontWeight:"600", color:"var(--color-text-primary)", margin:"0 0 12px" }}>المخرجات</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>
                {types.map(t => (
                  <div key={t.k} style={{ background:"var(--color-background-primary)", border:`0.5px solid ${activeType===t.k && genLoading?"#7c3aed":"var(--color-border-tertiary)"}`, borderRadius:"12px", overflow:"hidden", cursor: genImages[t.k] ? "pointer" : "default" }} onClick={() => genImages[t.k] && setHistoryModal({ promptName:t.l, imageUrl:genImages[t.k] })}>
                    <div style={{ height:"150px", background:"var(--color-background-secondary)", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
                      {genImages[t.k] ? (
                        <>
                          <img src={genImages[t.k]} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                          <div style={{ position:"absolute", top:6, right:6, background:"#1D9E75", color:"#fff", fontSize:"9px", padding:"2px 7px", borderRadius:"10px" }}>مكتمل</div>
                        </>
                      ) : activeType===t.k && genLoading ? (
                        <div style={{ textAlign:"center" }}>
                          <div style={{ width:24, height:24, border:"2px solid var(--color-border-secondary)", borderTopColor:"#7c3aed", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 6px" }} />
                          <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:0 }}>جاري التوليد...</p>
                        </div>
                      ) : (
                        <div style={{ textAlign:"center", opacity:0.4 }}>
                          <div style={{ fontSize:"24px", marginBottom:"4px" }}>{t.k==="white"?"⬜":t.k==="env"?"🏠":"📐"}</div>
                          <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:0 }}>لم يُولَّد بعد</p>
                        </div>
                      )}
                    </div>
                    <div style={{ padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:0 }}>{t.l}</p>
                      {genImages[t.k] && (
                        <a href={genImages[t.k]} download={`${t.k}_generated.jpg`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ fontSize:"10px", padding:"3px 8px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"5px", color:"var(--color-text-secondary)", textDecoration:"none" }}>
                          ⬇ تنزيل
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div>
                <p style={{ fontSize:"13px", fontWeight:"600", color:"var(--color-text-primary)", margin:"0 0 10px" }}>آخر المخرجات</p>
                <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                  {history.slice(0,8).map(h => (
                    <div key={h.id} style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"9px", padding:"8px 12px", display:"flex", alignItems:"center", gap:"10px", cursor:"pointer" }} onClick={() => setHistoryModal(h)}>
                      <img src={h.imageUrl} alt="" style={{ width:42, height:42, borderRadius:"6px", objectFit:"cover", border:"0.5px solid var(--color-border-tertiary)", flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:"12px", fontWeight:"500", color:"var(--color-text-primary)", margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.promptName}</p>
                        <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:0 }}>{h.category} — {h.typeLabel} — {h.time}</p>
                      </div>
                      <div style={{ display:"flex", gap:"5px", flexShrink:0 }}>
                        <a href={h.imageUrl} download={`generated_${h.id}.jpg`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ fontSize:"10px", padding:"3px 8px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"5px", color:"var(--color-text-secondary)", textDecoration:"none" }}>⬇</a>
                        <button onClick={e => { e.stopPropagation(); setHistoryModal(h); }} style={{ fontSize:"10px", padding:"3px 8px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"5px", cursor:"pointer", color:"var(--color-text-secondary)", fontFamily:"inherit" }}>عرض</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!imageBase64 && !imageUrl && history.length === 0 && (
              <div style={{ textAlign:"center", padding:"60px 0", color:"var(--color-text-tertiary)" }}>
                <div style={{ fontSize:"44px", marginBottom:"12px", opacity:0.3 }}>🎨</div>
                <p style={{ fontSize:"13px", margin:"0 0 4px" }}>ارفع صورة المنتج واختر الـ Prompt</p>
                <p style={{ fontSize:"11px", color:"var(--color-text-tertiary)", margin:0 }}>يُحذف النص تلقائياً ويُولَّد من مكتبة الأوامر</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image View Modal */}
      {historyModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setHistoryModal(null)}>
          <div style={{ background:"var(--color-background-primary)", borderRadius:"12px", padding:"16px", maxWidth:"600px", width:"90%", position:"relative" }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
              <p style={{ fontSize:"13px", fontWeight:"600", color:"var(--color-text-primary)", margin:0 }}>{historyModal.promptName}</p>
              <div style={{ display:"flex", gap:"6px" }}>
                <a href={historyModal.imageUrl} download="generated.jpg" target="_blank" rel="noopener noreferrer"
                  style={{ padding:"5px 12px", background:"#534AB7", color:"#EEEDFE", borderRadius:"7px", fontSize:"11px", textDecoration:"none" }}>⬇ تنزيل</a>
                <button onClick={() => setHistoryModal(null)} style={{ width:26, height:26, background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"50%", cursor:"pointer", color:"var(--color-text-secondary)", fontSize:"12px", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
              </div>
            </div>
            <img src={historyModal.imageUrl} alt="" style={{ width:"100%", borderRadius:"8px", border:"0.5px solid var(--color-border-tertiary)" }} />
          </div>
        </div>
      )}
    </div>
  );
}
