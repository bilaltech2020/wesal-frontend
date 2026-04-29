// @ts-nocheck
"use client";
import { useState, useRef, useEffect } from "react";

const API_URL = "https://wesal-backend-production.up.railway.app";

// ── Types ─────────────────────────────────────────────
interface PromptItem { id:string; category:string; type:string; typeLabel:string; name:string; tags:string; prompt:string; }
interface Dimensions { width_cm:number; depth_cm:number; height_cm:number; confidence?:string; notes?:string; }

const INITIAL_PROMPT_LIBRARY: PromptItem[] = [
  { id:"sofa_white", category:"كنبة / أريكة", type:"white", typeLabel:"خلفية بيضاء", name:"Sofa — White Studio", tags:"studio,white", prompt:"Professional product photography of a sofa. Pure white seamless background, soft even studio lighting, no harsh shadows, centered, front 3/4 view, 8K. The product must remain exactly the same." },
  { id:"sofa_env",   category:"كنبة / أريكة", type:"env",   typeLabel:"بيئة واقعية",  name:"Sofa — Luxury Living Room", tags:"luxury,living", prompt:"Luxury modern living room, sofa on light oak floor, soft natural light from large windows, minimal Scandinavian decor, 8K. The product must remain exactly the same." },
  { id:"table_white",category:"طاولة",         type:"white", typeLabel:"خلفية بيضاء", name:"Table — White Studio", tags:"studio,white", prompt:"Professional product photography of a table. Pure white background, top-front 3/4 view, soft studio lighting, 8K. The product must remain exactly the same." },
  { id:"table_env",  category:"طاولة",         type:"env",   typeLabel:"بيئة واقعية",  name:"Table — Modern Dining", tags:"dining,modern", prompt:"Modern dining room, table on marble floor, elegant minimal decor, soft warm lighting, 8K. The product must remain exactly the same." },
  { id:"lamp_white", category:"إضاءة",         type:"white", typeLabel:"خلفية بيضاء", name:"Lamp — White Studio", tags:"lamp,studio", prompt:"Professional product photography of a lamp. Pure white background, lamp illuminated with warm glow, all design details visible, 8K. The product must remain exactly the same." },
  { id:"lamp_env",   category:"إضاءة",         type:"env",   typeLabel:"بيئة واقعية",  name:"Lamp — Cozy Bedroom", tags:"bedroom,cozy", prompt:"Luxury bedroom corner, lamp on side table, warm ambient lighting, minimal elegant decor, 8K. The product must remain exactly the same." },
  { id:"chair_white",category:"كرسي",          type:"white", typeLabel:"خلفية بيضاء", name:"Chair — White Studio", tags:"chair,studio", prompt:"Professional product photography of a chair. Pure white background, front 3/4 view, soft studio lighting, 8K. The product must remain exactly the same." },
  { id:"chair_env",  category:"كرسي",          type:"env",   typeLabel:"بيئة واقعية",  name:"Chair — Modern Interior", tags:"modern,office", prompt:"Elegant modern living room, chair on light floor, soft window lighting, minimal decor, 8K. The product must remain exactly the same." },
  { id:"bed_white",  category:"سرير",          type:"white", typeLabel:"خلفية بيضاء", name:"Bed — White Studio", tags:"bed,studio", prompt:"Professional product photography of a bed frame. Pure white background, 3/4 view showing headboard clearly, soft studio lighting, 8K. The product must remain exactly the same." },
  { id:"bed_env",    category:"سرير",          type:"env",   typeLabel:"بيئة واقعية",  name:"Bed — Luxury Bedroom", tags:"bedroom,luxury", prompt:"Luxury master bedroom, bed with premium neutral bedding, soft natural morning light, 8K. The product must remain exactly the same." },
];

const ALL_CATEGORIES = ["كنبة / أريكة","طاولة","إضاءة","كرسي","سرير","خزانة","ديكور","أخرى"];
const TYPE_LABELS: Record<string,string> = { white:"خلفية بيضاء", env:"بيئة واقعية", dim:"مقاسات" };
const CAT_COLORS: Record<string,{bg:string;text:string}> = {
  "كنبة / أريكة":{bg:"#EEEDFE",text:"#534AB7"},"طاولة":{bg:"#FAEEDA",text:"#854F0B"},
  "إضاءة":{bg:"#FAECE7",text:"#993C1D"},"كرسي":{bg:"#EAF3DE",text:"#3B6D11"},
  "سرير":{bg:"#E6F1FB",text:"#185FA5"},"خزانة":{bg:"#FBEAF0",text:"#993556"},
  "ديكور":{bg:"#F1EFE8",text:"#5F5E5A"},"أخرى":{bg:"#F1EFE8",text:"#5F5E5A"},
};

