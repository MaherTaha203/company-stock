"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Item = {
  id: string; code: string; name: string; unit: string;
  opening_quantity: number; incoming_quantity: number;
  outgoing_quantity: number; current_quantity: number;
  category: string | null; reorder_level: number;
};
const fmtDate = (iso: string | null) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
  const [category, setCategory] = useState("");
  const [reorder, setReorder] = useState("0");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ code: "", name: "", unit: "", category: "", reorder_level: "0" });
  const [editError, setEditError] = useState("");
  const movementRequestRef = useRef<{ id: string; fingerprint: string } | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [movePage, setMovePage] = useState(0);
  const [moveSize, setMoveSize] = useState(50);

  useEffect(() => {
    try { const d = window.localStorage.getItem("cs-density"); if (d === "compact" || d === "comfortable") setDensity(d); } catch {}
  }, []);
  const changeDensity = (d: "comfortable" | "compact") => { setDensity(d); try { window.localStorage.setItem("cs-density", d); } catch {} };

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

  useEffect(() => { setMovePage(0); }, [movementFilter, dateFrom, dateTo, moveSize]);
  const movePages = Math.max(1, Math.ceil(visibleMovements.length / moveSize));
  const moveStart = Math.min(movePage, movePages - 1) * moveSize;
  const pagedMovements = visibleMovements.slice(moveStart, moveStart + moveSize);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter((item) => [item.name, item.code, item.unit, item.category ?? ""].some((v) => v.toLocaleLowerCase().includes(term)));
  }, [items, search]);

  const stats = useMemo(() => {
    const td = today();
    return {
      count: items.length,
      incoming: movements.filter((m) => m.movement_type === "in" && m.movement_date === td).reduce((sum, m) => sum + Number(m.quantity), 0),
      outgoing: movements.filter((m) => m.movement_type === "out" && m.movement_date === td).reduce((sum, m) => sum + Number(m.quantity), 0),
      movesToday: movements.filter((m) => m.movement_date === td).length,
      lowCount: items.filter((i) => Number(i.current_quantity) > 0 && Number(i.current_quantity) <= Number(i.reorder_level)).length,
      zeroCount: items.filter((i) => Number(i.current_quantity) <= 0).length,
    };
  }, [items, movements]);

  const dayKeys = useMemo(() => {
    const out: string[] = [];
    const base = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(base.getDate() - i);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return out;
  }, []);
  const itemMeta = useMemo(() => {
    const map = new Map<string, { last: string | null; trend: number[] }>();
    for (const it of items) map.set(it.id, { last: null, trend: Array(7).fill(0) });
    for (const m of movements) {
      const e = map.get(m.item_id); if (!e) continue;
      if (!e.last || m.movement_date > e.last) e.last = m.movement_date;
      const idx = dayKeys.indexOf(m.movement_date);
      if (idx >= 0) e.trend[idx] += Number(m.quantity);
    }
    return map;
  }, [items, movements, dayKeys]);

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
        body: JSON.stringify({ code, name, unit, opening_quantity: Number(opening), category: category.trim() || null, reorder_level: Number(reorder) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذرت إضافة الصنف");
      setCode(""); setName(""); setOpening("0"); setCategory(""); setReorder("0"); setNotice("تمت إضافة الصنف.");
      await refresh();
      setFormItem(result.item.id);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذرت إضافة الصنف"); }
    finally { setSaving(false); }
  }

  function editItem(item: Item) {
    setEditingItem(item);
    setEditForm({ code: item.code, name: item.name, unit: item.unit, category: item.category ?? "", reorder_level: String(item.reorder_level ?? 0) });
    setEditError("");
    setError("");
    setNotice("");
  }

  async function submitEditItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    if (!editForm.code.trim() || !editForm.name.trim() || !editForm.unit.trim()) {
      setEditError("أدخل رمز الصنف واسمه ووحدة القياس.");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      const response = await fetch("/api/items/" + editingItem.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editForm.code.trim(),
          name: editForm.name.trim(),
          unit: editForm.unit.trim(),
          category: editForm.category.trim() || null,
          reorder_level: Number(editForm.reorder_level),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تعديل الصنف");
      setEditingItem(null);
      setNotice("تم تعديل بيانات الصنف.");
      await refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "تعذر تعديل الصنف");
    } finally {
      setSaving(false);
    }
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

  const nav: { id: Tab; label: string; icon: IconName }[] = [
    { id: "dashboard", label: "المخزون", icon: "dashboard" },
    { id: "in", label: "وارد", icon: "arrow-down" },
    { id: "out", label: "صادر", icon: "arrow-up" },
    { id: "items", label: "الأصناف", icon: "package" },
    { id: "movements", label: "الحركات", icon: "history" },
  ];
  const selectedItem = items.find((item) => item.id === formItem);

  return <main className="app-shell" data-density={density}>
    <aside className="sidebar">
      <div className="brand"><img className="brand-logo" src="/company-stocks.svg" alt="Company Stocks" width={43} height={43}/><div><strong>Company Stocks</strong><span>إدارة المخزون</span></div></div>
      <nav className="nav-list" aria-label="القائمة الرئيسية">
        {nav.map((entry) => <button key={entry.id} className={"nav-button " + (tab === entry.id ? "active" : "")} onClick={() => { setTab(entry.id); setError(""); setNotice(""); }}>
          <span className="nav-icon"><Icon name={entry.icon} size={21}/></span><span>{entry.label}</span>
        </button>)}
      </nav>
      <div className="sidebar-footer"><span className="status-dot"/> نظام المخزون البسيط</div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div><p className="eyebrow">إدارة المواد الصناعية</p><h1>{nav.find((entry) => entry.id === tab)?.label === "المخزون" ? "المخزون الحالي" : nav.find((entry) => entry.id === tab)?.label === "وارد" ? "تسجيل وارد" : nav.find((entry) => entry.id === tab)?.label === "صادر" ? "تسجيل صادر" : nav.find((entry) => entry.id === tab)?.label === "الأصناف" ? "إدارة الأصناف" : "حركة المخزون"}</h1></div><div className="topbar-actions"><div className="density-toggle" role="group" aria-label="كثافة العرض"><button type="button" className={density === "comfortable" ? "on" : ""} onClick={() => changeDensity("comfortable")}>مريح</button><button type="button" className={density === "compact" ? "on" : ""} onClick={() => changeDensity("compact")}>مضغوط</button></div><button className="refresh-button" onClick={() => void refresh()} title="تحديث البيانات"><Icon name="refresh" size={18}/> <span>تحديث</span></button></div></header>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {loading && <div className="loading-bar">جارٍ تحميل البيانات...</div>}

      {tab === "dashboard" && <>
        <div className="stats-grid kpi6">
          <article className="stat-card"><div className="stat-symbol blue"><Icon name="package" size={20}/></div><span>عدد الأصناف</span><strong>{stats.count.toLocaleString("en-US")}</strong><small>صنف مسجل</small></article>
          <article className="stat-card"><div className="stat-symbol green"><Icon name="arrow-down" size={20}/></div><span>وارد اليوم</span><strong>{stats.incoming.toLocaleString("en-US")}</strong><small>وحدة</small></article>
          <article className="stat-card"><div className="stat-symbol amber"><Icon name="arrow-up" size={20}/></div><span>صادر اليوم</span><strong>{stats.outgoing.toLocaleString("en-US")}</strong><small>وحدة</small></article>
          <article className="stat-card"><div className="stat-symbol blue"><Icon name="history" size={20}/></div><span>حركات اليوم</span><strong>{stats.movesToday.toLocaleString("en-US")}</strong><small>عملية مسجّلة</small></article>
          <article className="stat-card"><div className="stat-symbol amber"><Icon name="alert" size={20}/></div><span>تحت نقطة الطلب</span><strong>{stats.lowCount.toLocaleString("en-US")}</strong><small>يلزم إعادة طلب</small></article>
          <article className="stat-card"><div className="stat-symbol slate"><Icon name="alert" size={20}/></div><span>أصناف نافدة</span><strong>{stats.zeroCount.toLocaleString("en-US")}</strong><small>رصيد صفري</small></article>
        </div>
        <div className="quick-actions">
          <button className="action-card inbound" onClick={() => { setTab("in"); setError(""); setNotice(""); }}><span className="action-icon"><Icon name="arrow-down" size={23}/></span><span><strong>تسجيل وارد جديد</strong><small>إضافة كمية إلى المخزون</small></span><b><Icon name="arrow-left" size={17}/></b></button>
          <button className="action-card outbound" onClick={() => { setTab("out"); setError(""); setNotice(""); }}><span className="action-icon"><Icon name="arrow-up" size={23}/></span><span><strong>تسجيل صادر جديد</strong><small>خصم كمية من المخزون</small></span><b>←</b></button>
        </div>
        <section className="panel">
          <div className="panel-heading"><div><h2>أرصدة الأصناف</h2><p>الكميات المتوفرة حالياً</p></div><button className="text-button" onClick={() => setTab("items")}>إدارة الأصناف <Icon name="arrow-left" size={14}/></button></div>
          <div className="search-wrap"><span><Icon name="search" size={18}/></span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم الصنف أو الرمز..." /></div>
          <ItemsTable items={filteredItems} meta={itemMeta} onEdit={editItem} onDelete={deleteItem}/>
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
        <aside className="helper-panel"><div className="helper-icon"><Icon name={tab === "in" ? "arrow-down" : "arrow-up"} size={24}/></div><h3>{tab === "in" ? "تسجيل الوارد" : "تسجيل الصادر"}</h3><p>{tab === "in" ? "تزداد كمية الصنف فور تسجيل الاستلام بنجاح." : "تنقص كمية الصنف فور تسجيل الصرف بنجاح."}</p><div className="helper-rule"><span>معادلة الرصيد</span><strong>الافتتاحي + الوارد − الصادر</strong></div></aside>
      </div>}

      {tab === "items" && <div className="items-layout">
        <section className="panel"><div className="panel-heading"><div><h2>إضافة صنف جديد</h2><p>العبوات، الأغطية، المواد الخام، الكرتون وغيرها.</p></div></div>
          <form className="data-form" onSubmit={submitItem}>
            <label>رمز الصنف <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: PK-001" required /></label>
            <label>اسم الصنف <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عبوات فارغة" required /></label>
            <label>وحدة القياس <select value={unit} onChange={(e) => setUnit(e.target.value)}><option>حبة</option><option>قطعة</option><option>كرتونة</option><option>كغم</option><option>غرام</option><option>لتر</option><option>متر</option><option>رول</option></select></label>
            <label>التصنيف <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثال: مواد خام (اختياري)" /></label>
            <label>الرصيد الافتتاحي <input type="number" min="0" step="0.001" value={opening} onChange={(e) => setOpening(e.target.value)} required /><small className="field-help">الكمية الموجودة فعلياً عند بدء استخدام النظام.</small></label>
            <label>نقطة إعادة الطلب <input type="number" min="0" step="0.001" value={reorder} onChange={(e) => setReorder(e.target.value)} /><small className="field-help">يُنبّه النظام عندما ينزل الرصيد إلى هذا الحد أو أقل.</small></label>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? "جارٍ الحفظ..." : "إضافة الصنف"}</button>
          </form>
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>الأصناف المسجلة</h2><p>{items.length} صنف</p></div></div><div className="search-wrap"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن صنف..." /></div><ItemsTable items={filteredItems} meta={itemMeta} onEdit={editItem} onDelete={deleteItem}/></section>
      </div>}

      {tab === "movements" && <section className="panel"><div className="panel-heading"><div><h2>حركة المواد</h2><p>عرض عمليات الوارد والصادر المسجلة</p></div></div>
        <div className="filters"><label>نوع الحركة<select value={movementFilter} onChange={(e) => setMovementFilter(e.target.value)}><option value="all">كل الحركات</option><option value="in">وارد فقط</option><option value="out">صادر فقط</option></select></label><label>من تاريخ<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}/></label><label>إلى تاريخ<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}/></label><button className="secondary-button" onClick={() => { setMovementFilter("all"); setDateFrom(""); setDateTo(""); }}>مسح التصفية</button></div>
        <div className="table-wrap scroll"><table><thead><tr><th>التاريخ</th><th>رمز الصنف</th><th>الصنف</th><th>النوع</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody>
          {pagedMovements.map((m) => <tr key={m.id}><td className="when-cell">{fmtDate(m.movement_date)}</td><td>{m.items?.code || "—"}</td><td>{m.items?.name || "صنف"}</td><td><span className={"movement-badge " + (m.movement_type === "in" ? "in-badge" : "out-badge")}>{m.movement_type === "in" ? "وارد" : "صادر"}</span></td><td className="quantity-cell">{Number(m.quantity).toLocaleString("en-US")} {m.items?.unit || ""}</td><td>{m.notes || "—"}</td></tr>)}
          {visibleMovements.length === 0 && <tr><td colSpan={6}><div className="empty-table">لا توجد حركات مطابقة.</div></td></tr>}
        </tbody></table></div>
        <div className="pager">
          <span className="count">عرض <b>{visibleMovements.length === 0 ? 0 : moveStart + 1}–{Math.min(moveStart + moveSize, visibleMovements.length)}</b> من <b>{visibleMovements.length.toLocaleString("en-US")}</b> حركة</span>
          <select className="page-size" value={moveSize} onChange={(e) => setMoveSize(Number(e.target.value))} aria-label="عدد الصفوف لكل صفحة"><option value={25}>٢٥ / صفحة</option><option value={50}>٥٠ / صفحة</option><option value={100}>١٠٠ / صفحة</option></select>
          <span className="sp"/>
          <button className="pbtn" type="button" onClick={() => setMovePage((p) => Math.max(0, Math.min(p, movePages - 1) - 1))} disabled={moveStart === 0}>السابق</button>
          <span className="hint">صفحة {Math.min(movePage, movePages - 1) + 1} من {movePages}</span>
          <button className="pbtn" type="button" onClick={() => setMovePage((p) => Math.min(movePages - 1, p + 1))} disabled={moveStart + moveSize >= visibleMovements.length}>التالي</button>
        </div>
      </section>}
      {editingItem && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditingItem(null); }}>
        <section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-item-title">
          <div className="panel-heading"><div><h2 id="edit-item-title">تعديل بيانات الصنف</h2><p>تعديل بيانات التعريف فقط؛ لا يتغير الرصيد أو سجل الحركات.</p></div><button type="button" className="modal-close" aria-label="إغلاق" onClick={() => !saving && setEditingItem(null)} disabled={saving}>×</button></div>
          {editError && <div className="alert error" role="alert">{editError}</div>}
          <form className="data-form edit-item-form" onSubmit={submitEditItem}>
            <label>رمز الصنف <input autoFocus required value={editForm.code} onChange={(e) => setEditForm((current) => ({ ...current, code: e.target.value }))} /></label>
            <label>اسم الصنف <input required value={editForm.name} onChange={(e) => setEditForm((current) => ({ ...current, name: e.target.value }))} /></label>
            <label>وحدة القياس <input required value={editForm.unit} onChange={(e) => setEditForm((current) => ({ ...current, unit: e.target.value }))} /><small className="field-help">لا يمكن تغيير الوحدة إذا كان للصنف حركات مسجلة.</small></label>
            <label>التصنيف (اختياري) <input value={editForm.category} onChange={(e) => setEditForm((current) => ({ ...current, category: e.target.value }))} /></label>
            <label>نقطة إعادة الطلب <input type="number" min="0" step="0.001" required value={editForm.reorder_level} onChange={(e) => setEditForm((current) => ({ ...current, reorder_level: e.target.value }))} /></label>
            <div className="edit-modal-actions"><button type="button" className="secondary-button" onClick={() => setEditingItem(null)} disabled={saving}>إلغاء</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}</button></div>
          </form>
        </section>
      </div>}
      <footer className="page-footer">إدارة مخزون المواد <span>•</span> نظام بسيط للوارد والصادر</footer>
    </section>
  </main>;
}


