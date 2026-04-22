import { useState, useRef } from "react";

const SYSTEM_PROMPT = `You are an AI Competitor Monitoring and Product Intelligence Agent specialized in e-commerce product tracking, matching, and competitor analysis.

Your mission is to search, monitor, and extract product data from competitor websites based on multiple input types, and return structured, accurate, and actionable results.

SUPPORTED INPUT TYPES:
1. Brand or keyword (example: "Otath sofa")
2. SKU (example: WA-CT-102)
3. Product image URL
4. Mixed input (image + SKU + title)
5. Target websites (example: Noon, Home Centre, otath.com)

For each product found, return a JSON array with this exact structure:
[
  {
    "platform": "Noon",
    "title": "Product name here",
    "url": "https://...",
    "price": "SAR 1,299",
    "discount": "10% off",
    "availability": "In Stock",
    "category": "Sofas",
    "sku": "SKU if visible",
    "match_type": "Very Close Match",
    "confidence": 85,
    "match_reason": "Same category, similar structure and material",
    "notes": "Color differs: white vs beige",
    "price_recommendation": "maintain",
    "price_rec_reason": "Competitor price is similar"
  }
]

RULES:
- If competitor out of stock → set price_recommendation to "increase"
- If competitor price lower → set price_recommendation to "review"  
- If competitor price higher → set price_recommendation to "increase"
- match_type: "Exact Match" | "Very Close Match" | "Similar Product" | "Weak Match"
- confidence: 0-100
- availability: "In Stock" | "Out of Stock" | "Limited"
- price_recommendation: "increase" | "decrease" | "maintain" | "review" | "unknown"
- Return ONLY valid JSON array, no markdown, no explanation
- If nothing found: return []`;

const confColor = (c) => c >= 90 ? "#4ade80" : c >= 75 ? "#fbbf24" : c >= 60 ? "#fb923c" : "#f87171";
const recColor  = (r) => r === "increase" ? "#4ade80" : r === "decrease" ? "#f87171" : r === "review" ? "#fbbf24" : "#888";
const recLabel  = (r) => r === "increase" ? "↑ ارفع السعر" : r === "decrease" ? "↓ خفض السعر" : r === "review" ? "⚠ راجع السعر" : r === "maintain" ? "← حافظ" : "—";
const availColor = (a) => a === "In Stock" ? "#4ade80" : a === "Out of Stock" ? "#f87171" : "#fbbf24";

