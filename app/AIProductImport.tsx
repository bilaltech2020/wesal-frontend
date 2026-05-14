// @ts-nocheck
"use client";
import { useState, useRef, useEffect } from "react";

const API_URL = "https://wesal-backend-production.up.railway.app";

const CATEGORIES = ["General","Chairs","Tables","Lighting","Mirrors","Cabinets","Outdoor","Sofas","Beds"];
const PLATFORMS  = ["Salla","Trendyol","Noon","Amazon","ERPNext"];

const STATUS_COLORS: Record<string,{bg:string;text:string;label:string}> = {
  completed:    {bg:"#E1F5EE", text:"#0F6E56", label:"مكتمل ✓"},
  needs_review: {bg:"#FFFDE7", text:"#854F0B", label:"يحتاج مراجعة"},
  failed:       {bg:"#FCEBEB", text:"#A32D2D", label:"فشل ✗"},
  pending:      {bg:"#F1F1F8", text:"#534AB7", label:"معلق"},
  approved:     {bg:"#E6F1FB", text:"#185FA5", label:"معتمد ✓"},
};

const iS: React.CSSProperties = {
  width:"100%", padding:"8px 10px",
  background:"var(--color-background-primary)",
  border:"0.5px solid var(--color-border-secondary)",
  borderRadius:"8px", color:"var(--color-text-primary)",
  fontSize:"12px", outline:"none",
  fontFamily:"inherit", boxSizing:"border-box" as any,
};