type IconName = "dashboard" | "arrow-down" | "arrow-up" | "package" | "history" | "refresh" | "search" | "alert" | "arrow-left" | "edit" | "trash";
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "dashboard": return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="13" width="7" height="8" rx="1.5"/></svg>;
    case "arrow-down": return <svg {...common}><path d="M12 3v13m-6-6 6 6 6-6M5 21h14"/></svg>;
    case "arrow-up": return <svg {...common}><path d="M12 21V8m-6 6 6-6 6 6M5 3h14"/></svg>;
    case "package": return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/></svg>;
    case "history": return <svg {...common}><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></svg>;
    case "refresh": return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.7-2L20 12M4 12l2.8 5a7 7 0 0 0 11.7-2"/></svg>;
    case "search": return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>;
    case "alert": return <svg {...common}><path d="m10.3 4.5-7 12.1A2 2 0 0 0 5 19.5h14a2 2 0 0 0 1.7-2.9l-7-12.1a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></svg>;
    case "arrow-left": return <svg {...common}><path d="M19 12H5m7-7-7 7 7 7"/></svg>;
    case "edit": return <svg {...common}><path d="m15 5 4 4M4 20l4-.8L19.2 8a2.1 2.1 0 0 0-3-3L5 16.2 4 20Z"/></svg>;
    case "trash": return <svg {...common}><path d="M3 6h18m-2 0-.8 14H5.8L5 6m4 0V4h6v2m-5 4v6m4-6v6"/></svg>;
  }
}