// ── Helpers ───────────────────────────────────────────
const iS: React.CSSProperties = { width:"100%", padding:"8px 10px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"8px", color:"var(--color-text-primary)", fontSize:"12px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as any };

const compressImage = (file: File): Promise<string> => new Promise(resolve => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const maxDim = 1920;
    let w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) { if(w>h){h=Math.round(h*maxDim/w);w=maxDim;}else{w=Math.round(w*maxDim/h);h=maxDim;} }
    canvas.width=w; canvas.height=h;
    canvas.getContext("2d")!.drawImage(img,0,0,w,h);
    URL.revokeObjectURL(url);
    const compress = (q:number) => {
      const d = canvas.toDataURL("image/jpeg", q);
      if (Math.round((d.length-22)*3/4) > 2*1024*1024 && q>0.3) compress(Math.max(q-0.08,0.3));
      else resolve(d.split(",")[1]);
    };
    compress(0.92);
  };
  img.src = url;
});

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function ContentStudioView({ sidebarJSX }: { sidebarJSX: React.ReactNode }) {
  const loadLib = (): PromptItem[] => { try { const s=localStorage.getItem("wesal_prompt_library"); return s?JSON.parse(s):INITIAL_PROMPT_LIBRARY; }catch{return INITIAL_PROMPT_LIBRARY;} };

  // ── State ──────────────────────────────────────────
  const [imagePreview, setImagePreview] = useState<string|null>(null);
  const [imageBase64, setImageBase64]   = useState<string|null>(null);
  const [imageUrl, setImageUrl]         = useState("");
  const [category, setCategory]         = useState("كنبة / أريكة");
  const [labelLang, setLabelLang]       = useState<"Arabic"|"English">("Arabic");

  // Dimensions
  const [dimW, setDimW] = useState("");
  const [dimD, setDimD] = useState("");
  const [dimH, setDimH] = useState("");
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionResult, setVisionResult]   = useState<Dimensions|null>(null);

  // Prompts
  const [envPromptId, setEnvPromptId] = useState("");

  // Results
  const [whiteResult,  setWhiteResult]  = useState<string|null>(null);
  const [envResult,    setEnvResult]    = useState<string|null>(null);
  const [dimResult,    setDimResult]    = useState<string|null>(null);

  // Loading states
  const [loadingWhite, setLoadingWhite] = useState(false);
  const [loadingEnv,   setLoadingEnv]   = useState(false);
  const [loadingDim,   setLoadingDim]   = useState(false);

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [viewModal, setViewModal] = useState<any>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-select first env prompt when category changes
  useEffect(() => {
    const lib = loadLib();
    const envPrompts = lib.filter(p => p.category === category && p.type === "env");
    setEnvPromptId(envPrompts[0]?.id || "");
  }, [category]);

  const envPrompts = loadLib().filter(p => p.category === category && p.type === "env");
  const selectedEnvPrompt = loadLib().find(p => p.id === envPromptId);

  // ── Image Upload ───────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setImageBase64(await compressImage(file));
    // Reset results
    setWhiteResult(null); setEnvResult(null); setDimResult(null); setVisionResult(null);
  };

  // ── Step 1: White Background ───────────────────────
  const handleWhiteBg = async () => {
    if (!imageBase64 && !imageUrl) return alert("ارفع صورة أولاً");
    setLoadingWhite(true);
    try {
      const res = await fetch(`${API_URL}/content-studio/remove-background`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ image_base64: imageBase64||"", image_url: imageUrl })
      });
      if (!res.ok) throw new Error((await res.json()).detail||"خطأ");
      const data = await res.json();
      const dataUrl = `data:image/jpeg;base64,${data.image_base64}`;
      setWhiteResult(dataUrl);
      addHistory("خلفية بيضاء", dataUrl, data.method === "passthrough" ? "⚠ بدون إزالة خلفية (أضف CLIPDROP_API_KEY)" : "");
    } catch(e:any) { alert("خطأ: "+e.message); }
    setLoadingWhite(false);
  };

  // ── Step 2: Vision Dimensions ──────────────────────
  const handleVisionDims = async () => {
    if (!imageBase64 && !imageUrl) return alert("ارفع صورة أولاً");
    setVisionLoading(true);
    try {
      const res = await fetch(`${API_URL}/content-studio/vision-dimensions`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ image_base64: imageBase64||"", image_url: imageUrl, category })
      });
      const data = await res.json();
      if (data.dimensions) {
        setVisionResult(data.dimensions);
        if (data.dimensions.width_cm)  setDimW(String(data.dimensions.width_cm));
        if (data.dimensions.depth_cm)  setDimD(String(data.dimensions.depth_cm));
        if (data.dimensions.height_cm) setDimH(String(data.dimensions.height_cm));
      }
    } catch(e:any) { alert("خطأ: "+e.message); }
    setVisionLoading(false);
  };

  // ── Step 3: Draw Dimensions ────────────────────────
  const handleDrawDims = async () => {
    if (!whiteResult && !imageBase64 && !imageUrl) return alert("ابدأ بالخلفية البيضاء أولاً");
    if (!dimW && !dimH && !dimD) return alert("أدخل مقساً واحداً على الأقل");
    setLoadingDim(true);
    try {
      // استخدم الخلفية البيضاء إذا متوفرة
      let base64ToUse = imageBase64||"";
      if (whiteResult && whiteResult.startsWith("data:")) {
        base64ToUse = whiteResult.split(",")[1];
      }
      const res = await fetch(`${API_URL}/content-studio/draw-dimensions`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          image_base64: base64ToUse,
          width_cm:  parseFloat(dimW)||0,
          depth_cm:  parseFloat(dimD)||0,
          height_cm: parseFloat(dimH)||0,
          label_lang: labelLang,
        })
      });
      if (!res.ok) throw new Error((await res.json()).detail||"خطأ");
      const data = await res.json();
      const dataUrl = `data:image/jpeg;base64,${data.image_base64}`;
      setDimResult(dataUrl);
      addHistory("مقاسات", dataUrl, "");
    } catch(e:any) { alert("خطأ: "+e.message); }
    setLoadingDim(false);
  };

  // ── Step 4: Generate Environment ──────────────────
  const handleGenEnv = async () => {
    if (!imageBase64 && !imageUrl) return alert("ارفع صورة أولاً");
    if (!selectedEnvPrompt) return alert("اختر بيئة من القائمة");
    setLoadingEnv(true);
    try {
      const res = await fetch(`${API_URL}/content-studio/generate-env`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          image_base64: imageBase64||"",
          image_url: imageUrl,
          prompt: selectedEnvPrompt.prompt,
          width: 1024, height: 1024,
        })
      });
      if (!res.ok) throw new Error((await res.json()).detail||"خطأ");
      const data = await res.json();
      setEnvResult(data.image_url);
      addHistory(selectedEnvPrompt.name, data.image_url, "");
    } catch(e:any) { alert("خطأ: "+e.message); }
    setLoadingEnv(false);
  };

  const addHistory = (name: string, url: string, note: string) => {
    setHistory(h => [{ name, url, note, time: new Date().toLocaleTimeString("ar") }, ...h.slice(0,19)]);
  };

  // ── UI ─────────────────────────────────────────────
  const Spinner = () => (
    <div style={{width:18,height:18,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block",verticalAlign:"middle",marginLeft:6}}/>
  );

  const ResultCard = ({title,img,loading,onAction,actionLabel,warning}:{title:string;img:string|null;loading:boolean;onAction:()=>void;actionLabel:string;warning?:string}) => (
    <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"12px",overflow:"hidden"}}>
      <div style={{height:200,background:"var(--color-background-secondary)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
        {img ? (
          <>
            <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"contain",cursor:"pointer"}} onClick={()=>setViewModal({name:title,url:img})}/>
            <div style={{position:"absolute",top:6,right:6,background:"#1D9E75",color:"#fff",fontSize:"9px",padding:"2px 7px",borderRadius:"10px"}}>مكتمل ✓</div>
          </>
        ) : loading ? (
          <div style={{textAlign:"center"}}>
            <div style={{width:28,height:28,border:"2px solid var(--color-border-secondary)",borderTopColor:"#534AB7",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 8px"}}/>
            <p style={{fontSize:"11px",color:"var(--color-text-tertiary)",margin:0}}>جاري المعالجة...</p>
          </div>
        ) : (
          <div style={{textAlign:"center",opacity:0.4}}>
            <p style={{fontSize:"28px",margin:"0 0 6px"}}>🖼</p>
            <p style={{fontSize:"10px",color:"var(--color-text-tertiary)",margin:0}}>لم يُعالج بعد</p>
          </div>
        )}
      </div>
      <div style={{padding:"10px 12px"}}>
        <p style={{fontSize:"12px",fontWeight:"600",color:"var(--color-text-primary)",margin:"0 0 6px"}}>{title}</p>
        {warning && <p style={{fontSize:"10px",color:"#EF9F27",margin:"0 0 6px"}}>{warning}</p>}
        <div style={{display:"flex",gap:"6px"}}>
          <button onClick={onAction} disabled={loading}
            style={{flex:1,padding:"7px",background:loading?"var(--color-background-secondary)":"#534AB7",border:"none",borderRadius:"7px",color:loading?"var(--color-text-tertiary)":"#EEEDFE",fontSize:"11px",fontWeight:"600",cursor:loading?"not-allowed":"pointer",fontFamily:"inherit"}}>
            {loading ? <><Spinner/> جاري...</> : actionLabel}
          </button>
          {img && (
            <a href={img} download={`${title}.jpg`} target="_blank" rel="noopener noreferrer"
              style={{padding:"7px 10px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"7px",color:"var(--color-text-secondary)",fontSize:"11px",textDecoration:"none",display:"flex",alignItems:"center"}}>
              ⬇
            </a>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Tajawal',sans-serif",direction:"rtl",minHeight:"100vh",background:"var(--color-background-tertiary)",color:"var(--color-text-primary)"}}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet"/>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{display:"flex",minHeight:"100vh"}}>
        {sidebarJSX}
        <div style={{flex:1,display:"grid",gridTemplateColumns:"260px 1fr",overflow:"hidden"}}>

          {/* ── Left Panel ─────────────────────────── */}
          <div style={{background:"var(--color-background-secondary)",borderLeft:"0.5px solid var(--color-border-tertiary)",padding:"18px",overflowY:"auto",display:"flex",flexDirection:"column",gap:"14px"}}>

            <div>
              <h2 style={{fontSize:"15px",fontWeight:"700",margin:"0 0 3px"}}>✨ Content Studio</h2>
              <p style={{fontSize:"11px",color:"var(--color-text-tertiary)",margin:0}}>معالجة احترافية لصور المنتجات</p>
            </div>

            {/* Image Upload */}
            <div>
              <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 5px",fontWeight:"600"}}>صورة المنتج</p>
              {imagePreview ? (
                <div style={{position:"relative"}}>
                  <img src={imagePreview} alt="" style={{width:"100%",height:"140px",objectFit:"contain",background:"var(--color-background-primary)",borderRadius:"9px",border:"0.5px solid var(--color-border-tertiary)"}}/>
                  <button onClick={()=>{setImagePreview(null);setImageBase64(null);setWhiteResult(null);setEnvResult(null);setDimResult(null);}} style={{position:"absolute",top:5,left:5,width:20,height:20,background:"#fdeaea",border:"0.5px solid #f8d0d0",borderRadius:"50%",color:"#e24b4a",cursor:"pointer",fontSize:"10px"}}>✕</button>
                  <div style={{position:"absolute",bottom:5,right:5,background:"rgba(0,0,0,0.5)",borderRadius:"4px",padding:"1px 5px"}}><span style={{fontSize:"9px",color:"#fff"}}>✅ 2MB</span></div>
                </div>
              ) : (
                <div onClick={()=>fileRef.current?.click()} style={{border:"1.5px dashed var(--color-border-secondary)",borderRadius:"9px",padding:"22px",textAlign:"center",cursor:"pointer",background:"var(--color-background-primary)"}}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{display:"none"}}/>
                  <div style={{fontSize:"24px",marginBottom:"5px"}}>📷</div>
                  <div style={{fontSize:"11px",color:"var(--color-text-secondary)"}}>ارفع صورة المنتج</div>
                  <div style={{fontSize:"9px",color:"var(--color-text-tertiary)",marginTop:"3px"}}>PNG/JPG — يُضغط لـ 2MB</div>
                </div>
              )}
              <div style={{marginTop:"8px"}}>
                <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 4px",fontWeight:"500"}}>أو رابط الصورة</p>
                <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://..." style={{...iS,direction:"ltr",textAlign:"left"}}/>
              </div>
            </div>

            {/* Category */}
            <div>
              <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 4px",fontWeight:"600"}}>فئة المنتج</p>
              <select value={category} onChange={e=>setCategory(e.target.value)} style={iS}>
                {ALL_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Dimensions */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"10px",padding:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:0,fontWeight:"600"}}>📐 المقاسات (سم)</p>
                <button onClick={handleVisionDims} disabled={visionLoading||(!imageBase64&&!imageUrl)}
                  style={{padding:"4px 10px",background:visionLoading||(!imageBase64&&!imageUrl)?"var(--color-background-secondary)":"#EEEDFE",border:`0.5px solid ${visionLoading?"var(--color-border-secondary)":"#534AB7"}`,borderRadius:"6px",color:visionLoading?"var(--color-text-tertiary)":"#534AB7",fontSize:"10px",cursor:visionLoading||(!imageBase64&&!imageUrl)?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:"600"}}>
                  {visionLoading?"جاري...":"🤖 خمّن بـ AI"}
                </button>
              </div>
              {visionResult && (
                <div style={{background:"#EEEDFE",borderRadius:"6px",padding:"6px 8px",marginBottom:"8px",fontSize:"10px",color:"#534AB7"}}>
                  AI: عرض {visionResult.width_cm}، عمق {visionResult.depth_cm}، ارتفاع {visionResult.height_cm} سم
                  {visionResult.confidence && <span style={{marginRight:"4px",opacity:0.7}}>({visionResult.confidence==="high"?"دقة عالية":visionResult.confidence==="medium"?"متوسطة":"منخفضة"})</span>}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px"}}>
                {([["العرض",dimW,setDimW],["العمق",dimD,setDimD],["الارتفاع",dimH,setDimH]] as [string,string,any][]).map(([l,v,s])=>(
                  <div key={l}>
                    <p style={{fontSize:"9px",color:"var(--color-text-tertiary)",margin:"0 0 3px"}}>{l}</p>
                    <input value={v} onChange={e=>s(e.target.value)} placeholder="0" style={{...iS,padding:"6px 7px",fontSize:"12px"}}/>
                  </div>
                ))}
              </div>
              <div style={{marginTop:"8px"}}>
                <p style={{fontSize:"10px",color:"var(--color-text-secondary)",margin:"0 0 4px"}}>لغة المقاسات</p>
                <div style={{display:"flex",gap:"5px"}}>
                  {(["Arabic","English"] as const).map(l=>(
                    <button key={l} onClick={()=>setLabelLang(l)}
                      style={{flex:1,padding:"5px",background:labelLang===l?"#534AB7":"var(--color-background-secondary)",border:`0.5px solid ${labelLang===l?"#534AB7":"var(--color-border-secondary)"}`,borderRadius:"6px",color:labelLang===l?"#EEEDFE":"var(--color-text-secondary)",fontSize:"10px",cursor:"pointer",fontFamily:"inherit"}}>
                      {l==="Arabic"?"عربي":"English"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Environment Prompt */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"10px",padding:"12px"}}>
              <p style={{fontSize:"11px",color:"var(--color-text-secondary)",margin:"0 0 6px",fontWeight:"600"}}>🏠 البيئة الواقعية</p>
              {envPrompts.length > 0 ? (
                <select value={envPromptId} onChange={e=>setEnvPromptId(e.target.value)} style={iS}>
                  {envPrompts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <div style={{padding:"7px 10px",background:"#FCEBEB",borderRadius:"7px",fontSize:"10px",color:"#A32D2D"}}>لا يوجد prompt — أضفه في مكتبة الأوامر</div>
              )}
              {selectedEnvPrompt && (
                <p style={{fontSize:"9px",color:"var(--color-text-tertiary)",margin:"5px 0 0",direction:"ltr",textAlign:"left",lineHeight:"1.4",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{selectedEnvPrompt.prompt}</p>
              )}
            </div>

          </div>

          {/* ── Right Panel ────────────────────────── */}
          <div style={{padding:"20px",overflowY:"auto",display:"flex",flexDirection:"column",gap:"20px"}}>

            {/* Pipeline Steps */}
            <div>
              <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px"}}>
                <p style={{fontSize:"14px",fontWeight:"600",color:"var(--color-text-primary)",margin:0}}>Pipeline المعالجة</p>
                <span style={{fontSize:"10px",color:"var(--color-text-tertiary)",background:"var(--color-background-secondary)",padding:"2px 8px",borderRadius:"10px"}}>3 خطوات</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px"}}>

                {/* White BG */}
                <ResultCard
                  title="⬜ خلفية بيضاء"
                  img={whiteResult}
                  loading={loadingWhite}
                  onAction={handleWhiteBg}
                  actionLabel="إزالة الخلفية"
                />

                {/* Environment */}
                <ResultCard
                  title="🏠 بيئة واقعية"
                  img={envResult}
                  loading={loadingEnv}
                  onAction={handleGenEnv}
                  actionLabel="توليد البيئة"
                />

                {/* Dimensions */}
                <ResultCard
                  title="📐 مقاسات"
                  img={dimResult}
                  loading={loadingDim}
                  onAction={handleDrawDims}
                  actionLabel="رسم المقاسات"
                />

              </div>
            </div>

            {/* Pipeline Guide */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"10px",padding:"14px 16px"}}>
              <p style={{fontSize:"12px",fontWeight:"600",color:"var(--color-text-primary)",margin:"0 0 10px"}}>دليل الاستخدام</p>
              <div style={{display:"flex",gap:"0",position:"relative"}}>
                <div style={{position:"absolute",top:14,right:22,left:22,height:"1px",background:"var(--color-border-tertiary)"}}/>
                {[
                  {n:"1",t:"ارفع الصورة",d:"PNG/JPG حتى 2MB"},
                  {n:"2",t:"أدخل المقاسات",d:"يدوياً أو بـ AI"},
                  {n:"3",t:"اختر البيئة",d:"من مكتبة الأوامر"},
                  {n:"4",t:"ولّد المخرجات",d:"3 صور جاهزة"},
                ].map((s,i)=>(
                  <div key={i} style={{flex:1,textAlign:"center",position:"relative",zIndex:1}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:"#534AB7",color:"#EEEDFE",fontSize:"12px",fontWeight:"700",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 6px"}}>{s.n}</div>
                    <p style={{fontSize:"11px",fontWeight:"600",color:"var(--color-text-primary)",margin:"0 0 2px"}}>{s.t}</p>
                    <p style={{fontSize:"10px",color:"var(--color-text-tertiary)",margin:0}}>{s.d}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div>
                <p style={{fontSize:"13px",fontWeight:"600",color:"var(--color-text-primary)",margin:"0 0 10px"}}>آخر المخرجات</p>
                <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                  {history.slice(0,8).map((h,i)=>(
                    <div key={i} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"9px",padding:"8px 12px",display:"flex",alignItems:"center",gap:"10px",cursor:"pointer"}} onClick={()=>setViewModal(h)}>
                      <img src={h.url} alt="" style={{width:42,height:42,borderRadius:"6px",objectFit:"cover",border:"0.5px solid var(--color-border-tertiary)",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:"12px",fontWeight:"500",color:"var(--color-text-primary)",margin:"0 0 1px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.name}</p>
                        <p style={{fontSize:"10px",color:"var(--color-text-tertiary)",margin:0}}>{h.time}{h.note?` — ${h.note}`:""}</p>
                      </div>
                      <div style={{display:"flex",gap:"5px",flexShrink:0}}>
                        <a href={h.url} download={`${h.name}.jpg`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                          style={{fontSize:"10px",padding:"3px 8px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"5px",color:"var(--color-text-secondary)",textDecoration:"none"}}>⬇</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* View Modal */}
      {viewModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setViewModal(null)}>
          <div style={{background:"var(--color-background-primary)",borderRadius:"12px",padding:"16px",maxWidth:"680px",width:"90%"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <p style={{fontSize:"13px",fontWeight:"600",color:"var(--color-text-primary)",margin:0}}>{viewModal.name}</p>
              <div style={{display:"flex",gap:"6px"}}>
                <a href={viewModal.url} download={`${viewModal.name}.jpg`} target="_blank" rel="noopener noreferrer"
                  style={{padding:"5px 12px",background:"#534AB7",color:"#EEEDFE",borderRadius:"7px",fontSize:"11px",textDecoration:"none"}}>⬇ تنزيل</a>
                <button onClick={()=>setViewModal(null)} style={{width:26,height:26,background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"50%",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:"12px"}}>✕</button>
              </div>
            </div>
            <img src={viewModal.url} alt="" style={{width:"100%",borderRadius:"8px",border:"0.5px solid var(--color-border-tertiary)"}}/>
          </div>
        </div>
      )}
    </div>
  );
}
