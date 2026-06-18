// @ts-nocheck
"use client";
import { useState, useRef } from "react";

const API_URL = "https://wesal-backend-production.up.railway.app";

// ══════════════════════════════════════
// GEMINI SERVICE (inline)
// ══════════════════════════════════════
const GEMINI_FLASH = "gemini-1.5-flash-001";
const GEMINI_PRO   = "gemini-1.5-pro-001";
const GEMINI_BASE  = "https://generativelanguage.googleapis.com/v1/models";

const FURNITURE_SYSTEM = `أنت خبير تحليل منتجات أثاث وديكور للسوق السعودي.
قواعد: 1) أثاث وديكور فقط. 2) لا تخترع مقاسات. 3) خامة غير واضحة = "Needs Review".
4) مصطلحات أثاث احترافية. 5) محتوى عربي للسوق السعودي. 6) عنوان إنجليزي قصير.
أرجع JSON فقط بدون أي نص أو markdown.`;

async function urlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("فشل تحميل الصورة");
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const [h, d] = r.result.split(",");
      resolve({ data: d, mimeType: h.match(/:(.*?);/)?.[1] || "image/jpeg" });
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function geminiVision(apiKey, imageUrl, prompt, model = GEMINI_FLASH) {
  const { data, mimeType } = await urlToBase64(imageUrl);
  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: mimeType, data } }, { text: prompt }] }],
    generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 2048 },
    systemInstruction: { parts: [{ text: FURNITURE_SYSTEM }] }
  };
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `Gemini error ${res.status}`); }
  const j = await res.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function extractFurnitureData(apiKey, imageUrl) {
  const prompt = `حلّل صورة المنتج واستخرج البيانات. أرجع JSON فقط:
{
  "category": "", "product_type": "", "title_ar": "", "title_en": "",
  "color": "", "primary_material": "", "secondary_material": "", "style": "",
  "description_ar": "", "description_en": "",
  "features": ["", "", ""],
  "social_caption_ar": "", "social_caption_en": "",
  "lifestyle_prompt": "",
  "confidence_score": 85, "needs_review": false
}`;
  const raw = await geminiVision(apiKey, imageUrl, prompt, GEMINI_FLASH);
  try {
    return JSON.parse(raw.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim());
  } catch { return null; }
}