type SortKey = "code" | "name" | "category" | "opening" | "incoming" | "outgoing" | "current" | "reorder";
type ItemMeta = Map<string, { last: string | null; trend: number[] }>;
const fmt = (n: number) => Number(n).toLocaleString("en-US");
const itemStatus = (it: Item): "ok" | "low" | "zero" =>
  Number(it.current_quantity) <= 0 ? "zero" : Number(it.current_quantity) <= Number(it.reorder_level) ? "low" : "ok";
const STATUS_LABEL = { ok: "متوفر", low: "منخفض", zero: "نافد" } as const;

function exportItemsCsv(items: Item[], meta: ItemMeta) {
  const head = ["الرمز", "الصنف", "التصنيف", "الوحدة", "افتتاحي", "وارد", "صادر", "الرصيد", "نقطة الطلب", "الحالة", "آخر حركة"];
  const esc = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = items.map((it) => [it.code, it.name, it.category ?? "", it.unit, it.opening_quantity, it.incoming_quantity, it.outgoing_quantity, it.current_quantity, it.reorder_level, STATUS_LABEL[itemStatus(it)], meta.get(it.id)?.last ?? ""].map(esc).join(","));
  const csv = "﻿" + [head.join(","), ...lines].join("\n");
  try {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "inventory.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {}
}

function Spark({ trend }: { trend: number[] }) {
  const max = Math.max(...trend, 1), w = 58, h = 18, bw = w / trend.length;
  return <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
    {trend.map((v, i) => { const bh = Math.max(2, (Math.abs(v) / max) * (h - 2));
      return <rect key={i} x={i * bw + 1} y={h - bh} width={bw - 2} height={bh} rx="1" fill={i === trend.length - 1 ? "var(--green)" : "var(--green-soft)"}/>; })}
  </svg>;
}

function ItemsTable({ items, meta, onEdit, onDelete }: { items: Item[]; meta: ItemMeta; onEdit: (item: Item) => void; onDelete: (item: Item) => void }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [sort, setSort] = useState<{ key: SortKey; dir: number } | null>(null);
  const [stat, setStat] = useState<"all" | "ok" | "low" | "zero">("all");

  const rows = useMemo(() => {
    let r = stat === "all" ? items : items.filter((it) => itemStatus(it) === stat);
    if (sort) {
      const k = sort.key;
      const val = (it: Item) => k === "code" ? it.code : k === "name" ? it.name : k === "category" ? (it.category ?? "")
        : Number(k === "opening" ? it.opening_quantity : k === "incoming" ? it.incoming_quantity : k === "outgoing" ? it.outgoing_quantity : k === "reorder" ? it.reorder_level : it.current_quantity);
      r = [...r].sort((a, b) => { const av = val(a), bv = val(b); return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir; });
    }
    return r;
  }, [items, stat, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / size));
  useEffect(() => { setPage(0); }, [rows.length, size, stat]);
  const start = Math.min(page, pages - 1) * size;
  const paged = rows.slice(start, start + size);
  const toggleSort = (key: SortKey) => setSort((s) => s && s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  const arrow = (key: SortKey) => sort?.key === key ? <span className="ar">{sort.dir > 0 ? " ▲" : " ▼"}</span> : null;

  return <>
    <div className="grid-toolbar">
      <div className="statchips" role="group" aria-label="تصفية حسب الحالة">
        <button type="button" className={"statchip " + (stat === "all" ? "on" : "")} onClick={() => setStat("all")}>الكل</button>
        <button type="button" className={"statchip " + (stat === "ok" ? "on" : "")} onClick={() => setStat("ok")}>متوفر</button>
        <button type="button" className={"statchip " + (stat === "low" ? "on" : "")} onClick={() => setStat("low")}>منخفض</button>
        <button type="button" className={"statchip " + (stat === "zero" ? "on" : "")} onClick={() => setStat("zero")}>نافد</button>
      </div>
      <button type="button" className="secondary-button export-btn" onClick={() => exportItemsCsv(rows, meta)} disabled={rows.length === 0}>⇩ تصدير CSV</button>
    </div>
    <div className="table-wrap scroll"><table><thead><tr>
      <th className="sortable" onClick={() => toggleSort("code")}>الرمز{arrow("code")}</th>
      <th className="sortable" onClick={() => toggleSort("name")}>اسم الصنف{arrow("name")}</th>
      <th className="sortable" onClick={() => toggleSort("category")}>التصنيف{arrow("category")}</th>
      <th>الوحدة</th>
      <th className="sortable" onClick={() => toggleSort("opening")}>افتتاحي{arrow("opening")}</th>
      <th className="sortable" onClick={() => toggleSort("incoming")}>وارد{arrow("incoming")}</th>
      <th className="sortable" onClick={() => toggleSort("outgoing")}>صادر{arrow("outgoing")}</th>
      <th className="sortable" onClick={() => toggleSort("current")}>الرصيد{arrow("current")}</th>
      <th className="sortable" onClick={() => toggleSort("reorder")}>نقطة الطلب{arrow("reorder")}</th>
      <th>اتجاه ٧ أيام</th>
      <th>الحالة</th>
      <th>آخر حركة</th>
      <th>إجراءات</th>
    </tr></thead><tbody>
    {paged.map((item) => { const m = meta.get(item.id); const st = itemStatus(item);
      return <tr key={item.id}>
        <td><span className="item-code">{item.code}</span></td>
        <td className="item-name">{item.name}</td>
        <td>{item.category || "—"}</td>
        <td>{item.unit}</td>
        <td className="num-cell">{fmt(item.opening_quantity)}</td>
        <td className="num-cell num-in">{fmt(item.incoming_quantity)}</td>
        <td className="num-cell num-out">{fmt(item.outgoing_quantity)}</td>
        <td><span className={"stock-value " + (st === "zero" ? "zero-stock" : "")}>{fmt(item.current_quantity)}</span></td>
        <td className="num-cell">{fmt(item.reorder_level)}</td>
        <td>{m ? <Spark trend={m.trend}/> : "—"}</td>
        <td><span className={"pill p-" + st}>{STATUS_LABEL[st]}</span></td>
        <td className="when-cell">{fmtDate(m?.last ?? null)}</td>
        <td><div className="row-actions"><button onClick={() => onEdit(item)} className="small-button" title="تعديل" aria-label={"تعديل " + item.name}><Icon name="edit" size={15}/><span>تعديل</span></button><button onClick={() => onDelete(item)} className="small-button delete-button" title="حذف" aria-label={"حذف " + item.name}><Icon name="trash" size={15}/><span>حذف</span></button></div></td>
      </tr>; })}
    {rows.length === 0 && <tr><td colSpan={13}><div className="empty-table">لا توجد أصناف مطابقة.</div></td></tr>}
  </tbody></table></div>
    {rows.length > 0 && <div className="pager">
      <span className="count">عرض <b>{start + 1}–{Math.min(start + size, rows.length)}</b> من <b>{rows.length.toLocaleString("en-US")}</b> صنف</span>
      <select className="page-size" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="عدد الصفوف لكل صفحة"><option value={25}>٢٥ / صفحة</option><option value={50}>٥٠ / صفحة</option><option value={100}>١٠٠ / صفحة</option></select>
      <span className="sp"/>
      <button className="pbtn" type="button" onClick={() => setPage(Math.max(0, Math.min(page, pages - 1) - 1))} disabled={start === 0}>السابق</button>
      <span className="hint">صفحة {Math.min(page, pages - 1) + 1} من {pages}</span>
      <button className="pbtn" type="button" onClick={() => setPage(Math.min(pages - 1, page + 1))} disabled={start + size >= rows.length}>التالي</button>
    </div>}
  </>;
}
