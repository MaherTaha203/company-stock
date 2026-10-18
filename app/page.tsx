"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Item = {
  id: string; code: string; name: string; unit: string;
  opening_quantity: number; incoming_quantity: number;
  outgoing_quantity: number; current_quantity: number;
};
type Movement = {
  id: string; item_id: string; movement_type: "in" | "out";
  quantity: number; movement_date: string; notes: string | null;
  items?: { name: string; code: string; unit: string } | null;
};
type Tab = "dashboard" | "in" | "out" | "items" | "movements";
type PendingMovementRequest = { id: string; fingerprint: string };
const PENDING_MOVEMENT_STORAGE_KEY = "company-stock-pending-movement";
function readPendingMovementRequest(): PendingMovementRequest | null {
  try {
    const value = window.sessionStorage.getItem(PENDING_MOVEMENT_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (typeof parsed?.id === "string" && typeof parsed?.fingerprint === "string") return parsed;
  } catch {}
  return null;
}
function storePendingMovementRequest(value: PendingMovementRequest | null) {
  try {
    if (value) window.sessionStorage.setItem(PENDING_MOVEMENT_STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(PENDING_MOVEMENT_STORAGE_KEY);
  } catch {}
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function Home() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [items, setItems] = useState<Item[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [formItem, setFormItem] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formDate, setFormDate] = useState(today());
  const [formNotes, setFormNotes] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("حبة");
  const [opening, setOpening] = useState("0");
  const movementRequestRef = useRef<{ id: string; fingerprint: string } | null>(null);

  const loadItems = useCallback(async () => {
    const response = await fetch("/api/items", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "تعذر تحميل المخزون");
    setItems(result.items || []);
  }, []);

  const loadMovements = useCallback(async () => {
    const allMovements: Movement[] = [];
    const limit = 500;
    for (let offset = 0; ; offset += limit) {
      const response = await fetch(`/api/movements?limit=${limit}&offset=${offset}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تحميل الحركات");
      const batch: Movement[] = result.movements || [];
      allMovements.push(...batch);
      if (!result.hasMore || batch.length === 0) break;
    }
    setMovements(allMovements);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try { await Promise.all([loadItems(), loadMovements()]); }
    catch (e) { setError(e instanceof Error ? e.message : "حدث خطأ غير متوقع"); }
    finally { setLoading(false); }
  }, [loadItems, loadMovements]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!formItem && items.length) setFormItem(items[0].id);
    if (formItem && !items.some((item) => item.id === formItem)) setFormItem(items[0]?.id || "");
  }, [items, formItem]);

  const visibleMovements = useMemo(() => movements.filter((movement) => {
    if (movementFilter !== "all" && movement.movement_type !== movementFilter) return false;
    if (dateFrom && movement.movement_date < dateFrom) return false;
    if (dateTo && movement.movement_date > dateTo) return false;
    return true;
  }), [movements, movementFilter, dateFrom, dateTo]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter((item) => [item.name, item.code, item.unit].some((v) => v.toLocaleLowerCase().includes(term)));
  }, [items, search]);

  const stats = useMemo(() => ({
    count: items.length,
    incoming: movements.filter((m) => m.movement_type === "in" && m.movement_date === today()).reduce((sum, m) => sum + Number(m.quantity), 0),
    outgoing: movements.filter((m) => m.movement_type === "out" && m.movement_date === today()).reduce((sum, m) => sum + Number(m.quantity), 0),
    low: items.filter((item) => Number(item.current_quantity) <= 0).length,
  }), [items, movements]);

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (!formItem || !formQuantity || Number(formQuantity) <= 0) { setError("اختر الصنف وأدخل كمية أكبر من صفر."); return; }
    const payload = {
      item_id: formItem,
      movement_type: tab === "in" ? "in" : "out",
      quantity: Number(formQuantity),
      movement_date: formDate,
      notes: formNotes.trim() || null,
    };
    const fingerprint = JSON.stringify(payload);
    let pendingRequest = movementRequestRef.current ?? readPendingMovementRequest();
    if (pendingRequest && pendingRequest.fingerprint !== fingerprint) {
      setError("هناك محاولة سابقة لم تُحسم نتيجتها. أعد إرسال البيانات نفسها قبل تسجيل حركة مختلفة.");
      return;
    }
    if (!pendingRequest) {
      pendingRequest = { id: crypto.randomUUID(), fingerprint };
      movementRequestRef.current = pendingRequest;
    }
    movementRequestRef.current = pendingRequest;
    storePendingMovementRequest(pendingRequest);
    setSaving(true);
    try {
      const response = await fetch("/api/movements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, request_id: pendingRequest.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        movementRequestRef.current = null;
        storePendingMovementRequest(null);
        throw new Error(result.error || "تعذر تسجيل الحركة");
      }
      movementRequestRef.current = null;
      storePendingMovementRequest(null);
      setNotice(tab === "in" ? "تم تسجيل الوارد وتحديث الرصيد." : "تم تسجيل الصادر وتحديث الرصيد.");
      setFormQuantity(""); setFormNotes("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تسجيل الحركة"); }
    finally { setSaving(false); }
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (!code.trim() || !name.trim() || !unit.trim()) { setError("أدخل رمز الصنف واسمه ووحدة القياس."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, unit, opening_quantity: Number(opening) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذرت إضافة الصنف");
      setCode(""); setName(""); setOpening("0"); setNotice("تمت إضافة الصنف.");
      await refresh();
      setFormItem(result.item.id);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذرت إضافة الصنف"); }
    finally { setSaving(false); }
  }

  async function editItem(item: Item) {
    const nextName = window.prompt("اسم الصنف", item.name);
    if (nextName === null) return;
    const nextUnit = window.prompt("وحدة القياس", item.unit);
    if (nextUnit === null) return;
    const nextCode = window.prompt("رمز الصنف", item.code);
    if (nextCode === null) return;
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/items/" + item.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextName, unit: nextUnit, code: nextCode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تعديل الصنف");
      setNotice("تم تعديل بيانات الصنف."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تعديل الصنف"); }
  }

  async function deleteItem(item: Item) {
    if (!window.confirm("حذف الصنف «" + item.name + "»؟ لا يمكن حذف صنف له حركات مسجلة.")) return;
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/items/" + item.id, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حذف الصنف");
      setNotice("تم حذف الصنف."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حذف الصنف"); }
  }

  const nav: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "المخزون", icon: "▦" },
    { id: "in", label: "وارد", icon: "↓" },
    { id: "out", label: "صادر", icon: "↑" },
    { id: "items", label: "الأصناف", icon: "▤" },
    { id: "movements", label: "الحركات", icon: "↔" },
  ];
  const selectedItem = items.find((item) => item.id === formItem);

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon">م</div><div><strong>مخزون المواد</strong><span>إدارة الوارد والصادر</span></div></div>
      <nav className="nav-list" aria-label="القائمة الرئيسية">
        {nav.map((entry) => <button key={entry.id} className={"nav-button " + (tab === entry.id ? "active" : "")} onClick={() => { setTab(entry.id); setError(""); setNotice(""); }}>
          <span className="nav-icon">{entry.icon}</span><span>{entry.label}</span>
        </button>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot"/> نظام المخزون البسيط</div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div><p className="eyebrow">إدارة المواد الصناعية</p><h1>{nav.find((entry) => entry.id === tab)?.label === "المخزون" ? "المخزون الحالي" : nav.find((entry) => entry.id === tab)?.label === "وارد" ? "تسجيل وارد" : nav.find((entry) => entry.id === tab)?.label === "صادر" ? "تسجيل صادر" : nav.find((entry) => entry.id === tab)?.label === "الأصناف" ? "إدارة الأصناف" : "حركة المخزون"}</h1></div><button className="refresh-button" onClick={() => void refresh()} title="تحديث البيانات">↻ <span>تحديث</span></button></header>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {loading && <div className="loading-bar">جارٍ تحميل البيانات...</div>}

      {tab === "dashboard" && <>
        <div className="stats-grid">
          <article className="stat-card"><div className="stat-symbol blue">▦</div><span>عدد الأصناف</span><strong>{stats.count}</strong><small>صنف مسجل</small></article>
          <article className="stat-card"><div className="stat-symbol green">↓</div><span>وارد اليوم</span><strong>{stats.incoming.toLocaleString("en-US")}</strong><small>وحدة</small></article>
          <article className="stat-card"><div className="stat-symbol amber">↑</div><span>صادر اليوم</span><strong>{stats.outgoing.toLocaleString("en-US")}</strong><small>وحدة</small></article>
          <article className="stat-card"><div className="stat-symbol slate">!</div><span>أرصدة صفرية</span><strong>{stats.low}</strong><small>صنف رصيده صفر أو أقل</small></article>
        </div>
        <div className="quick-actions">
          <button className="action-card inbound" onClick={() => { setTab("in"); setError(""); setNotice(""); }}><span className="action-icon">↓</span><span><strong>تسجيل وارد جديد</strong><small>إضافة كمية إلى المخزون</small></span><b>←</b></button>
          <button className="action-card outbound" onClick={() => { setTab("out"); setError(""); setNotice(""); }}><span className="action-icon">↑</span><span><strong>تسجيل صادر جديد</strong><small>خصم كمية من المخزون</small></span><b>←</b></button>
        </div>
        <section className="panel">
          <div className="panel-heading"><div><h2>أرصدة الأصناف</h2><p>الكميات المتوفرة حالياً</p></div><button className="text-button" onClick={() => setTab("items")}>إدارة الأصناف ←</button></div>
          <div className="search-wrap"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الصنف أو الرمز..." /></div>
          <ItemsTable items={filteredItems} onEdit={editItem} onDelete={deleteItem}/>
        </section>
      </>}

      {(tab === "in" || tab === "out") && <div className="form-layout">
        <section className="panel movement-form-panel"><div className="panel-heading"><div><h2>{tab === "in" ? "استلام مواد" : "صرف مواد"}</h2><p>{tab === "in" ? "أدخل الكمية التي وصلت إلى المخزن." : "أدخل الكمية الخارجة من المخزن."}</p></div><span className={"movement-badge " + (tab === "in" ? "in-badge" : "out-badge")}>{tab === "in" ? "↓ وارد" : "↑ صادر"}</span></div>
          {items.length === 0 ? <div className="empty-state"><strong>لا توجد أصناف بعد</strong><p>أضف الأصناف أولاً حتى تتمكن من تسجيل الحركات.</p><button className="primary-button" onClick={() => setTab("items")}>إضافة صنف</button></div> :
          <form className="data-form" onSubmit={submitMovement}>
            <label>الصنف<select value={formItem} onChange={(e) => setFormItem(e.target.value)} required><option value="">اختر الصنف</option>{items.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>
            {selectedItem && <div className="available-stock"><span>الرصيد الحالي</span><strong>{Number(selectedItem.current_quantity).toLocaleString("en-US")} <small>{selectedItem.unit}</small></strong></div>}
            <label>الكمية <input type="number" min="0.001" step="0.001" value={formQuantity} onChange={(e) => setFormQuantity(e.target.value)} placeholder="أدخل الكمية" required /></label>
            <label>التاريخ <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required /></label>
            <label>ملاحظات <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="اختياري" rows={3}/></label>
            {tab === "out" && selectedItem && <p className="form-hint">لن يسمح النظام بصرف كمية أكبر من الرصيد المتوفر.</p>}
            <button className={"primary-button " + (tab === "in" ? "green-button" : "orange-button")} type="submit" disabled={saving}>{saving ? "جارٍ الحفظ..." : tab === "in" ? "تأكيد استلام المواد" : "تأكيد صرف المواد"}</button>
          </form>}
        </section>
        <aside className="helper-panel"><div className="helper-icon">{tab === "in" ? "↓" : "↑"}</div><h3>{tab === "in" ? "تسجيل الوارد" : "تسجيل الصادر"}</h3><p>{tab === "in" ? "تزداد كمية الصنف فور تسجيل الاستلام بنجاح." : "تنقص كمية الصنف فور تسجيل الصرف بنجاح."}</p><div className="helper-rule"><span>معادلة الرصيد</span><strong>الافتتاحي + الوارد − الصادر</strong></div></aside>
      </div>}

      {tab === "items" && <div className="items-layout">
        <section className="panel"><div className="panel-heading"><div><h2>إضافة صنف جديد</h2><p>العبوات، الأغطية، المواد الخام، الكرتون وغيرها.</p></div></div>
          <form className="data-form" onSubmit={submitItem}>
            <label>رمز الصنف <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: PK-001" required /></label>
            <label>اسم الصنف <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عبوات فارغة" required /></label>
            <label>وحدة القياس <select value={unit} onChange={(e) => setUnit(e.target.value)}><option>حبة</option><option>قطعة</option><option>كرتونة</option><option>كغم</option><option>غرام</option><option>لتر</option><option>متر</option><option>رول</option></select></label>
            <label>الرصيد الافتتاحي <input type="number" min="0" step="0.001" value={opening} onChange={(e) => setOpening(e.target.value)} required /><small className="field-help">الكمية الموجودة فعلياً عند بدء استخدام النظام.</small></label>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? "جارٍ الحفظ..." : "إضافة الصنف"}</button>
          </form>
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>الأصناف المسجلة</h2><p>{items.length} صنف</p></div></div><div className="search-wrap"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن صنف..." /></div><ItemsTable items={filteredItems} onEdit={editItem} onDelete={deleteItem}/></section>
      </div>}

      {tab === "movements" && <section className="panel"><div className="panel-heading"><div><h2>حركة المواد</h2><p>عرض عمليات الوارد والصادر المسجلة</p></div></div>
        <div className="filters"><label>نوع الحركة<select value={movementFilter} onChange={(e) => setMovementFilter(e.target.value)}><option value="all">كل الحركات</option><option value="in">وارد فقط</option><option value="out">صادر فقط</option></select></label><label>من تاريخ<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}/></label><label>إلى تاريخ<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}/></label><button className="secondary-button" onClick={() => { setMovementFilter("all"); setDateFrom(""); setDateTo(""); }}>مسح التصفية</button></div>
        <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>رمز الصنف</th><th>الصنف</th><th>النوع</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody>
          {visibleMovements.map((m) => <tr key={m.id}><td>{m.movement_date}</td><td>{m.items?.code || "—"}</td><td>{m.items?.name || "صنف"}</td><td><span className={"movement-badge " + (m.movement_type === "in" ? "in-badge" : "out-badge")}>{m.movement_type === "in" ? "وارد" : "صادر"}</span></td><td className="quantity-cell">{Number(m.quantity).toLocaleString("en-US")} {m.items?.unit || ""}</td><td>{m.notes || "—"}</td></tr>)}
          {visibleMovements.length === 0 && <tr><td colSpan={6}><div className="empty-table">لا توجد حركات مطابقة.</div></td></tr>}
        </tbody></table></div><p className="table-footnote">يُعرض جميع الحركات المطابقة للتصفية.</p>
      </section>}
      <footer className="page-footer">إدارة مخزون المواد <span>•</span> نظام بسيط للوارد والصادر</footer>
    </section>
  </main>;
}

function ItemsTable({ items, onEdit, onDelete }: { items: Item[]; onEdit: (item: Item) => void; onDelete: (item: Item) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>الرمز</th><th>اسم الصنف</th><th>الوحدة</th><th>الرصيد الحالي</th><th>إجراءات</th></tr></thead><tbody>
    {items.map((item) => <tr key={item.id}><td><span className="item-code">{item.code}</span></td><td className="item-name">{item.name}</td><td>{item.unit}</td><td><span className={"stock-value " + (Number(item.current_quantity) <= 0 ? "zero-stock" : "")}>{Number(item.current_quantity).toLocaleString("en-US")}</span></td><td><div className="row-actions"><button onClick={() => onEdit(item)} className="small-button" title="تعديل">تعديل</button><button onClick={() => onDelete(item)} className="small-button delete-button" title="حذف">حذف</button></div></td></tr>)}
    {items.length === 0 && <tr><td colSpan={5}><div className="empty-table">لا توجد أصناف. أضف أول صنف للبدء.</div></td></tr>}
  </tbody></table></div>;
}
