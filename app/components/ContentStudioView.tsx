// @ts-nocheck
"use client";
import { useState, useRef } from "react";

const API_URL = "https://wesal-backend-production.up.railway.app";

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

export default function ContentStudioView({ sidebarJSX }: { sidebarJSX: React.ReactNode }) {

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
      const res = await fetch(`${API_URL}/content-studio/generate`, {
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