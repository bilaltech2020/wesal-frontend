// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

// ── Lazy load heavy views ─────────────────────────────
const ReportsView       = dynamic(() => import("./components/ReportsView"),       { ssr: false });
const ContentStudioView = dynamic(() => import("./components/ContentStudioView"), { ssr: false });
const PromptLibraryView = dynamic(() => import("./components/PromptLibraryView"), { ssr: false });

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

type ViewType = "login" | "dashboard" | "competitors" | "inventory" | "reports" | "content" | "library" | "users";

// ── Roles & Permissions ──────────────────────────────
type UserRole = "admin"|"manager"|"operations"|"sales"|"viewer";
interface WesalUser{id:string;name:string;email:string;role:UserRole;createdAt:string;active:boolean;}
const ROLE_LABELS:Record<UserRole,string>={admin:"مدير النظام",manager:"مدير",operations:"عمليات",sales:"مبيعات",viewer:"مشاهدة فقط"};
const ROLE_PERMISSIONS:Record<UserRole,string[]>={
  admin:["dashboard","reports","competitors","inventory","content","library","users"],
  manager:["dashboard","reports","competitors","inventory","content","library"],
  operations:["dashboard","reports","inventory"],
  sales:["dashboard","competitors"],
  viewer:["dashboard"],
};
const ROLE_COLORS:Record<UserRole,{bg:string;text:string}>={
  admin:{bg:"#EEEDFE",text:"#534AB7"},manager:{bg:"#E1F5EE",text:"#0F6E56"},
  operations:{bg:"#E6F1FB",text:"#185FA5"},sales:{bg:"#FAEEDA",text:"#854F0B"},
  viewer:{bg:"#F1EFE8",text:"#5F5E5A"},
};
const NAV = [
  {icon:"⬡",  label:"لوحة التحكم",    v:"dashboard",   perm:"dashboard"},
  {icon:"📊", label:"التقارير",         v:"reports",     perm:"reports"},
  {icon:"🔍", label:"مراقبة المنافسين", v:"competitors", perm:"competitors"},
  {icon:"📦", label:"مراقبة المخزون",  v:"inventory",   perm:"inventory"},
  {icon:"✨", label:"Content Studio",  v:"content",     perm:"content"},
  {icon:"📚", label:"مكتبة الأوامر",  v:"library",     perm:"library"},
  {icon:"👥", label:"المستخدمون",      v:"users",       perm:"users"},
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
  const [currentUser, setCurrentUser] = useState<WesalUser|null>(null);

  // ── Users Management ──────────────────────────────
  const [users, setUsers] = useState<WesalUser[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wesal_users");
      if (saved) { setUsers(JSON.parse(saved)); }
      else {
        const admin:WesalUser={id:"admin_1",name:"المدير",email:"admin@wesal.app",role:"admin",createdAt:new Date().toISOString(),active:true};
        setUsers([admin]); localStorage.setItem("wesal_users",JSON.stringify([admin]));
      }
    } catch { setUsers([]); }
  }, []);
  const saveUsers = (u:WesalUser[])=>{setUsers(u);try{localStorage.setItem("wesal_users",JSON.stringify(u));}catch{}};
  const addUser    = (u:Omit<WesalUser,"id"|"createdAt">)=>saveUsers([...users,{...u,id:`user_${Date.now()}`,createdAt:new Date().toISOString()}]);
  const updateUser = (id:string,updates:Partial<WesalUser>)=>saveUsers(users.map(u=>u.id===id?{...u,...updates}:u));
  const deleteUser = (id:string)=>{if(id==="admin_1")return;saveUsers(users.filter(u=>u.id!==id));};
  const toggleUser = (id:string)=>saveUsers(users.map(u=>u.id===id?{...u,active:!u.active}:u));
  const canAccess  = (perm:string)=>currentUser?ROLE_PERMISSIONS[currentUser.role].includes(perm):false;

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
      setUser(u); const mu=users.find(wu=>wu.email===email&&wu.active); setCurrentUser(mu||{id:"s1",name:email.split("@")[0],email,role:"admin",createdAt:new Date().toISOString(),active:true}); setView("dashboard");
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
      setUser(u); const mu=users.find(wu=>wu.email===email&&wu.active); setCurrentUser(mu||{id:"s1",name:email.split("@")[0],email,role:"admin",createdAt:new Date().toISOString(),active:true}); setView("dashboard");
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
  const sidebarJSX = currentUser ? (
    <div style={{width:"220px",flexShrink:0,background:"var(--color-background-primary)",borderLeft:"0.5px solid var(--color-border-tertiary)",display:"flex",flexDirection:"column",minHeight:"100vh",fontFamily:"'Tajawal',sans-serif",direction:"rtl"}}>
      <div style={{padding:"20px 16px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
        <p style={{fontSize:"22px",fontWeight:"700",color:"#534AB7",margin:0}}>وصال</p>
        <p style={{fontSize:"10px",color:"var(--color-text-tertiary)",margin:"2px 0 0"}}>منصة التجارة الذكية</p>
      </div>
      <nav style={{flex:1,padding:"10px 8px",display:"flex",flexDirection:"column",gap:"2px"}}>
        {NAV.filter(item=>ROLE_PERMISSIONS[currentUser.role].includes(item.perm)).map(item=>(
          <button key={item.v} onClick={()=>setView(item.v as ViewType)}
            style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 12px",width:"100%",border:"none",borderRadius:"8px",cursor:"pointer",fontFamily:"inherit",fontSize:"13px",textAlign:"right",background:view===item.v?"#EEEDFE":"transparent",color:view===item.v?"#534AB7":"var(--color-text-secondary)",fontWeight:view===item.v?"600":"400"}}>
            <span style={{fontSize:"14px"}}>{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>
      <div style={{padding:"12px 14px",borderTop:"0.5px solid var(--color-border-tertiary)"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#EEEDFE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:"600",color:"#534AB7",flexShrink:0}}>
            {currentUser.name.substring(0,1)}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:"12px",fontWeight:"600",color:"var(--color-text-primary)",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser.name}</p>
            <p style={{fontSize:"10px",color:"var(--color-text-tertiary)",margin:0}}>{ROLE_LABELS[currentUser.role]}</p>
          </div>
        </div>
        <button onClick={()=>{localStorage.removeItem("wesal_token");localStorage.removeItem("wesal_user");setUser(null);setCurrentUser(null);setErpData(null);setView("login");}} style={{width:"100%",padding:"6px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"7px",color:"var(--color-text-secondary)",fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>تسجيل الخروج</button>
      </div>
    </div>
  ) : (
    <div style={{width:"220px",flexShrink:0,background:"var(--color-background-primary)",borderLeft:"0.5px solid var(--color-border-tertiary)",display:"flex",flexDirection:"column",minHeight:"100vh",fontFamily:"'Tajawal',sans-serif",direction:"rtl"}}>
      <div style={{padding:"20px 16px",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
        <p style={{fontSize:"22px",fontWeight:"700",color:"#534AB7",margin:0}}>وصال</p>
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
  // ── USERS VIEW ────────────────────────────────────────
  if (view === "users" && canAccess("users")) {
    const PERM_LABELS:Record<string,string>={dashboard:"لوحة التحكم",reports:"التقارير",competitors:"المنافسين",inventory:"المخزون",content:"Content Studio",library:"مكتبة الأوامر",users:"المستخدمون"};
    const ROLES:UserRole[]=["admin","manager","operations","sales","viewer"];
    const [uModal, setUModal] = useState<"add"|"edit"|null>(null);
    const [uEdit, setUEdit] = useState<any>({name:"",email:"",role:"viewer"});
    const [uSearch, setUSearch] = useState("");
    const [uFilter, setUFilter] = useState<UserRole|"all">("all");
    const filtered = users.filter((u:WesalUser)=>{
      const ms=!uSearch||u.name.includes(uSearch)||u.email.includes(uSearch);
      const mr=uFilter==="all"||u.role===uFilter;
      return ms&&mr;
    });
    const openAdd=()=>{setUEdit({name:"",email:"",role:"viewer"});setUModal("add");};
    const openEdit=(u:WesalUser)=>{setUEdit({...u});setUModal("edit");};
    const handleUSave=()=>{
      if(!uEdit.name?.trim()||!uEdit.email?.trim())return alert("الاسم والإيميل مطلوبان");
      if(uModal==="add")addUser({name:uEdit.name,email:uEdit.email,role:uEdit.role,active:true});
      else updateUser(uEdit.id,{name:uEdit.name,email:uEdit.email,role:uEdit.role});
      setUModal(null);
    };
    const handleUDel=(id:string)=>{if(id===currentUser?.id)return alert("لا يمكنك حذف حسابك");if(confirm("حذف؟")){deleteUser(id);setUModal(null);}};
    const iS:React.CSSProperties={width:"100%",padding:"8px 10px",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"8px",color:"var(--color-text-primary)",fontSize:"12px",outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
    return (
      <div style={{fontFamily:"'Tajawal',sans-serif",direction:"rtl",minHeight:"100vh",background:"var(--color-background-tertiary)"}}>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
        <div style={{display:"flex",minHeight:"100vh"}}>
          {sidebarJSX}
          <div style={{flex:1,padding:"24px",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
              <div>
                <h1 style={{fontSize:"20px",fontWeight:"500",margin:"0 0 3px",color:"var(--color-text-primary)"}}>👥 المستخدمون</h1>
                <p style={{fontSize:"12px",color:"var(--color-text-tertiary)",margin:0}}>{users.length} مستخدم</p>
              </div>
              <button onClick={openAdd} style={{padding:"9px 18px",background:"#534AB7",color:"#EEEDFE",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:"600",cursor:"pointer",fontFamily:"inherit"}}>+ إضافة مستخدم</button>
            </div>
            {/* Role Cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"8px",marginBottom:"16px"}}>
              {ROLES.map(r=>{const count=users.filter((u:WesalUser)=>u.role===r).length;return(
                <div key={r} onClick={()=>setUFilter(uFilter===r?"all":r)} style={{background:uFilter===r?ROLE_COLORS[r].bg:"var(--color-background-primary)",border:`0.5px solid ${uFilter===r?ROLE_COLORS[r].text+"40":"var(--color-border-tertiary)"}`,borderRadius:"10px",padding:"10px 12px",cursor:"pointer"}}>
                  <p style={{fontSize:"11px",color:ROLE_COLORS[r].text,margin:"0 0 4px",fontWeight:"500"}}>{ROLE_LABELS[r]}</p>
                  <p style={{fontSize:"20px",fontWeight:"500",color:"var(--color-text-primary)",margin:0}}>{count}</p>
                </div>
              );})}
            </div>
            {/* Search */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"10px",padding:"10px 14px",marginBottom:"14px",display:"flex",gap:"10px",alignItems:"center"}}>
              <input value={uSearch} onChange={e=>setUSearch(e.target.value)} placeholder="🔍 بحث..." style={{...iS,width:"220px"}}/>
              <button onClick={()=>setUFilter("all")} style={{padding:"6px 14px",background:uFilter==="all"?"#534AB7":"var(--color-background-secondary)",border:`0.5px solid ${uFilter==="all"?"#534AB7":"var(--color-border-secondary)"}`,borderRadius:"7px",color:uFilter==="all"?"#EEEDFE":"var(--color-text-secondary)",fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>الكل</button>
            </div>
            {/* Table */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                <thead><tr style={{background:"var(--color-background-secondary)"}}>
                  {["المستخدم","الدور","الصلاحيات","الحالة","إجراء"].map((h,i)=>(
                    <th key={i} style={{padding:"10px 14px",textAlign:"right",fontWeight:"500",color:"var(--color-text-secondary)",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map((u:WesalUser,i:number)=>(
                    <tr key={u.id} style={{borderBottom:i<filtered.length-1?"0.5px solid var(--color-border-tertiary)":"none"}}>
                      <td style={{padding:"12px 14px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                          <div style={{width:32,height:32,borderRadius:"50%",background:ROLE_COLORS[u.role].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:"600",color:ROLE_COLORS[u.role].text,flexShrink:0}}>{u.name.substring(0,1)}</div>
                          <div><p style={{fontSize:"12px",fontWeight:"500",color:"var(--color-text-primary)",margin:0}}>{u.name}</p><p style={{fontSize:"10px",color:"var(--color-text-tertiary)",margin:0}}>{u.email}</p></div>
                          {u.id===currentUser?.id&&<span style={{fontSize:"9px",background:"#EEEDFE",color:"#534AB7",padding:"1px 6px",borderRadius:"8px"}}>أنت</span>}
                        </div>
                      </td>
                      <td style={{padding:"12px 14px"}}><span style={{fontSize:"11px",background:ROLE_COLORS[u.role].bg,color:ROLE_COLORS[u.role].text,padding:"3px 10px",borderRadius:"20px"}}>{ROLE_LABELS[u.role]}</span></td>
                      <td style={{padding:"12px 14px"}}><div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>{ROLE_PERMISSIONS[u.role].map(p=><span key={p} style={{fontSize:"9px",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",padding:"1px 6px",borderRadius:"6px"}}>{PERM_LABELS[p]||p}</span>)}</div></td>
                      <td style={{padding:"12px 14px"}}><button onClick={()=>u.id!==currentUser?.id&&toggleUser(u.id)} style={{padding:"4px 12px",background:u.active?"#E1F5EE":"#FCEBEB",border:`0.5px solid ${u.active?"#1D9E7540":"#E24B4A40"}`,borderRadius:"20px",color:u.active?"#0F6E56":"#A32D2D",fontSize:"11px",cursor:u.id===currentUser?.id?"default":"pointer",fontFamily:"inherit"}}>{u.active?"نشط":"موقوف"}</button></td>
                      <td style={{padding:"12px 14px"}}><div style={{display:"flex",gap:"5px"}}>
                        <button onClick={()=>openEdit(u)} style={{fontSize:"10px",padding:"3px 8px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"5px",cursor:"pointer",color:"var(--color-text-secondary)",fontFamily:"inherit"}}>تعديل</button>
                        {u.id!==currentUser?.id&&<button onClick={()=>handleUDel(u.id)} style={{fontSize:"10px",padding:"3px 8px",background:"#FCEBEB",border:"0.5px solid #F7C1C1",borderRadius:"5px",cursor:"pointer",color:"#A32D2D",fontFamily:"inherit"}}>حذف</button>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Permissions Reference */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",padding:"16px",marginTop:"16px"}}>
              <p style={{fontSize:"13px",fontWeight:"500",margin:"0 0 12px",color:"var(--color-text-primary)"}}>مرجع الصلاحيات</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"8px"}}>
                {ROLES.map(r=>(
                  <div key={r} style={{background:"var(--color-background-secondary)",borderRadius:"8px",padding:"10px 12px"}}>
                    <span style={{fontSize:"11px",background:ROLE_COLORS[r].bg,color:ROLE_COLORS[r].text,padding:"2px 8px",borderRadius:"20px",display:"inline-block",marginBottom:"8px"}}>{ROLE_LABELS[r]}</span>
                    {ROLE_PERMISSIONS[r].map(p=><p key={p} style={{fontSize:"10px",color:"var(--color-text-secondary)",margin:"2px 0"}}>✓ {PERM_LABELS[p]||p}</p>)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {uModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
            <div style={{background:"var(--color-background-primary)",borderRadius:"14px",border:"0.5px solid var(--color-border-tertiary)",width:"460px",overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:"0.5px solid var(--color-border-tertiary)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <p style={{fontSize:"14px",fontWeight:"600",color:"var(--color-text-primary)",margin:0}}>{uModal==="add"?"إضافة مستخدم جديد":"تعديل المستخدم"}</p>
                <button onClick={()=>setUModal(null)} style={{width:28,height:28,background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"50%",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:"13px",fontFamily:"inherit"}}>✕</button>
              </div>
              <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:"14px"}}>
                <div><p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 5px",fontWeight:"500"}}>الاسم *</p><input value={uEdit.name||""} onChange={e=>setUEdit({...uEdit,name:e.target.value})} placeholder="اسم المستخدم" style={iS}/></div>
                <div><p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 5px",fontWeight:"500"}}>البريد الإلكتروني *</p><input value={uEdit.email||""} onChange={e=>setUEdit({...uEdit,email:e.target.value})} placeholder="email@example.com" style={{...iS,direction:"ltr",textAlign:"left"}}/></div>
                <div>
                  <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 6px",fontWeight:"500"}}>الدور والصلاحيات *</p>
                  <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                    {ROLES.map(r=>(
                      <label key={r} onClick={()=>setUEdit({...uEdit,role:r})} style={{display:"flex",alignItems:"flex-start",gap:"10px",padding:"10px 12px",background:uEdit.role===r?ROLE_COLORS[r].bg:"var(--color-background-secondary)",border:`0.5px solid ${uEdit.role===r?ROLE_COLORS[r].text+"40":"var(--color-border-tertiary)"}`,borderRadius:"8px",cursor:"pointer"}}>
                        <div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${uEdit.role===r?ROLE_COLORS[r].text:"var(--color-border-secondary)"}`,background:uEdit.role===r?ROLE_COLORS[r].text:"transparent",flexShrink:0,marginTop:2}}/>
                        <div style={{flex:1}}>
                          <p style={{fontSize:"12px",fontWeight:"500",color:ROLE_COLORS[r].text,margin:"0 0 3px"}}>{ROLE_LABELS[r]}</p>
                          <p style={{fontSize:"10px",color:"var(--color-text-tertiary)",margin:0}}>{ROLE_PERMISSIONS[r].map(p=>PERM_LABELS[p]||p).join("، ")}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{padding:"14px 20px",borderTop:"0.5px solid var(--color-border-tertiary)",display:"flex",justifyContent:uModal==="edit"?"space-between":"flex-end",alignItems:"center"}}>
                {uModal==="edit"&&uEdit.id&&uEdit.id!==currentUser?.id&&<button onClick={()=>handleUDel(uEdit.id)} style={{padding:"8px 14px",background:"#FCEBEB",border:"0.5px solid #F7C1C1",borderRadius:"8px",color:"#A32D2D",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>حذف</button>}
                <div style={{display:"flex",gap:"8px"}}>
                  <button onClick={()=>setUModal(null)} style={{padding:"8px 18px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"8px",color:"var(--color-text-secondary)",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>إلغاء</button>
                  <button onClick={handleUSave} style={{padding:"8px 18px",background:"#534AB7",color:"#EEEDFE",border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"600",cursor:"pointer",fontFamily:"inherit"}}>{uModal==="add"?"إضافة":"حفظ"}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

    if (view === "reports" && canAccess("reports")) {
    return (
      <ReportsView
        sidebarJSX={sidebarJSX}
        erpData={erpData}
        timePeriod={timePeriod}
        setTimePeriod={setTimePeriod}
        fetchKpis={fetchKpis}
        reportChat={reportChat}
        reportChatInput={reportChatInput}
        setReportChatInput={setReportChatInput}
        reportChatLoading={reportChatLoading}
        sendReportChat={sendReportChat}
      />
    );
  }

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
  if (view === "content" && canAccess("content")) {
    return <ContentStudioView sidebarJSX={sidebarJSX} />;
  }

    if (view === "library" && canAccess("library")) {
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
