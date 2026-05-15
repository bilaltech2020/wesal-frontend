// @ts-nocheck
"use client";
import { useState } from "react";

interface ReportsViewProps {
  sidebarJSX: React.ReactNode;
  erpData: any;
  timePeriod: number;
  setTimePeriod: (n: number) => void;
  fetchKpis: (period?: string) => void;
  reportChat: { role: "user" | "assistant"; text: string }[];
  reportChatInput: string;
  setReportChatInput: (s: string) => void;
  reportChatLoading: boolean;
  sendReportChat: () => void;
}

export default function ReportsView({
  sidebarJSX, erpData, timePeriod, setTimePeriod, fetchKpis,
  reportChat, reportChatInput, setReportChatInput, reportChatLoading, sendReportChat
}: ReportsViewProps) {
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
