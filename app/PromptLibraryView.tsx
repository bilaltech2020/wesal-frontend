// @ts-nocheck
"use client";
import { useState } from "react";

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

export default function PromptLibraryView({ sidebarJSX }: { sidebarJSX: React.ReactNode }) {

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
}