const INITIAL_PROMPT_LIBRARY = [
  { id:"sofa_white", category:"كنبة / أريكة", type:"white", typeLabel:"خلفية بيضاء", name:"Sofa — White Studio", tags:"studio,white,catalog", prompt:"Professional product photography of a sofa. Pure white seamless background, soft even studio lighting from multiple angles, no harsh shadows, centered composition, front 3/4 view, commercial catalog quality, 8K resolution. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"sofa_env",   category:"كنبة / أريكة", type:"env",   typeLabel:"بيئة واقعية",  name:"Sofa — Luxury Living Room", tags:"luxury,living,realistic", prompt:"Luxury modern living room, sofa placed naturally on a light oak wood floor, soft natural light from large windows, minimal Scandinavian decor, warm neutral tones, no clutter, realistic interior photography, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"sofa_dim",   category:"كنبة / أريكة", type:"dim",   typeLabel:"مقاسات",        name:"Sofa — Dimensions", tags:"dimensions,annotations,arabic", prompt:"Product on pure white background with professional dimension annotations, clean arrows indicating width, depth, height in centimeters, Arabic labels, minimal design, technical drawing style. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"table_white",category:"طاولة", type:"white", typeLabel:"خلفية بيضاء", name:"Table — White Studio", tags:"studio,white,catalog", prompt:"Professional product photography of a table. Pure white seamless background, top-front 3/4 view showing table surface and legs clearly, soft studio lighting, no shadows on background, e-commerce catalog style, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"table_env",  category:"طاولة", type:"env",   typeLabel:"بيئة واقعية",  name:"Table — Modern Dining Room", tags:"dining,modern,realistic", prompt:"Modern dining room or living space, table placed on marble or light wood floor, elegant minimal decor, soft warm lighting from ceiling and windows, no clutter around table, photorealistic interior, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"table_dim",  category:"طاولة", type:"dim",   typeLabel:"مقاسات",        name:"Table — Dimensions", tags:"dimensions,annotations", prompt:"Table on pure white background, dimension arrows showing table width, depth, height and leg height in centimeters, Arabic dimension labels, clean technical annotation style. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"lamp_white", category:"إضاءة", type:"white", typeLabel:"خلفية بيضاء", name:"Lamp — White Studio", tags:"lamp,studio,white", prompt:"Professional product photography of a lamp or lighting fixture. Pure white seamless background, lamp shown illuminated with warm glow, soft studio lighting, all design details visible, e-commerce quality, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"lamp_env",   category:"إضاءة", type:"env",   typeLabel:"بيئة واقعية",  name:"Lamp — Cozy Bedroom", tags:"bedroom,cozy,ambient", prompt:"Luxury bedroom or living room corner, lamp placed on side table or floor, warm ambient lighting creating cozy atmosphere, minimal elegant decor, realistic interior photography, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"lamp_dim",   category:"إضاءة", type:"dim",   typeLabel:"مقاسات",        name:"Lamp — Dimensions", tags:"dimensions,height,diameter", prompt:"Lamp on white background, arrows showing total height, shade diameter, base diameter in centimeters, Arabic labels, clean technical style. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"chair_white",category:"كرسي", type:"white", typeLabel:"خلفية بيضاء", name:"Chair — White Studio", tags:"chair,studio,catalog", prompt:"Professional product photography of a chair. Pure white seamless background, front 3/4 view showing seat, back and legs, soft even studio lighting, no shadows, commercial quality, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"chair_env",  category:"كرسي", type:"env",   typeLabel:"بيئة واقعية",  name:"Chair — Modern Interior", tags:"modern,interior,office", prompt:"Elegant modern living room or office, chair placed naturally on light floor, soft window lighting, minimal decor, no clutter, photorealistic, 8K. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
  { id:"chair_dim",  category:"كرسي", type:"dim",   typeLabel:"مقاسات",        name:"Chair — Dimensions", tags:"dimensions,seat,height", prompt:"Chair on pure white background, arrows showing seat height, total height, width and depth in centimeters, Arabic labels, clean technical annotation. Keep the product exactly the same shape, color, material, structure, proportions, and design." },
];

// ══ CATEGORIES + SUBCATEGORIES ════════════════════════════════
const CATEGORY_TREE = {
  "كنبة / أريكة":    ["عامة","كنبة L","كنبة زاوية","كنبة كلاسيك","كنبة مودرن","كنبة قابلة للتحويل","أريكة فردية","أريكة ثنائية","أريكة ثلاثية"],
  "طاولة":           ["عامة","طاولة طعام","طاولة قهوة","طاولة جانبية","طاولة تلفاز","طاولة مكتب","طاولة زجاجية","طاولة خشبية"],
  "إضاءة":           ["عامة","لمبة أرضية","لمبة طاولة","ثريا","إضاءة جدارية","إضاءة سقف","إضاءة خارجية"],
  "كرسي":            ["عامة","كرسي مكتب","كرسي طعام","كرسي استرخاء","كرسي بذراعين","كرسي بدون ذراعين","بوف","فوتيه"],
  "سرير":            ["عامة","سرير مفرد","سرير مزدوج","سرير كينج","سرير بقاعدة تخزين","سرير ديوان","سرير أطفال"],
  "خزانة / وحدة TV": ["عامة","خزانة ملابس","وحدة تلفاز","خزانة مطبخ","خزانة حمام","وحدة جدارية","رف كتب"],
  "أثاث خارجي":      ["عامة","طاولة خارجية","كرسي خارجية","كنبة خارجية","أرجوحة","شمسية","براغولا"],
  "مطبخ":            ["عامة","خزانة مطبخ","رف مطبخ","جزيرة مطبخ","طاولة بار","كرسي بار"],
  "حمام":            ["عامة","خزانة حمام","مرآة","رف حمام","وحدة حمام كاملة"],
  "ديكور":           ["عامة","لوحة جدارية","مرآة ديكورية","نباتات صناعية","سجادة","وسادة","شمعدان","إطار صورة"],
  "أثاث مكتبي":      ["عامة","مكتب","كرسي مكتب","رف مكتبي","خزانة ملفات","طاولة اجتماعات"],
  "أخرى":            ["عامة"],
};
const CATEGORIES = Object.keys(CATEGORY_TREE);
const TYPE_LABELS = { white:"خلفية بيضاء", env:"بيئة واقعية", dim:"مقاسات" };


export default function ContentStudioView({ sidebarJSX }) {

  const loadLib = () => { try { const s = localStorage.getItem("wesal_prompt_library"); return s ? JSON.parse(s) : INITIAL_PROMPT_LIBRARY; } catch { return INITIAL_PROMPT_LIBRARY; } };

  // ── Studio States ──────────────────────────────────────────
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64]   = useState(null);
  const [imageUrl, setImageUrl]         = useState("");
  const [category, setCategory]         = useState("كنبة / أريكة");
  const [subCategory, setSubCategory]   = useState("عامة");
  const [activeType, setActiveType]     = useState("white");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [history, setHistory]           = useState([]);
  const [historyModal, setHistoryModal] = useState(null);
  const fileRef = useRef(null);

  // ── Gemini States ──────────────────────────────────────────
  const [showGeminiSettings, setShowGeminiSettings] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput]         = useState("");
  const [geminiKeySaved, setGeminiKeySaved]         = useState(false);
  const [geminiLoading, setGeminiLoading]           = useState(false);
  const [geminiError, setGeminiError]               = useState("");
  const [geminiResult, setGeminiResult]             = useState(null);
  const [geminiHistory, setGeminiHistory]           = useState([]);
  const [showGeminiResult, setShowGeminiResult]     = useState(false);
  const [totalAnalyzed, setTotalAnalyzed]           = useState(0);
  const [totalCost, setTotalCost]                   = useState(0);
  const [overwrite, setOverwrite]                   = useState(false);
  const [editableResult, setEditableResult]         = useState(null);

  // ── Image Generation States ────────────────────────────────
  const [genLoading, setGenLoading]         = useState(false);
  const [genError, setGenError]             = useState("");
  const [generatedImage, setGeneratedImage] = useState(null); // {url, prompt, iteration}
  const [iterations, setIterations]         = useState([]); // history of generated images
  const [refinePrompt, setRefinePrompt]     = useState("");
  const [refineLoading, setRefineLoading]   = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");

  // ── Quick Refinement Presets ───────────────────────────────
  const REFINE_PRESETS = [
    { label:"💡 إضاءة أقوى",   v:"increase brightness, add more vibrant lighting, well-lit scene" },
    { label:"☀️ نهاري",        v:"bright natural daylight, warm sunlight from large windows" },
    { label:"🌙 مسائي",        v:"cozy evening atmosphere, warm ambient lighting, golden hour" },
    { label:"🪵 أرضية خشب",   v:"light oak wood flooring, natural texture" },
    { label:"🌿 أضف نباتات",   v:"add subtle indoor plants in background for natural feel" },
    { label:"⬜ خلفية بيضاء",  v:"pure white seamless studio background, no shadows" },
    { label:"✨ جودة أعلى",    v:"ultra sharp details, 8K quality, photorealistic, professional photography" },
    { label:"🎨 ألوان أعمق",   v:"richer deeper colors, more saturated, vibrant tones" },
  ];

  const getGeminiKey = () => {
    try { return sessionStorage.getItem("wesal_gemini_key") || ""; } catch { return ""; }
  };
  const hasGeminiKey = () => Boolean(getGeminiKey());

  const saveGeminiKey = () => {
    if (!geminiKeyInput.trim()) return;
    try { sessionStorage.setItem("wesal_gemini_key", geminiKeyInput.trim()); }
    catch { localStorage.setItem("wesal_gemini_key_enc", btoa(geminiKeyInput.trim())); }
    setGeminiKeySaved(true);
    setGeminiKeyInput("");
    setTimeout(() => setGeminiKeySaved(false), 2000);
  };

  const clearGeminiKey = () => {
    try { sessionStorage.removeItem("wesal_gemini_key"); } catch {}
    try { localStorage.removeItem("wesal_gemini_key_enc"); } catch {}
  };

  // ── Prompts Logic ──────────────────────────────────────────
  const promptsForSelection = loadLib().filter(p => p.category === category && p.type === activeType);
  const selectedPrompt = loadLib().find(p => p.id === selectedPromptId);

  const prevCatType = useRef({ category, activeType });
  if (prevCatType.current.category !== category || prevCatType.current.activeType !== activeType) {
    prevCatType.current = { category, activeType };
    if (prevCatType.current.category !== category) setSubCategory("عامة");
    const np = loadLib().filter(p => p.category === category && p.type === activeType);
    if (np.length > 0) setSelectedPromptId(np[0].id); else setSelectedPromptId("");
  }

  // ── Image Compress ─────────────────────────────────────────
  const compressImage = (file) => new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxDim = 1920; let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) { if (w > h) { h = Math.round(h*maxDim/w); w=maxDim; } else { w=Math.round(w*maxDim/h); h=maxDim; } }
      canvas.width=w; canvas.height=h; canvas.getContext("2d").drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      const compress = q => { const d=canvas.toDataURL("image/jpeg",q); if(Math.round((d.length-22)*3/4)>2*1024*1024&&q>0.3) compress(Math.max(q-0.08,0.3)); else resolve(d.split(",")[1]); };
      compress(0.92);
    };
    img.src=url;
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result);
    reader.readAsDataURL(file);
    setImageBase64(await compressImage(file));
    setGeminiResult(null); setEditableResult(null);
  };



  // ── Gemini Analyze ─────────────────────────────────────────
  const analyzeWithGemini = async (retry = false) => {
    const key = getGeminiKey();
    if (!key) { setShowGeminiSettings(true); return; }
    const url = imageUrl || (imagePreview ? imagePreview : null);
    if (!url && !imageBase64) { setGeminiError("ارفع صورة أو أدخل رابط أولاً"); return; }

    // إذا base64 نحتاج url — نستخدم imageUrl مباشرة
    const targetUrl = imageUrl || "";
    if (!targetUrl) { setGeminiError("أدخل رابط الصورة (URL) لتحليل Gemini — لا يدعم الصور المرفوعة مباشرة"); return; }

    setGeminiLoading(true); setGeminiError(""); if (!retry) setGeminiResult(null);
    try {
      const result = await extractFurnitureData(key, targetUrl);
      if (!result) throw new Error("فشل تحليل الصورة — تحقق من الـ API Key");
      setGeminiResult(result);
      setEditableResult({ ...result });
      setShowGeminiResult(true);
      setTotalAnalyzed(n => n + 1);
      setTotalCost(c => c + 0.002); // ~$0.002 per image with Flash
      setGeminiHistory(h => [{ id: Date.now(), url: targetUrl, result, time: new Date().toLocaleTimeString("ar") }, ...h.slice(0,9)]);
    } catch(e) {
      setGeminiError(e.message || "خطأ غير معروف");
    }
    setGeminiLoading(false);
  };

  // ── FLUX Kontext Image Generation (Replicate) ──────────────
  const generateWithReplicate = async () => {
    if (!selectedPrompt) { setGenError("اختر Prompt من المكتبة أولاً"); return; }
    if (!imageBase64 && !imageUrl) { setGenError("ارفع صورة أو أدخل رابط أولاً"); return; }

    setGenLoading(true); setGenError("");
    try {
      const fullPrompt = `${selectedPrompt.prompt}${customPrompt ? ` ${customPrompt}` : ""}`;
      const body: any = { prompt: fullPrompt, aspect_ratio: "1:1", model: "pro" };
      if (imageUrl) body.image_url = imageUrl;
      else if (imageBase64) body.image_base64 = imageBase64;

      const res = await fetch(`${API_URL}/content-studio/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.detail || `خطأ ${res.status}`); }
      const data = await res.json();

      const iteration = {
        id: Date.now(),
        iteration: iterations.length + 1,
        prompt: fullPrompt,
        scene: selectedPrompt.name,
        imageUrl: data.image_url,
        isOriginal: true,
        time: new Date().toLocaleTimeString("ar"),
      };
      setIterations(p => [iteration, ...p]);
      setGeneratedImage(iteration);
      setHistory(h => [{ id:`gen_${Date.now()}`, promptName: selectedPrompt.name, category, type: activeType, typeLabel: TYPE_LABELS[activeType], imageUrl: data.image_url, time: iteration.time }, ...h.slice(0,19)]);
    } catch(e: any) { setGenError(e.message || "خطأ غير معروف"); }
    setGenLoading(false);
  };

  // ── Refine Generated Image (Replicate) ────────────────────
  const refineWithReplicate = async () => {
    if (!refinePrompt.trim()) { setGenError("اكتب أمر التحسين"); return; }
    if (!generatedImage) { setGenError("ولّد صورة أولاً"); return; }

    setRefineLoading(true); setGenError("");
    try {
      const combinedPrompt = `${generatedImage.prompt}. Additional refinement: ${refinePrompt.trim()}. Ultra realistic, 8K, professional photography.`;
      const body: any = { prompt: combinedPrompt, aspect_ratio: "1:1", model: "pro", image_url: generatedImage.imageUrl };

      const res = await fetch(`${API_URL}/content-studio/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.detail || `خطأ ${res.status}`); }
      const data = await res.json();

      const iteration = {
        id: Date.now(),
        iteration: iterations.length + 1,
        prompt: combinedPrompt,
        refineNote: refinePrompt.trim(),
        scene: `تحسين: ${refinePrompt.substring(0,40)}`,
        imageUrl: data.image_url,
        isRefined: true,
        time: new Date().toLocaleTimeString("ar"),
      };
      setIterations(p => [iteration, ...p]);
      setGeneratedImage(iteration);
      setRefinePrompt("");
    } catch(e: any) { setGenError(e.message || "خطأ"); }
    setRefineLoading(false);
  };

    // ── Save Prompt to Library ─────────────────────────────────
  const saveToLibrary = () => {
    if (!savePromptName.trim() || !generatedImage) return;
    const lib = loadLib();
    const newPrompt = {
      id: `custom_${Date.now()}`,
      name: savePromptName.trim(),
      category,
      subCategory,
      type: activeType,
      typeLabel: TYPE_LABELS[activeType],
      tags: `custom,${category.toLowerCase()}`,
      prompt: generatedImage.prompt,
    };
    const saved = JSON.stringify([...lib, newPrompt]);
    try { localStorage.setItem("wesal_prompt_library", saved); } catch {}
    setSavePromptName(""); setShowSavePrompt(false);
    alert(`✅ تم حفظ "${newPrompt.name}" في المكتبة`);
  };
  const iStyle = { width:"100%", padding:"8px 10px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"8px", color:"var(--color-text-primary)", fontSize:"12px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  const types = [{k:"white",l:"خلفية بيضاء"},{k:"env",l:"بيئة واقعية"},{k:"dim",l:"مقاسات"}];

  return (
    <div style={{ fontFamily:"'Tajawal',sans-serif", direction:"rtl", minHeight:"100vh", background:"var(--color-background-tertiary)", color:"var(--color-text-primary)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ display:"flex", minHeight:"100vh" }}>
        {sidebarJSX}
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"260px 1fr", overflow:"hidden" }}>

          {/* ══ LEFT PANEL ══ */}
          <div style={{ background:"var(--color-background-secondary)", borderLeft:"0.5px solid var(--color-border-tertiary)", padding:"16px", overflowY:"auto", display:"flex", flexDirection:"column", gap:"12px" }}>

            <div>
              <h2 style={{ fontSize:"15px", fontWeight:"700", margin:"0 0 2px" }}>✨ Content Studio</h2>
              <p style={{ fontSize:"11px", color:"var(--color-text-tertiary)", margin:0 }}>توليد صور + تحليل Gemini AI</p>
            </div>

            {/* ── Gemini Stats Bar ── */}
            {(totalAnalyzed > 0) && (
              <div style={{ background:"linear-gradient(135deg,#1a73e8,#0d47a1)", borderRadius:"8px", padding:"8px 12px", display:"flex", justifyContent:"space-between" }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:"16px", fontWeight:"700", color:"#fff" }}>{totalAnalyzed}</div>
                  <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.7)" }}>صورة محللة</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:"16px", fontWeight:"700", color:"#fff" }}>${totalCost.toFixed(3)}</div>
                  <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.7)" }}>تكلفة تقريبية</div>
                </div>
              </div>
            )}

            {/* ── Image Upload ── */}
            <div>
              <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 5px", fontWeight:"500" }}>صورة المنتج</p>
              {imagePreview ? (
                <div style={{ position:"relative" }}>
                  <img src={imagePreview} alt="" style={{ width:"100%", height:"130px", objectFit:"contain", background:"var(--color-background-primary)", borderRadius:"8px", border:"0.5px solid var(--color-border-tertiary)" }} />
                  <button onClick={() => { setImagePreview(null); setImageBase64(null); setGeminiResult(null); setEditableResult(null); }}
                    style={{ position:"absolute", top:5, left:5, width:20, height:20, background:"#fdeaea", border:"0.5px solid #f8d0d0", borderRadius:"50%", color:"#e24b4a", cursor:"pointer", fontSize:"10px", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                </div>
              ) : (
                <div onClick={() => fileRef.current?.click()} style={{ border:"1.5px dashed var(--color-border-secondary)", borderRadius:"8px", padding:"16px", textAlign:"center", cursor:"pointer", background:"var(--color-background-primary)" }}>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }} />
                  <div style={{ fontSize:"22px", marginBottom:"4px" }}>📷</div>
                  <div style={{ fontSize:"11px", color:"var(--color-text-secondary)" }}>ارفع صورة المنتج</div>
                </div>
              )}
            </div>

            {/* ── URL Input ── */}
            <div>
              <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 4px", fontWeight:"500" }}>أو رابط الصورة</p>
              <input value={imageUrl} onChange={e => { setImageUrl(e.target.value); setGeminiResult(null); }} placeholder="https://..." style={{ ...iStyle, direction:"ltr", textAlign:"left" }} />
            </div>

            {/* ── Gemini Analyze Button ── */}
            {(imagePreview || imageUrl) && (
              <div style={{ background:"linear-gradient(135deg,#e8f0fe,#d2e3fc)", border:"0.5px solid #4285f4", borderRadius:"10px", padding:"10px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px" }}>
                  <span style={{ fontSize:"12px", fontWeight:"700", color:"#1a73e8" }}>🤖 Gemini Vision</span>
                  <button onClick={() => setShowGeminiSettings(s => !s)} style={{ fontSize:"9px", padding:"2px 7px", background:"rgba(26,115,232,0.1)", border:"0.5px solid #4285f4", borderRadius:"5px", color:"#1a73e8", cursor:"pointer", fontFamily:"inherit" }}>
                    ⚙️ إعدادات
                  </button>
                </div>

                {/* Gemini Settings Panel */}
                {showGeminiSettings && (
                  <div style={{ background:"#fff", borderRadius:"8px", padding:"8px", marginBottom:"8px", border:"0.5px solid #4285f4" }}>
                    <p style={{ fontSize:"10px", color:"#555", margin:"0 0 5px", fontWeight:"600" }}>🔑 Gemini API Key</p>
                    <input
                      type="password"
                      value={geminiKeyInput}
                      onChange={e => setGeminiKeyInput(e.target.value)}
                      placeholder="AIza..."
                      style={{ ...iStyle, fontSize:"11px", direction:"ltr", marginBottom:"5px" }}
                    />
                    <div style={{ display:"flex", gap:"5px" }}>
                      <button onClick={saveGeminiKey} style={{ flex:1, padding:"5px", background:"#1a73e8", border:"none", borderRadius:"6px", color:"#fff", fontSize:"10px", cursor:"pointer", fontFamily:"inherit" }}>
                        {geminiKeySaved ? "✅ تم الحفظ" : "💾 حفظ"}
                      </button>
                      <button onClick={clearGeminiKey} style={{ padding:"5px 8px", background:"#fdeaea", border:"0.5px solid #f8d0d0", borderRadius:"6px", color:"#e24b4a", fontSize:"10px", cursor:"pointer", fontFamily:"inherit" }}>
                        🗑️
                      </button>
                    </div>
                    <p style={{ fontSize:"9px", color:"#888", margin:"5px 0 0" }}>
                      🔒 يُحفظ في Session فقط — لا يُرسل للسيرفر
                    </p>
                    <div style={{ display:"flex", alignItems:"center", gap:"5px", marginTop:"6px" }}>
                      <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} id="overwrite" style={{ cursor:"pointer" }} />
                      <label htmlFor="overwrite" style={{ fontSize:"10px", color:"#555", cursor:"pointer" }}>Overwrite — استبدال البيانات الموجودة</label>
                    </div>
                  </div>
                )}

                <button onClick={() => analyzeWithGemini(false)} disabled={geminiLoading}
                  style={{ width:"100%", padding:"9px", background:geminiLoading?"#b0c8f8":"linear-gradient(135deg,#1a73e8,#0d47a1)", border:"none", borderRadius:"8px", color:"#fff", fontSize:"12px", fontWeight:"700", cursor:geminiLoading?"not-allowed":"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
                  {geminiLoading ? (
                    <><div style={{ width:14, height:14, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />جاري التحليل...</>
                  ) : "🔍 تحليل بالذكاء الاصطناعي"}
                </button>

                {geminiError && (
                  <div style={{ marginTop:"6px", background:"#fdeaea", border:"0.5px solid #f8d0d0", borderRadius:"7px", padding:"7px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:"10px", color:"#c62828" }}>⚠️ {geminiError}</span>
                    <button onClick={() => analyzeWithGemini(true)} style={{ fontSize:"9px", padding:"2px 7px", background:"#e24b4a", border:"none", borderRadius:"4px", color:"#fff", cursor:"pointer", fontFamily:"inherit" }}>إعادة</button>
                  </div>
                )}

                {geminiResult && !geminiLoading && (
                  <div style={{ marginTop:"6px", background:"#e8f5e9", border:"0.5px solid #a5d6a7", borderRadius:"7px", padding:"6px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:"10px", color:"#2e7d32" }}>✅ تم التحليل — دقة {geminiResult.confidence_score}%</span>
                    <button onClick={() => setShowGeminiResult(true)} style={{ fontSize:"9px", padding:"2px 7px", background:"#2e7d32", border:"none", borderRadius:"4px", color:"#fff", cursor:"pointer", fontFamily:"inherit" }}>عرض</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Category ── */}
            <div>
              <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 4px", fontWeight:"500" }}>فئة المنتج</p>
              <select value={category} onChange={e => { setCategory(e.target.value); setSubCategory("عامة"); }} style={iStyle}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* ── Sub Category ── */}
            {CATEGORY_TREE[category]?.length > 1 && (
              <div>
                <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 4px", fontWeight:"500" }}>التصنيف الفرعي</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:"4px" }}>
                  {CATEGORY_TREE[category].map(sub => (
                    <button key={sub} onClick={() => setSubCategory(sub)}
                      style={{ padding:"4px 10px", fontSize:"10px", background:subCategory===sub?"#534AB7":"var(--color-background-primary)", border:`0.5px solid ${subCategory===sub?"#534AB7":"var(--color-border-secondary)"}`, borderRadius:"20px", color:subCategory===sub?"#EEEDFE":"var(--color-text-secondary)", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Output Type ── */}
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

            {/* ── Prompt Dropdown ── */}
            <div>
              <p style={{ fontSize:"11px", color:"var(--color-text-secondary)", margin:"0 0 4px", fontWeight:"500" }}>اختر Prompt</p>
              {promptsForSelection.length > 0 ? (
                <select value={selectedPromptId} onChange={e => setSelectedPromptId(e.target.value)} style={iStyle}>
                  {promptsForSelection.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <div style={{ padding:"8px 10px", background:"#FCEBEB", border:"0.5px solid #F7C1C1", borderRadius:"8px", fontSize:"11px", color:"#A32D2D" }}>لا يوجد Prompt — أضفه في مكتبة الأوامر</div>
              )}
            </div>

            {/* ── Custom Prompt ── */}
            <div style={{ background:"#fffbf0", border:"0.5px solid #f0e0b0", borderRadius:"8px", padding:"8px 10px" }}>
              <p style={{ fontSize:"11px", color:"#a07010", margin:"0 0 4px", fontWeight:"600" }}>⚡ إضافة مخصصة</p>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={2} placeholder="ultra realistic, 8K..." style={{ ...iStyle, resize:"none", fontSize:"11px", direction:"ltr", textAlign:"left" }} />
            </div>

            {/* ── Generate Button ── */}
            <button onClick={generateWithReplicate} disabled={genLoading || !selectedPromptId || (!imageBase64 && !imageUrl)}
              style={{ width:"100%", padding:"11px", background:genLoading||!selectedPromptId?"#e0e0f0":"linear-gradient(135deg,#1a73e8,#0d47a1)", border:"none", borderRadius:"9px", color:genLoading||!selectedPromptId?"#9090c0":"#fff", fontSize:"13px", fontWeight:"700", cursor:genLoading||!selectedPromptId?"not-allowed":"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
              {genLoading ? <><div style={{ width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.8s linear infinite" }} />جاري التوليد...</> : "🎨 ولّد الصورة بـ FLUX"}
            </button>

          </div>

          {/* ══ RIGHT PANEL ══ */}
          <div style={{ padding:"20px", overflowY:"auto", background:"var(--color-background-tertiary)", display:"flex", flexDirection:"column", gap:"20px" }}>

            {/* ── Generation Result + Refinement Loop ── */}
            {(generatedImage || genLoading || genError) && (
              <div style={{ background:"var(--color-background-primary)", border:"0.5px solid #1a73e8", borderRadius:"14px", padding:"16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px" }}>
                  <p style={{ fontSize:"13px", fontWeight:"700", color:"#1a73e8", margin:0 }}>🎨 نتيجة التوليد</p>
                  {iterations.length > 0 && <span style={{ fontSize:"11px", background:"#e8f0fe", color:"#1a73e8", padding:"2px 8px", borderRadius:"10px" }}>{iterations.length} تكرار</span>}
                </div>

                {/* Generated Image Preview */}
                {generatedImage && (
                  <div style={{ marginBottom:"12px" }}>
                    <div style={{ background:"var(--color-background-secondary)", borderRadius:"10px", padding:"10px", marginBottom:"8px", border:"0.5px solid var(--color-border-tertiary)" }}>
                      <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"0 0 8px" }}>
                        {generatedImage.isRefined ? `✨ تحسين ${generatedImage.iteration}: ${generatedImage.refineNote}` : `🎨 ${generatedImage.scene}`}
                      </p>
                      {/* الصورة المولدة */}
                      <img src={generatedImage.imageUrl} alt="generated"
                        style={{ width:"100%", borderRadius:"10px", border:"0.5px solid var(--color-border-tertiary)", display:"block", marginBottom:"8px" }}
                        onError={(e) => { (e.target as any).style.display="none"; }} />
                      {/* زر تحميل */}
                      <a href={generatedImage.imageUrl} download={`wesal_${generatedImage.id}.jpg`} target="_blank" rel="noopener noreferrer"
                        style={{ display:"block", textAlign:"center", padding:"7px", background:"#1D9E75", borderRadius:"7px", color:"#fff", fontSize:"11px", fontWeight:"600", textDecoration:"none", marginBottom:"8px" }}>
                        ⬇️ تحميل الصورة
                      </a>
                      <div style={{ background:"#f0f4ff", borderRadius:"8px", padding:"8px", border:"0.5px dashed #4285f4" }}>
                        <p style={{ fontSize:"9px", color:"#1a73e8", margin:0, direction:"ltr", textAlign:"left", lineHeight:"1.5" }}>{generatedImage.prompt.substring(0,150)}...</p>
                      </div>
                    </div>

                    {/* Iteration History */}
                    {iterations.length > 1 && (
                      <div style={{ display:"flex", gap:"6px", overflowX:"auto", paddingBottom:"4px", marginBottom:"8px" }}>
                        {iterations.map((it, i) => (
                          <div key={it.id} onClick={() => setGeneratedImage(it)}
                            style={{ flexShrink:0, padding:"5px 10px", background:generatedImage.id===it.id?"#1a73e8":"var(--color-background-secondary)", border:`0.5px solid ${generatedImage.id===it.id?"#1a73e8":"var(--color-border-secondary)"}`, borderRadius:"20px", cursor:"pointer", whiteSpace:"nowrap" }}>
                            <span style={{ fontSize:"10px", color:generatedImage.id===it.id?"#fff":"var(--color-text-secondary)" }}>
                              {it.isRefined ? `✨ #${it.iteration}` : "🎨 أصل"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {genError && (
                  <div style={{ background:"#fdeaea", border:"0.5px solid #f8d0d0", borderRadius:"8px", padding:"8px 12px", marginBottom:"10px" }}>
                    <p style={{ fontSize:"11px", color:"#c62828", margin:0 }}>⚠️ {genError}</p>
                  </div>
                )}

                {/* Refine Panel */}
                {generatedImage && (
                  <div style={{ borderTop:"0.5px solid var(--color-border-tertiary)", paddingTop:"12px" }}>
                    <p style={{ fontSize:"12px", fontWeight:"600", margin:"0 0 8px", color:"#7c3aed" }}>✨ تحسين الصورة</p>

                    {/* Quick Presets */}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"5px", marginBottom:"8px" }}>
                      {REFINE_PRESETS.map(p => (
                        <button key={p.label} onClick={() => setRefinePrompt(p.v)}
                          style={{ padding:"4px 9px", fontSize:"10px", background:refinePrompt===p.v?"#ede9fe":"var(--color-background-secondary)", border:`0.5px solid ${refinePrompt===p.v?"#7c3aed":"var(--color-border-secondary)"}`, borderRadius:"20px", color:refinePrompt===p.v?"#7c3aed":"var(--color-text-secondary)", cursor:"pointer", fontFamily:"inherit" }}>
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {/* Custom Refine + Button */}
                    <div style={{ display:"flex", gap:"6px" }}>
                      <input value={refinePrompt} onChange={e => setRefinePrompt(e.target.value)}
                        placeholder="أضف أمر تحسين مخصص بالإنجليزي..."
                        onKeyDown={e => e.key==="Enter" && refineWithReplicate()}
                        style={{ flex:1, padding:"8px 10px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"8px", fontSize:"11px", color:"var(--color-text-primary)", fontFamily:"inherit", outline:"none", direction:"ltr", textAlign:"left" }} />
                      <button onClick={refineWithReplicate} disabled={refineLoading || !refinePrompt.trim()}
                        style={{ padding:"8px 14px", background:refineLoading||!refinePrompt.trim()?"#e0e0f0":"linear-gradient(135deg,#7c3aed,#6d28d9)", border:"none", borderRadius:"8px", color:refineLoading||!refinePrompt.trim()?"#9090c0":"#fff", fontSize:"12px", fontWeight:"600", cursor:refineLoading||!refinePrompt.trim()?"not-allowed":"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                        {refineLoading ? "⏳" : "✨ حسّن"}
                      </button>
                    </div>

                    {/* Save to Library */}
                    <div style={{ marginTop:"10px" }}>
                      {!showSavePrompt ? (
                        <button onClick={() => { setShowSavePrompt(true); setSavePromptName(selectedPrompt?.name ? `${selectedPrompt.name} — محسّن` : ""); }}
                          style={{ width:"100%", padding:"7px", background:"var(--color-background-secondary)", border:"0.5px solid #1D9E75", borderRadius:"8px", color:"#1D9E75", fontSize:"11px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" }}>
                          💾 احفظ هذا الـ Prompt في المكتبة
                        </button>
                      ) : (
                        <div style={{ display:"flex", gap:"6px" }}>
                          <input value={savePromptName} onChange={e => setSavePromptName(e.target.value)} placeholder="اسم الـ Prompt..."
                            style={{ flex:1, padding:"7px 10px", background:"var(--color-background-secondary)", border:"0.5px solid #1D9E75", borderRadius:"8px", fontSize:"11px", color:"var(--color-text-primary)", fontFamily:"inherit", outline:"none" }} />
                          <button onClick={saveToLibrary} style={{ padding:"7px 12px", background:"#1D9E75", border:"none", borderRadius:"8px", color:"#fff", fontSize:"11px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" }}>حفظ</button>
                          <button onClick={() => setShowSavePrompt(false)} style={{ padding:"7px 10px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"8px", color:"var(--color-text-secondary)", fontSize:"11px", cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Gemini History */}
            {geminiHistory.length > 0 && (
              <div style={{ background:"var(--color-background-primary)", border:"0.5px solid #4285f4", borderRadius:"12px", padding:"14px" }}>
                <p style={{ fontSize:"13px", fontWeight:"700", color:"#1a73e8", margin:"0 0 10px" }}>🤖 آخر تحليلات Gemini</p>
                <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                  {geminiHistory.slice(0,5).map(h => (
                    <div key={h.id} onClick={() => { setGeminiResult(h.result); setEditableResult({...h.result}); setShowGeminiResult(true); }}
                      style={{ display:"flex", alignItems:"center", gap:"10px", padding:"7px 10px", background:"var(--color-background-secondary)", borderRadius:"8px", cursor:"pointer", border:"0.5px solid var(--color-border-tertiary)" }}>
                      <img src={h.url} alt="" style={{ width:38, height:38, objectFit:"cover", borderRadius:"6px", flexShrink:0 }} onError={e => e.target.style.display="none"} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:"12px", fontWeight:"500", margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.result?.title_ar || h.result?.title_en || "منتج"}</p>
                        <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:0 }}>{h.result?.category} — دقة {h.result?.confidence_score}% — {h.time}</p>
                      </div>
                      {h.result?.needs_review && <span style={{ fontSize:"9px", background:"#fff3e0", color:"#e65100", padding:"2px 6px", borderRadius:"4px", flexShrink:0 }}>مراجعة</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}


            {history.length > 0 && (
              <div>
                <p style={{ fontSize:"13px", fontWeight:"600", margin:"0 0 10px" }}>آخر المخرجات</p>
                <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                  {history.slice(0,8).map(h => (
                    <div key={h.id} style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"9px", padding:"8px 12px", display:"flex", alignItems:"center", gap:"10px", cursor:"pointer" }} onClick={() => setHistoryModal(h)}>
                      <img src={h.imageUrl} alt="" style={{ width:42, height:42, borderRadius:"6px", objectFit:"cover", border:"0.5px solid var(--color-border-tertiary)", flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:"12px", fontWeight:"500", margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.promptName}</p>
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

            {!imageBase64 && !imageUrl && history.length === 0 && geminiHistory.length === 0 && (
              <div style={{ textAlign:"center", padding:"60px 0", color:"var(--color-text-tertiary)" }}>
                <div style={{ fontSize:"44px", marginBottom:"12px", opacity:0.3 }}>🎨</div>
                <p style={{ fontSize:"13px", margin:"0 0 4px" }}>ارفع صورة المنتج واختر الـ Prompt</p>
                <p style={{ fontSize:"11px", color:"var(--color-text-tertiary)", margin:0 }}>أو أدخل رابط الصورة وحلّلها بـ Gemini AI 🤖</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ IMAGE MODAL ══ */}
      {historyModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setHistoryModal(null)}>
          <div style={{ background:"var(--color-background-primary)", borderRadius:"12px", padding:"16px", maxWidth:"600px", width:"90%", position:"relative" }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
              <p style={{ fontSize:"13px", fontWeight:"600", margin:0 }}>{historyModal.promptName}</p>
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

      {/* ══ GEMINI RESULT MODAL ══ */}
      {showGeminiResult && geminiResult && editableResult && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1100 }} onClick={() => setShowGeminiResult(false)}>
          <div style={{ background:"var(--color-background-primary)", borderRadius:"14px", padding:"20px", maxWidth:"700px", width:"94%", maxHeight:"90vh", overflowY:"auto", position:"relative", animation:"fadeIn 0.2s ease" }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
              <div>
                <h3 style={{ fontSize:"15px", fontWeight:"700", margin:"0 0 2px", color:"#1a73e8" }}>🤖 نتيجة Gemini Vision</h3>
                <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                  <span style={{ fontSize:"11px", padding:"2px 8px", background:geminiResult.confidence_score>=80?"#e8f5e9":geminiResult.confidence_score>=60?"#fff3e0":"#fdeaea", color:geminiResult.confidence_score>=80?"#2e7d32":geminiResult.confidence_score>=60?"#e65100":"#c62828", borderRadius:"10px" }}>
                    دقة {geminiResult.confidence_score}%
                  </span>
                  {geminiResult.needs_review && <span style={{ fontSize:"11px", padding:"2px 8px", background:"#fff3e0", color:"#e65100", borderRadius:"10px" }}>⚠️ تحتاج مراجعة</span>}
                </div>
              </div>
              <button onClick={() => setShowGeminiResult(false)} style={{ width:28, height:28, background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"50%", cursor:"pointer", fontSize:"13px", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>

            {/* Fields Grid */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"12px" }}>
              {[
                ["الفئة", "category"], ["نوع المنتج", "product_type"],
                ["العنوان العربي", "title_ar"], ["العنوان الإنجليزي", "title_en"],
                ["اللون", "color"], ["الخامة الأساسية", "primary_material"],
                ["الخامة الثانوية", "secondary_material"], ["الأسلوب", "style"],
              ].map(([label, key]) => (
                <div key={key}>
                  <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"0 0 3px" }}>{label}</p>
                  <input value={editableResult[key] || ""} onChange={e => setEditableResult(r => ({ ...r, [key]: e.target.value }))}
                    style={{ width:"100%", padding:"6px 8px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"6px", fontSize:"12px", color:"var(--color-text-primary)", fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
                </div>
              ))}
            </div>

            {/* Descriptions */}
            {[["الوصف العربي", "description_ar"], ["الوصف الإنجليزي", "description_en"], ["كابشن عربي", "social_caption_ar"], ["كابشن إنجليزي", "social_caption_en"]].map(([label, key]) => (
              <div key={key} style={{ marginBottom:"8px" }}>
                <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"0 0 3px" }}>{label}</p>
                <textarea value={editableResult[key] || ""} onChange={e => setEditableResult(r => ({ ...r, [key]: e.target.value }))} rows={2}
                  style={{ width:"100%", padding:"6px 8px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"6px", fontSize:"12px", color:"var(--color-text-primary)", fontFamily:"inherit", outline:"none", resize:"vertical", boxSizing:"border-box" }} />
              </div>
            ))}

            {/* Features */}
            <div style={{ marginBottom:"8px" }}>
              <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"0 0 5px" }}>المميزات</p>
              <div style={{ display:"flex", flexDirection:"column", gap:"5px" }}>
                {(editableResult.features || []).map((f, i) => (
                  <div key={i} style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                    <span style={{ fontSize:"12px", color:"#1a73e8" }}>•</span>
                    <input value={f} onChange={e => {
                      const nf = [...(editableResult.features || [])]; nf[i] = e.target.value;
                      setEditableResult(r => ({ ...r, features: nf }));
                    }} style={{ flex:1, padding:"5px 8px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"6px", fontSize:"12px", color:"var(--color-text-primary)", fontFamily:"inherit", outline:"none" }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Lifestyle Prompt */}
            <div style={{ marginBottom:"12px" }}>
              <p style={{ fontSize:"10px", color:"var(--color-text-tertiary)", margin:"0 0 3px" }}>Lifestyle AI Prompt</p>
              <textarea value={editableResult.lifestyle_prompt || ""} onChange={e => setEditableResult(r => ({ ...r, lifestyle_prompt: e.target.value }))} rows={2}
                style={{ width:"100%", padding:"6px 8px", background:"#e8f0fe", border:"0.5px solid #4285f4", borderRadius:"6px", fontSize:"11px", color:"#1a73e8", fontFamily:"inherit", outline:"none", resize:"vertical", direction:"ltr", textAlign:"left", boxSizing:"border-box" }} />
            </div>

            {/* Actions */}
            <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end" }}>
              <button onClick={() => navigator.clipboard.writeText(JSON.stringify(editableResult, null, 2))}
                style={{ padding:"7px 14px", background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-secondary)", borderRadius:"8px", fontSize:"11px", cursor:"pointer", color:"var(--color-text-secondary)", fontFamily:"inherit" }}>
                📋 نسخ JSON
              </button>
              <button onClick={() => setShowGeminiResult(false)}
                style={{ padding:"7px 18px", background:"linear-gradient(135deg,#1a73e8,#0d47a1)", border:"none", borderRadius:"8px", fontSize:"11px", cursor:"pointer", color:"#fff", fontWeight:"600", fontFamily:"inherit" }}>
                ✅ تم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