// ── Editable Cell ─────────────────────────────────────────────
function EditCell({ value, productId, field, onUpdate }: any) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value||"");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = async () => {
    setEditing(false);
    if (val === (value||"")) return;
    try {
      await fetch(`${API_URL}/ai-import/product/${productId}`, {
        method:"PUT", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({field, value: val}),
      });
      onUpdate(productId, field, val);
    } catch {}
  };

  if (editing) return (
    <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={save} onKeyDown={e=>e.key==="Enter"&&save()}
      style={{width:"100%",padding:"2px 4px",fontSize:"11px",border:"1px solid #534AB7",borderRadius:"4px",outline:"none",fontFamily:"inherit"}}/>
  );

  return (
    <div onClick={()=>setEditing(true)}
      style={{cursor:"text",minHeight:"20px",fontSize:"11px",color:val?"var(--color-text-primary)":"var(--color-text-tertiary)",padding:"1px 2px",borderRadius:"3px"}}
      title="اضغط للتعديل">
      {val || "—"}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function AIProductImport({ sidebarJSX }: { sidebarJSX: React.ReactNode }) {
  const [step, setStep]           = useState<1|2|3|4>(1);
  const [category, setCategory]   = useState("General");
  const [platform, setPlatform]   = useState("Salla");
  const [overwrite, setOverwrite] = useState(false);
  const [batchSize, setBatchSize] = useState(5);

  // Upload state
  const [uploadResult, setUploadResult]   = useState<any>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadErrors, setUploadErrors]   = useState<string[]>([]);

  // Processing state
  const [batchId, setBatchId]           = useState<string|null>(null);
  const [batchStatus, setBatchStatus]   = useState<any>(null);
  const [products, setProducts]         = useState<any[]>([]);
  const [processing, setProcessing]     = useState(false);
  const [progress, setProgress]         = useState(0);
  const [processLog, setProcessLog]     = useState<string[]>([]);

  // Export/Approve
  const [approving, setApproving] = useState(false);

  // History
  const [batches, setBatches]     = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    fetch(`${API_URL}/ai-import/batches`)
      .then(r=>r.json()).then(d=>setBatches(d.batches||[])).catch(()=>{});
  }, []);

  // ── Upload Excel ──────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true); setUploadErrors([]);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_URL}/ai-import/upload`, { method:"POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail||"خطأ في الرفع");
      setUploadResult(data);
      setBatchId(data.batch_id);
      setUploadErrors(data.errors||[]);
      setStep(2);
      log(`✅ تم رفع ${data.valid_rows} منتج من ${data.total_rows} صف`);
    } catch(e:any) { setUploadErrors([e.message]); }
    setUploadLoading(false);
  };

  // ── Process Batch ─────────────────────────────────────────
  const handleProcess = async () => {
    if (!batchId) return;
    setProcessing(true); setStep(3);
    log("🤖 بدأت المعالجة بالذكاء الاصطناعي...");

    let totalProcessed = 0;
    const total = uploadResult?.valid_rows || 1;

    while (true) {
      try {
        const res = await fetch(`${API_URL}/ai-import/process`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ batch_id:batchId, category, platform, overwrite, batch_size:batchSize })
        });
        const data = await res.json();
        if (!res.ok) { log(`❌ خطأ: ${data.detail}`); break; }

        totalProcessed += data.processed || 0;
        setProgress(Math.min(100, Math.round((totalProcessed/total)*100)));
        log(`✓ عولج ${data.processed} — مكتمل:${data.completed} فشل:${data.failed} مراجعة:${data.needs_review} | متبقي:${data.remaining}`);

        if (data.remaining === 0 || data.processed === 0) break;

        // Delay between batches
        await new Promise(r => setTimeout(r, 1500));
      } catch(e:any) { log(`❌ ${e.message}`); break; }
    }

    // Fetch final results
    await refreshBatch();
    setProcessing(false);
    setStep(4);
    log("✅ اكتملت المعالجة!");
  };

  const refreshBatch = async () => {
    if (!batchId) return;
    try {
      const res = await fetch(`${API_URL}/ai-import/batch/${batchId}`);
      const data = await res.json();
      setBatchStatus(data.batch);
      setProducts(data.products||[]);
    } catch {}
  };

  const log = (msg: string) => setProcessLog(p => [`${new Date().toLocaleTimeString("ar")} — ${msg}`, ...p.slice(0,49)]);

  // ── Update product locally ────────────────────────────────
  const updateLocal = (id: string, field: string, value: string) => {
    setProducts(p => p.map(pr => pr.id===id ? {...pr, [field]:value} : pr));
  };

  // ── Export Excel ──────────────────────────────────────────
  const handleExport = () => {
    if (!batchId) return;
    window.open(`${API_URL}/ai-import/export/${batchId}`, "_blank");
  };

  // ── Approve ───────────────────────────────────────────────
  const handleApprove = async () => {
    if (!batchId) return;
    setApproving(true);
    try {
      const res = await fetch(`${API_URL}/ai-import/approve/${batchId}`, { method:"POST" });
      const data = await res.json();
      log(`✅ تم اعتماد ${data.updated} منتج`);
      await refreshBatch();
    } catch(e:any) { log(`❌ ${e.message}`); }
    setApproving(false);
  };

  // ── Download Template ─────────────────────────────────────
  const handleTemplate = () => window.open(`${API_URL}/ai-import/template`, "_blank");

  // ── Reset ─────────────────────────────────────────────────
  const handleReset = () => {
    setStep(1); setUploadResult(null); setBatchId(null);
    setBatchStatus(null); setProducts([]); setProgress(0);
    setProcessLog([]); setUploadErrors([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Stats ─────────────────────────────────────────────────
  const stats = batchStatus || uploadResult || {};
  const completed    = stats.completed_rows    || products.filter(p=>p.status==="completed").length;
  const failed       = stats.failed_rows       || products.filter(p=>p.status==="failed").length;
  const needsReview  = stats.needs_review_rows || products.filter(p=>p.status==="needs_review").length;
  const pending      = products.filter(p=>p.status==="pending").length;
  const total        = stats.total_rows        || uploadResult?.valid_rows || 0;

  // ── VISIBLE COLUMNS in table ──────────────────────────────
  const TABLE_COLS = [
    {key:"image_url",    label:"صورة",              w:70},
    {key:"sku",          label:"SKU",               w:100},
    {key:"product_title_ar", label:"العنوان AR",    w:180},
    {key:"product_title_en", label:"العنوان EN",    w:180},
    {key:"type",         label:"النوع",             w:80},
    {key:"color",        label:"اللون",             w:80},
    {key:"primary_material", label:"الخامة",        w:100},
    {key:"width_cm",     label:"عرض",               w:55},
    {key:"depth_cm",     label:"عمق",               w:55},
    {key:"height_cm",    label:"ارتفاع",            w:60},
    {key:"confidence_score", label:"دقة",           w:55},
    {key:"status",       label:"الحالة",            w:110},
  ];

  return (
    <div style={{fontFamily:"'Tajawal',sans-serif",direction:"rtl",minHeight:"100vh",background:"var(--color-background-tertiary)",color:"var(--color-text-primary)"}}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}} .editable:hover{background:var(--color-background-secondary);border-radius:3px;}"}</style>
      <div style={{display:"flex",minHeight:"100vh"}}>
        {sidebarJSX}
        <div style={{flex:1,padding:"24px",overflowY:"auto",display:"flex",flexDirection:"column",gap:"16px"}}>

          {/* ── Header ─────────────────────────────── */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <h1 style={{fontSize:"20px",fontWeight:"500",margin:"0 0 3px"}}>📦 إدخال المنتجات بالذكاء الاصطناعي</h1>
              <p style={{fontSize:"12px",color:"var(--color-text-tertiary)",margin:0}}>ارفع Excel بروابط الصور وسيقوم AI بتحليل المنتجات وتعبئة البيانات تلقائياً</p>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <button onClick={()=>setShowHistory(!showHistory)} style={{padding:"7px 14px",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"8px",color:"var(--color-text-secondary)",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>
                📋 السجل ({batches.length})
              </button>
              <button onClick={handleTemplate} style={{padding:"7px 14px",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"8px",color:"var(--color-text-secondary)",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>
                ⬇ تحميل القالب
              </button>
              {step > 1 && <button onClick={handleReset} style={{padding:"7px 14px",background:"#FCEBEB",border:"0.5px solid #F7C1C1",borderRadius:"8px",color:"#A32D2D",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>↺ إعادة</button>}
            </div>
          </div>

          {/* ── Steps ──────────────────────────────── */}
          <div style={{display:"flex",gap:"0",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"10px",padding:"14px 20px",position:"relative"}}>
            <div style={{position:"absolute",top:"50%",right:"10%",left:"10%",height:"1px",background:"var(--color-border-tertiary)",transform:"translateY(-50%)"}}/>
            {[
              {n:1,label:"رفع الملف"},
              {n:2,label:"الإعدادات"},
              {n:3,label:"المعالجة"},
              {n:4,label:"المراجعة"},
            ].map(s=>(
              <div key={s.n} style={{flex:1,textAlign:"center",position:"relative",zIndex:1}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:step>=s.n?"#534AB7":"var(--color-background-secondary)",border:`2px solid ${step>=s.n?"#534AB7":"var(--color-border-secondary)"}`,color:step>=s.n?"#EEEDFE":"var(--color-text-tertiary)",fontSize:"13px",fontWeight:"700",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 6px"}}>
                  {step>s.n?"✓":s.n}
                </div>
                <p style={{fontSize:"11px",fontWeight:step===s.n?"600":"400",color:step===s.n?"#534AB7":"var(--color-text-secondary)",margin:0}}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Step 1: Upload ─────────────────────── */}
          {step === 1 && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",padding:"24px"}}>
                <h3 style={{fontSize:"14px",fontWeight:"600",margin:"0 0 14px"}}>رفع ملف Excel</h3>
                <div onClick={()=>fileRef.current?.click()}
                  style={{border:"2px dashed var(--color-border-secondary)",borderRadius:"10px",padding:"40px 20px",textAlign:"center",cursor:uploadLoading?"not-allowed":"pointer",background:"var(--color-background-secondary)"}}>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleUpload} style={{display:"none"}}/>
                  {uploadLoading ? (
                    <div><div style={{width:28,height:28,border:"2px solid var(--color-border-secondary)",borderTopColor:"#534AB7",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 8px"}}/><p style={{fontSize:"12px",color:"var(--color-text-secondary)",margin:0}}>جاري الرفع...</p></div>
                  ) : (
                    <>
                      <div style={{fontSize:"36px",marginBottom:"10px"}}>📊</div>
                      <p style={{fontSize:"13px",fontWeight:"600",color:"var(--color-text-primary)",margin:"0 0 4px"}}>اسحب الملف هنا أو اضغط للاختيار</p>
                      <p style={{fontSize:"11px",color:"var(--color-text-tertiary)",margin:0}}>Excel (.xlsx أو .xls)</p>
                    </>
                  )}
                </div>
                {uploadErrors.length > 0 && (
                  <div style={{marginTop:"12px",background:"#FCEBEB",border:"0.5px solid #F7C1C1",borderRadius:"8px",padding:"10px 12px"}}>
                    <p style={{fontSize:"12px",fontWeight:"600",color:"#A32D2D",margin:"0 0 6px"}}>⚠ أخطاء في الملف:</p>
                    {uploadErrors.slice(0,5).map((e,i)=><p key={i} style={{fontSize:"11px",color:"#A32D2D",margin:"2px 0"}}>{e}</p>)}
                    {uploadErrors.length>5&&<p style={{fontSize:"11px",color:"#A32D2D",margin:"4px 0 0"}}>و {uploadErrors.length-5} أخطاء أخرى...</p>}
                  </div>
                )}
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",padding:"24px"}}>
                <h3 style={{fontSize:"14px",fontWeight:"600",margin:"0 0 14px"}}>الأعمدة المطلوبة</h3>
                <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                  {["SKU *","Image URL *","Product Title EN","Product Title AR","Brand","Type","Color","Primary Material","Width (cm)","Height (cm)","Description EN","Description AR"].map((c,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"11px",color:"var(--color-text-secondary)"}}>
                      <span style={{color:c.includes("*")?"#E24B4A":"#1D9E75"}}>{c.includes("*")?"*":"✓"}</span> {c.replace(" *","")}
                    </div>
                  ))}
                </div>
                <div style={{marginTop:"12px",padding:"8px",background:"#EEEDFE",borderRadius:"6px"}}>
                  <p style={{fontSize:"10px",color:"#534AB7",margin:0}}>الأعمدة المُعلّمة بـ * إلزامية. الأعمدة الأخرى اختيارية — سيعبّئها AI تلقائياً.</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Settings ───────────────────── */}
          {step === 2 && uploadResult && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",padding:"20px",display:"flex",flexDirection:"column",gap:"12px"}}>
                <h3 style={{fontSize:"14px",fontWeight:"600",margin:0}}>⚙ إعدادات المعالجة</h3>
                <div>
                  <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 5px",fontWeight:"500"}}>فئة المنتجات</p>
                  <select value={category} onChange={e=>setCategory(e.target.value)} style={iS}>
                    {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 5px",fontWeight:"500"}}>المنصة المستهدفة</p>
                  <select value={platform} onChange={e=>setPlatform(e.target.value)} style={iS}>
                    {PLATFORMS.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 5px",fontWeight:"500"}}>حجم الـ Batch (منتجات في كل دفعة)</p>
                  <select value={batchSize} onChange={e=>setBatchSize(+e.target.value)} style={iS}>
                    {[3,5,10].map(n=><option key={n} value={n}>{n} منتجات</option>)}
                  </select>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:"8px",cursor:"pointer"}}>
                  <input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)} style={{width:14,height:14}}/>
                  <span style={{fontSize:"12px",color:"var(--color-text-secondary)"}}>استبدال البيانات الموجودة (Overwrite)</span>
                </label>
                <button onClick={handleProcess}
                  style={{padding:"12px",background:"linear-gradient(135deg,#534AB7,#2563eb)",border:"none",borderRadius:"9px",color:"#EEEDFE",fontSize:"14px",fontWeight:"700",cursor:"pointer",fontFamily:"inherit",marginTop:"4px"}}>
                  🤖 بدء المعالجة بالذكاء الاصطناعي
                </button>
              </div>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",padding:"20px"}}>
                <h3 style={{fontSize:"14px",fontWeight:"600",margin:"0 0 14px"}}>ملخص الملف</h3>
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  {[
                    {label:"اسم الملف",  val:uploadResult.file_name},
                    {label:"إجمالي الصفوف", val:uploadResult.total_rows},
                    {label:"صفوف صالحة",   val:uploadResult.valid_rows},
                    {label:"أخطاء",        val:uploadResult.errors?.length||0},
                  ].map((r,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:"var(--color-background-secondary)",borderRadius:"7px"}}>
                      <span style={{fontSize:"12px",color:"var(--color-text-secondary)"}}>{r.label}</span>
                      <span style={{fontSize:"12px",fontWeight:"600",color:"var(--color-text-primary)"}}>{r.val}</span>
                    </div>
                  ))}
                </div>
                {uploadErrors.length > 0 && (
                  <div style={{marginTop:"12px",background:"#FCEBEB",borderRadius:"8px",padding:"10px"}}>
                    <p style={{fontSize:"11px",fontWeight:"600",color:"#A32D2D",margin:"0 0 4px"}}>أخطاء ({uploadErrors.length}):</p>
                    {uploadErrors.slice(0,3).map((e,i)=><p key={i} style={{fontSize:"10px",color:"#A32D2D",margin:"1px 0"}}>{e}</p>)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Processing ─────────────────── */}
          {step === 3 && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:"16px"}}>
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",padding:"24px"}}>
                <h3 style={{fontSize:"14px",fontWeight:"600",margin:"0 0 16px"}}>🤖 جاري المعالجة...</h3>
                {/* Progress Bar */}
                <div style={{marginBottom:"16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
                    <span style={{fontSize:"12px",color:"var(--color-text-secondary)"}}>التقدم</span>
                    <span style={{fontSize:"12px",fontWeight:"600",color:"#534AB7"}}>{progress}%</span>
                  </div>
                  <div style={{height:10,background:"var(--color-background-secondary)",borderRadius:"5px",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(90deg,#534AB7,#2563eb)",borderRadius:"5px",transition:"width 0.5s ease"}}/>
                  </div>
                </div>
                {/* Stats */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"8px",marginBottom:"16px"}}>
                  {[
                    {label:"مكتمل",     val:completed,   bg:"#E1F5EE",  color:"#0F6E56"},
                    {label:"مراجعة",    val:needsReview, bg:"#FFFDE7",  color:"#854F0B"},
                    {label:"فشل",       val:failed,      bg:"#FCEBEB",  color:"#A32D2D"},
                    {label:"معلق",      val:pending,     bg:"#EEEDFE",  color:"#534AB7"},
                  ].map((s,i)=>(
                    <div key={i} style={{background:s.bg,borderRadius:"8px",padding:"10px",textAlign:"center"}}>
                      <p style={{fontSize:"20px",fontWeight:"600",color:s.color,margin:"0 0 2px"}}>{s.val}</p>
                      <p style={{fontSize:"10px",color:s.color,margin:0}}>{s.label}</p>
                    </div>
                  ))}
                </div>
                {processing && (
                  <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"10px",background:"#EEEDFE",borderRadius:"8px"}}>
                    <div style={{width:16,height:16,border:"2px solid #EEEDFE",borderTopColor:"#534AB7",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
                    <p style={{fontSize:"12px",color:"#534AB7",margin:0}}>Claude يحلل الصور...</p>
                  </div>
                )}
              </div>
              {/* Log */}
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",padding:"16px"}}>
                <p style={{fontSize:"12px",fontWeight:"600",margin:"0 0 10px"}}>سجل العمليات</p>
                <div style={{height:"260px",overflowY:"auto",display:"flex",flexDirection:"column",gap:"4px"}}>
                  {processLog.map((l,i)=>(
                    <p key={i} style={{fontSize:"10px",color:"var(--color-text-secondary)",margin:0,lineHeight:"1.5",fontFamily:"monospace",direction:"ltr",textAlign:"left"}}>{l}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Review Table ───────────────── */}
          {step === 4 && products.length > 0 && (
            <>
              {/* Action Bar */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"10px",padding:"12px 16px"}}>
                <div style={{display:"flex",gap:"12px"}}>
                  {[
                    {label:"مكتمل",  val:completed,   bg:"#E1F5EE", color:"#0F6E56"},
                    {label:"مراجعة", val:needsReview, bg:"#FFFDE7", color:"#854F0B"},
                    {label:"فشل",    val:failed,      bg:"#FCEBEB", color:"#A32D2D"},
                  ].map((s,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:"5px"}}>
                      <span style={{width:10,height:10,background:s.bg,border:`1px solid ${s.color}40`,borderRadius:"2px",display:"inline-block"}}/>
                      <span style={{fontSize:"12px",color:s.color}}>{s.label}: {s.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:"8px"}}>
                  <button onClick={refreshBatch} style={{padding:"7px 14px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"7px",color:"var(--color-text-secondary)",fontSize:"12px",cursor:"pointer",fontFamily:"inherit"}}>↺ تحديث</button>
                  <button onClick={handleExport} style={{padding:"7px 14px",background:"#E1F5EE",border:"0.5px solid #1D9E7540",borderRadius:"7px",color:"#0F6E56",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",fontWeight:"600"}}>📥 تصدير Excel</button>
                  <button onClick={handleApprove} disabled={approving} style={{padding:"7px 16px",background:approving?"var(--color-background-secondary)":"#534AB7",border:"none",borderRadius:"7px",color:approving?"var(--color-text-tertiary)":"#EEEDFE",fontSize:"12px",cursor:approving?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:"600"}}>
                    {approving?"جاري...":"✓ اعتماد النتائج"}
                  </button>
                </div>
              </div>

              {/* Table */}
              <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",overflow:"hidden"}}>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:"11px"}}>
                    <thead>
                      <tr style={{background:"var(--color-background-secondary)"}}>
                        {TABLE_COLS.map(c=>(
                          <th key={c.key} style={{padding:"9px 10px",textAlign:"right",fontWeight:"600",color:"var(--color-text-secondary)",borderBottom:"0.5px solid var(--color-border-tertiary)",whiteSpace:"nowrap",minWidth:c.w}}>
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p,i)=>{
                        const sc = STATUS_COLORS[p.status]||STATUS_COLORS.pending;
                        return (
                          <tr key={p.id} style={{background:sc.bg,borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                            {TABLE_COLS.map(c=>(
                              <td key={c.key} style={{padding:"6px 10px",verticalAlign:"middle"}}>
                                {c.key==="image_url" ? (
                                  <img src={p.image_url} alt="" style={{width:48,height:48,objectFit:"cover",borderRadius:"6px",border:"0.5px solid var(--color-border-tertiary)"}} onError={e=>{(e.target as any).style.display="none";}}/>
                                ) : c.key==="status" ? (
                                  <span style={{fontSize:"10px",background:sc.bg,color:sc.text,padding:"2px 8px",borderRadius:"12px",border:`0.5px solid ${sc.text}30`,fontWeight:"600",whiteSpace:"nowrap"}}>{sc.label}</span>
                                ) : c.key==="confidence_score" ? (
                                  <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                                    <div style={{height:5,width:40,background:"var(--color-border-tertiary)",borderRadius:"3px",overflow:"hidden"}}>
                                      <div style={{height:"100%",width:`${p.confidence_score||0}%`,background:p.confidence_score>=80?"#1D9E75":p.confidence_score>=50?"#EF9F27":"#E24B4A",borderRadius:"3px"}}/>
                                    </div>
                                    <span style={{fontSize:"10px",color:"var(--color-text-tertiary)"}}>{p.confidence_score||0}%</span>
                                  </div>
                                ) : (
                                  <EditCell value={p[c.key]} productId={p.id} field={c.key} onUpdate={updateLocal}/>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── History ────────────────────────────── */}
          {showHistory && batches.length > 0 && (
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",padding:"16px"}}>
              <p style={{fontSize:"13px",fontWeight:"600",margin:"0 0 12px"}}>📋 سجل عمليات الاستيراد</p>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                <thead><tr style={{background:"var(--color-background-secondary)"}}>
                  {["الملف","الإجمالي","مكتمل","فشل","مراجعة","الحالة","التاريخ","إجراء"].map((h,i)=>(
                    <th key={i} style={{padding:"8px 12px",textAlign:"right",fontWeight:"500",color:"var(--color-text-secondary)",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {batches.map((b,i)=>{
                    const sc = STATUS_COLORS[b.status]||STATUS_COLORS.pending;
                    return (
                      <tr key={b.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                        <td style={{padding:"8px 12px",color:"var(--color-text-primary)"}}>{b.file_name||"—"}</td>
                        <td style={{padding:"8px 12px"}}>{b.total_rows}</td>
                        <td style={{padding:"8px 12px",color:"#0F6E56"}}>{b.completed_rows}</td>
                        <td style={{padding:"8px 12px",color:"#A32D2D"}}>{b.failed_rows}</td>
                        <td style={{padding:"8px 12px",color:"#854F0B"}}>{b.needs_review_rows}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:"10px",background:sc.bg,color:sc.text,padding:"2px 8px",borderRadius:"10px"}}>{sc.label}</span></td>
                        <td style={{padding:"8px 12px",color:"var(--color-text-tertiary)",fontSize:"11px"}}>{new Date(b.created_at).toLocaleDateString("ar-SA")}</td>
                        <td style={{padding:"8px 12px"}}>
                          <div style={{display:"flex",gap:"4px"}}>
                            <button onClick={()=>{setBatchId(b.id);refreshBatch();setStep(4);setShowHistory(false);}}
                              style={{fontSize:"10px",padding:"3px 8px",background:"#EEEDFE",border:"0.5px solid #534AB740",borderRadius:"5px",cursor:"pointer",color:"#534AB7",fontFamily:"inherit"}}>عرض</button>
                            <button onClick={()=>window.open(`${API_URL}/ai-import/export/${b.id}`,"_blank")}
                              style={{fontSize:"10px",padding:"3px 8px",background:"#E1F5EE",border:"0.5px solid #1D9E7540",borderRadius:"5px",cursor:"pointer",color:"#0F6E56",fontFamily:"inherit"}}>Excel</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