export default function CompetitorAgent() {
  const [query, setQuery]         = useState("");
  const [sites, setSites]         = useState("");
  const [ourPrice, setOurPrice]   = useState("");
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState([]);
  const [error, setError]         = useState("");
  const [searched, setSearched]   = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const inputRef = useRef(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResults([]); setSearched(false);

    const userMsg = `Search query: "${query}"
Target websites: ${sites || "Noon, Home Centre, Amazon.sa"}
Our current price: ${ourPrice ? "SAR " + ourPrice : "not provided"}

Find all matching products and return JSON analysis.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMsg }],
        }),
      });
      const data = await res.json();
      const raw  = data.content?.[0]?.text?.trim() || "[]";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setResults(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      setError("خطأ في الاتصال بالـ AI — تأكد من الاتصال وأعد المحاولة");
    }
    setLoading(false);
    setSearched(true);
  };

  const tabs = [
    { k: "all",      l: `الكل (${results.length})` },
    { k: "exact",    l: `مطابق (${results.filter(r => r.confidence >= 90).length})` },
    { k: "outstock", l: `نافذ (${results.filter(r => r.availability === "Out of Stock").length})` },
    { k: "increase", l: `ارفع السعر (${results.filter(r => r.price_recommendation === "increase").length})` },
  ];

  const filtered = results.filter(r => {
    if (activeTab === "exact")    return r.confidence >= 90;
    if (activeTab === "outstock") return r.availability === "Out of Stock";
    if (activeTab === "increase") return r.price_recommendation === "increase";
    return true;
  });

  const exactCount    = results.filter(r => r.confidence >= 90).length;
  const outStockCount = results.filter(r => r.availability === "Out of Stock").length;
  const increaseCount = results.filter(r => r.price_recommendation === "increase").length;

  return (
    <div style={{ fontFamily: "'Tajawal', sans-serif", direction: "rtl", background: "#080810", minHeight: "600px", color: "#e2e2f0", padding: "0" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f0f1e 0%, #1a0a2e 100%)", borderBottom: "1px solid #1e1e3a", padding: "24px 28px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
          <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #7c3aed, #2563eb)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🔍</div>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: "800", margin: 0, color: "#fff" }}>مراقبة المنافسين AI</h1>
            <p style={{ fontSize: "12px", color: "#6060a0", margin: 0 }}>ابحث عن منتجاتك عند المنافسين بالذكاء الاصطناعي</p>
          </div>
        </div>

        {/* Search inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="اسم المنتج أو SKU أو رابط صورة... (مثال: سرير خشبي مودرن)"
              style={{ flex: 1, padding: "11px 16px", background: "#0d0d20", border: "1px solid #2a2a4e", borderRadius: "10px", color: "#e2e2f0", fontSize: "13px", outline: "none", fontFamily: "inherit" }}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              style={{ padding: "11px 22px", background: loading ? "#2a2a4e" : "linear-gradient(135deg, #7c3aed, #2563eb)", border: "none", borderRadius: "10px", color: loading ? "#666" : "#fff", fontSize: "14px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {loading ? "جاري البحث..." : "ابحث ←"}
            </button>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              value={sites}
              onChange={e => setSites(e.target.value)}
              placeholder="المواقع (مثال: noon.com, homecenter.com.sa, otath.com)"
              style={{ flex: 2, padding: "9px 14px", background: "#0d0d20", border: "1px solid #1e1e3a", borderRadius: "8px", color: "#9090c0", fontSize: "12px", outline: "none", fontFamily: "inherit", direction: "ltr", textAlign: "left" }}
            />
            <input
              value={ourPrice}
              onChange={e => setOurPrice(e.target.value)}
              placeholder="سعرنا (ر.س)"
              style={{ flex: 1, padding: "9px 14px", background: "#0d0d20", border: "1px solid #1e1e3a", borderRadius: "8px", color: "#9090c0", fontSize: "12px", outline: "none", fontFamily: "inherit" }}
            />
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #1e1e3a", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{ color: "#6060a0", fontSize: "13px" }}>Claude يبحث في المواقع المحددة...</p>
        </div>
      )}

      {/* Error */}
      {error && <div style={{ margin: "16px 20px", padding: "12px 16px", background: "#1f0d0d", border: "1px solid #3a1a1a", borderRadius: "10px", color: "#f87171", fontSize: "13px" }}>⚠ {error}</div>}

      {/* Stats */}
      {searched && !loading && results.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", padding: "16px 20px 0" }}>
          {[
            { l: "إجمالي النتائج", v: results.length, c: "#a78bfa" },
            { l: "مطابق تام",       v: exactCount,    c: "#4ade80" },
            { l: "نافذ عند المنافس", v: outStockCount, c: "#f87171" },
            { l: "ارفع السعر",      v: increaseCount, c: "#fbbf24" },
          ].map(s => (
            <div key={s.l} style={{ background: "#0d0d20", border: "1px solid #1e1e3a", borderRadius: "10px", padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: "22px", fontWeight: "800", color: s.c }}>{s.v}</div>
              <div style={{ fontSize: "11px", color: "#6060a0", marginTop: "3px" }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {searched && !loading && results.length > 0 && (
        <div style={{ display: "flex", borderBottom: "1px solid #1e1e3a", margin: "14px 20px 0", gap: "0" }}>
          {tabs.map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)}
              style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: activeTab === t.k ? "2px solid #7c3aed" : "2px solid transparent", color: activeTab === t.k ? "#a78bfa" : "#6060a0", fontSize: "12px", fontWeight: activeTab === t.k ? "700" : "400", cursor: "pointer", fontFamily: "inherit", marginBottom: "-1px" }}>
              {t.l}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {searched && !loading && (
        <div style={{ padding: "12px 20px 24px" }}>
          {filtered.length === 0 && results.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔍</div>
              <p style={{ color: "#6060a0", fontSize: "14px" }}>لم يُعثر على نتائج — جرب كلمة بحث مختلفة</p>
            </div>
          )}
          {filtered.map((r, i) => (
            <div key={i} style={{ background: "#0d0d20", border: "1px solid #1e1e3a", borderRadius: "12px", marginBottom: "10px", overflow: "hidden" }}>
              {/* Row main */}
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 120px 110px 90px 70px", alignItems: "center", padding: "12px 16px", gap: "12px" }}>
                {/* Platform */}
                <div>
                  <div style={{ fontSize: "11px", padding: "3px 8px", background: "#1a1a3a", color: "#a78bfa", borderRadius: "6px", textAlign: "center", fontWeight: "600", marginBottom: "4px" }}>{r.platform || "—"}</div>
                  <div style={{ fontSize: "10px", color: "#4040a0", textAlign: "center" }}>{r.category || ""}</div>
                </div>
                {/* Title + match */}
                <div>
                  <div style={{ fontSize: "13px", color: "#e2e2f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>{r.title || "—"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "10px", color: confColor(r.confidence || 0) }}>{r.match_type || "—"}</span>
                    <span style={{ fontSize: "10px", color: "#3030a0" }}>·</span>
                    <span style={{ fontSize: "10px", color: "#5050a0" }}>{r.match_reason || ""}</span>
                  </div>
                </div>
                {/* Price */}
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: "#a78bfa" }}>{r.price || "—"}</div>
                  {r.discount && <div style={{ fontSize: "10px", color: "#4ade80" }}>{r.discount}</div>}
                </div>
                {/* Availability */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", background: availColor(r.availability) + "15", color: availColor(r.availability), border: `1px solid ${availColor(r.availability)}30` }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                  {r.availability === "In Stock" ? "متوفر" : r.availability === "Out of Stock" ? "نافذ" : r.availability || "—"}
                </span>
                {/* Confidence */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: confColor(r.confidence || 0) }}>{r.confidence || 0}</div>
                  <div style={{ fontSize: "10px", color: "#4040a0" }}>confidence</div>
                </div>
                {/* Link */}
                {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#6060e0", textDecoration: "none", textAlign: "center" }}>فتح ↗</a> : <span style={{ color: "#333" }}>—</span>}
              </div>

              {/* Price recommendation bar */}
              {r.price_recommendation && r.price_recommendation !== "unknown" && (
                <div style={{ padding: "6px 16px 10px", display: "flex", alignItems: "center", gap: "8px", borderTop: "1px solid #141428" }}>
                  <span style={{ fontSize: "10px", color: "#4040a0" }}>توصية:</span>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: recColor(r.price_recommendation), padding: "2px 10px", background: recColor(r.price_recommendation) + "15", borderRadius: "20px" }}>
                    {recLabel(r.price_recommendation)}
                  </span>
                  {r.price_rec_reason && <span style={{ fontSize: "10px", color: "#5050a0" }}>{r.price_rec_reason}</span>}
                  {r.notes && <span style={{ fontSize: "10px", color: "#3030a0", marginRight: "auto" }}>ملاحظة: {r.notes}</span>}
                </div>
              )}
            </div>
          ))}

          {/* Export button */}
          {results.length > 0 && (
            <button
              onClick={() => {
                const csv = ["المنصة,اسم المنتج,السعر,التوفر,نوع المطابقة,الثقة,التوصية,الرابط",
                  ...results.map(r => `"${r.platform}","${r.title}","${r.price}","${r.availability}","${r.match_type}","${r.confidence}","${r.price_recommendation}","${r.url}"`)
                ].join("\n");
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                a.download = "competitor_analysis.csv"; a.click();
              }}
              style={{ padding: "10px 20px", background: "#0d0d20", border: "1px solid #1e3a1e", borderRadius: "10px", color: "#4ade80", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", marginTop: "8px" }}>
              تصدير CSV ↓
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {!searched && !loading && (
        <div style={{ padding: "48px 28px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.3 }}>🔍</div>
          <p style={{ color: "#4040a0", fontSize: "14px", marginBottom: "8px" }}>أدخل اسم المنتج أو SKU وحدد المواقع</p>
          <p style={{ color: "#2a2a60", fontSize: "12px" }}>مثال: "سرير خشبي مودرن 180x200" — Noon, homecenter.com.sa</p>
        </div>
      )}
    </div>
  );
}
