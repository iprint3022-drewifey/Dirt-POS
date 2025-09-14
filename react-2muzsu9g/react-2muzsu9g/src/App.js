import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Supabase ---
const SUPABASE_URL = "https://hvuzvmiujscirrmnwjgy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2dXp2bWl1anNjaXJybW53amd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3OTMxMzAsImV4cCI6MjA3MzM2OTEzMH0.yKQ4G4dr3H4SOf8mpSAkmFd4CYVrJu9tioyyT05ls8Q";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Feature flags (keep receipts off for Myrtle Beach) ---
const RECEIPTS_ENABLED = false;

// --- UI helpers ---
const Button = ({ children, ...props }) => (
  <button
    {...props}
    style={{
      padding: "6px 10px",
      margin: 2,
      border: "1px solid #ccc",
      borderRadius: 6,
      cursor: props.disabled ? "not-allowed" : "pointer",
      background: props.disabled ? "#eee" : "#fff",
    }}
  >
    {children}
  </button>
);
const Input = (props) => (
  <input
    {...props}
    style={{ padding: "6px", margin: 2, border: "1px solid #ccc", borderRadius: 6 }}
  />
);
const Img = ({ src, size = 40, alt = "" }) =>
  src ? (
    <img
      src={src}
      alt={alt}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: 6,
        border: "1px solid #ddd",
      }}
    />
  ) : (
    <span style={{ color: "#bbb" }}>—</span>
  );
const sizeToSlug = (s) => String(s).trim().replace(/[^A-Za-z0-9]+/g, "-").toUpperCase();

export default function App() {
  // --- Data ---
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [movements, setMovements] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);

  // --- UI state ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // --- Add Product panel ---
  const emptyProd = {
    id: "",
    name: "",
    sku_prefix: "",
    default_price: 0,
    default_cost: 0,
    default_distributor: "",
    default_warehouse: "",
    group_id: "",
    image_url: "",
  };
  const [editingProd, setEditingProd] = useState(emptyProd);
  const [pmOpen, setPmOpen] = useState(false);

  // --- POS state ---
  const [cart, setCart] = useState([]); // [{variantId, qty, price}]
  const [scanMode, setScanMode] = useState(false); // small photo grid
  const [photoPos, setPhotoPos] = useState(false); // fullscreen photo POS
  const [photoFilter, setPhotoFilter] = useState({ group: "all", q: "" });

  // --- Totals controls ---
  const [discountAmt, setDiscountAmt] = useState(0);
  const [taxPct, setTaxPct] = useState(0);

  // --- Optional receipts (disabled for MVP) ---
  const [customerPhone, setCustomerPhone] = useState("");

  // --- Reports state ---
  const todayISO = new Date().toISOString().slice(0, 10);
  const [repStart, setRepStart] = useState(todayISO);
  const [repEnd, setRepEnd] = useState(todayISO);
  const [repGroup, setRepGroup] = useState("all");
  const [repDistributor, setRepDistributor] = useState("all");
  const [repWarehouse, setRepWarehouse] = useState("all");
  const [repPayment, setRepPayment] = useState("all");

  // --- Initial load ---
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: g } = await supabase.from("groups").select("*").order("name");
        const { data: p } = await supabase.from("products").select("*").order("name");
        const { data: v } = await supabase.from("variants").select("*").order("sku");
        const { data: m } = await supabase.from("movements").select("*").order("created_at", { ascending: false });
        const { data: o } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
        const { data: oi } = await supabase.from("order_items").select("*").order("order_id");
        setGroups(g || []); setProducts(p || []); setVariants(v || []); setMovements(m || []);
        setOrders(o || []); setOrderItems(oi || []);
      } catch (err) {
        console.error(err); setError(String(err.message || err));
      } finally { setLoading(false); }
    })();
  }, []);

  // --- Helpers ---
  const productById = (id) => products.find((p) => p.id === id);
  const variantById = (id) => variants.find((v) => v.id === id);
  const stockFor = (variantId) =>
    movements.filter((m) => m.variant_id === variantId).reduce((s, m) => s + Number(m.qty_change || 0), 0);
  const variantImg = (v) => v?.image_url || productById(v?.product_id)?.image_url || "";

  // --- Cart ops ---
  const addToCart = (variantId) => {
    const v = variantById(variantId); if (!v) return;
    if (stockFor(variantId) <= 0) return;
    const already = cart.find((i) => i.variantId === variantId);
    if (already) setCart(cart.map((i) => i.variantId === variantId ? { ...i, qty: i.qty + 1 } : i));
    else setCart([...cart, { variantId, qty: 1, price: v.price }]);
  };
  const incQty = (variantId) => {
    const stock = stockFor(variantId);
    setCart(cart.map((i) => i.variantId === variantId ? { ...i, qty: Math.min(stock, i.qty + 1) } : i));
  };
  const decQty = (variantId) =>
    setCart(cart.map((i) => i.variantId === variantId ? { ...i, qty: Math.max(1, i.qty - 1) } : i));

  // --- Totals ---
  const cartTotals = useMemo(() => {
    const count = cart.reduce((s, i) => s + i.qty, 0);
    const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const discount = Math.max(0, Number(discountAmt) || 0);
    const taxableBase = Math.max(0, subtotal - discount);
    const tax = Math.max(0, taxableBase * ((Number(taxPct) || 0) / 100));
    const total = taxableBase + tax;
    return { count, subtotal, discount, tax, total };
  }, [cart, discountAmt, taxPct]);

  // --- Checkout ---
  const checkout = async (method = "card") => {
    try {
      if (!cartTotals.count) return;
      for (const item of cart) {
        if (stockFor(item.variantId) < item.qty) {
          alert("Not enough stock for one or more items");
          return;
        }
      }

      // Cash flow
      let cash_received = 0;
      let change_due = 0;
      if (method === "cash") {
        const input = window.prompt(`Cash received? Total is $${cartTotals.total.toFixed(2)}.`);
        if (input === null) return; // cancelled
        cash_received = Number(input);
        if (!isFinite(cash_received) || cash_received < 0) {
          alert("Enter a valid amount."); return;
        }
        if (cash_received < cartTotals.total) {
          const short = (cartTotals.total - cash_received).toFixed(2);
          const cont = window.confirm(`Customer is $${short} short. Continue anyway?`);
          if (!cont) return;
        }
        change_due = Math.max(0, cash_received - cartTotals.total);
      }

      // Create order
      const now = new Date().toISOString();
      const phoneToSave = RECEIPTS_ENABLED ? (customerPhone || null) : null;
      const totalsPayload = { ...cartTotals, taxPct };
      const { data: od, error: eo } = await supabase
        .from("orders")
        .insert({
          created_at: now,
          subtotal: cartTotals.subtotal,
          discount: cartTotals.discount,
          tax: cartTotals.tax,
          total: cartTotals.total,
          totals: totalsPayload,
          items: [],
          payment_method: method,
          cash_received,
          change_due,
          customer_phone: phoneToSave,
        })
        .select();
      if (eo) throw eo;
      const order = od?.[0];
      if (!order) throw new Error("Order not created");

      // Items + movement
      for (const it of cart) {
        await supabase.from("order_items").insert({
          order_id: order.id,
          variant_id: it.variantId,
          qty: it.qty,
          price: it.price,                      // sale price (customer facing)
          cost: variantById(it.variantId)?.cost ?? 0, // internal cost snapshot
        });
        await supabase.from("movements").insert({
          type: "SALE",
          variant_id: it.variantId,
          qty_change: -Number(it.qty),
          created_at: now,
          meta: { order_id: order.id, method },
        });
      }

      // Done
      setCart([]);
      alert(`Checked out order ${order.id}. ${method === "cash" ? `Change due: $${change_due.toFixed(2)}` : ""}`);
      if (RECEIPTS_ENABLED && customerPhone) {
        console.log(`Text receipt would be sent to ${customerPhone} here.`);
        setCustomerPhone("");
      }
    } catch (e) {
      alert("Checkout failed: " + (e.message || e));
    }
  };

  // --- Reporting helpers ---
  const productByVariant = (variantId) => {
    const v = variantById(variantId);
    if (!v) return null;
    return productById(v.product_id) || null;
  };
  const variantName = (variantId) => {
    const v = variantById(variantId); const p = v ? productById(v.product_id) : null;
    return p ? `${p.name} · ${v?.size || ""}` : variantId;
  };
  const withinRange = (d) => {
    try {
      const ts = new Date(d).getTime();
      const from = new Date(repStart + "T00:00:00").getTime();
      const to = new Date(repEnd + "T23:59:59").getTime();
      return ts >= from && ts <= to;
    } catch { return true; }
  };

  const filteredOrderIds = orders
    .filter((o) => withinRange(o.created_at) && (repPayment === "all" || o.payment_method === repPayment))
    .map((o) => o.id);

  const reportItems = orderItems
    .filter((oi) => filteredOrderIds.includes(oi.order_id))
    .filter((oi) => {
      const v = variantById(oi.variant_id); const p = v ? productById(v.product_id) : null;
      if (repGroup !== "all" && p?.group_id !== repGroup) return false;
      const dist = v?.distributor || p?.default_distributor || "";
      const wh = v?.warehouse || p?.default_warehouse || "";
      if (repDistributor !== "all" && dist !== repDistributor) return false;
      if (repWarehouse !== "all" && wh !== repWarehouse) return false;
      return true;
    });

  const repTotals = reportItems.reduce(
    (acc, it) => {
      const lineRevenue = Number(it.price || 0) * Number(it.qty || 0);
      const lineCOGS = Number(it.cost || 0) * Number(it.qty || 0);
      acc.qty += Number(it.qty || 0);
      acc.revenue += lineRevenue;
      acc.cogs += lineCOGS;
      return acc;
    },
    { qty: 0, revenue: 0, cogs: 0 }
  );
  repTotals.gross = repTotals.revenue - repTotals.cogs;
  repTotals.margin = repTotals.revenue ? (repTotals.gross / repTotals.revenue) * 100 : 0;

  const byVariant = {};
  for (const it of reportItems) {
    const key = it.variant_id;
    if (!byVariant[key]) byVariant[key] = { qty: 0, revenue: 0, cogs: 0 };
    byVariant[key].qty += Number(it.qty || 0);
    byVariant[key].revenue += Number(it.price || 0) * Number(it.qty || 0);
    byVariant[key].cogs += Number(it.cost || 0) * Number(it.qty || 0);
  }
  const variantRows = Object.entries(byVariant)
    .map(([vid, vals]) => ({
      vid,
      name: variantName(vid),
      qty: vals.qty,
      revenue: vals.revenue,
      cogs: vals.cogs,
      gross: vals.revenue - vals.cogs,
      margin: vals.revenue ? ((vals.revenue - vals.cogs) / vals.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Dirt Inventory + POS — Live</h1>

      {/* Top controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button onClick={() => setPmOpen(true)}>Add Product</Button>
        <Button
          onClick={() => setScanMode((s) => !s)}
          style={{ background: scanMode ? "#111" : "#fff", color: scanMode ? "#fff" : "#000" }}
        >
          {scanMode ? "Exit Scan by Image" : "Scan by Image"}
        </Button>
        <Button
          onClick={() => setPhotoPos(true)}
          style={{ background: photoPos ? "#111" : "#fff", color: photoPos ? "#fff" : "#000" }}
        >
          Photo POS
        </Button>
      </div>

      {/* Add Product */}
      {pmOpen && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>Add Product</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Input placeholder="Product name" value={editingProd.name}
              onChange={(e) => setEditingProd((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder="SKU prefix (e.g. CITY-TEE)" value={editingProd.sku_prefix}
              onChange={(e) => setEditingProd((p) => ({ ...p, sku_prefix: e.target.value }))} />
            <Input type="number" step="0.01" placeholder="Default price" value={editingProd.default_price}
              onChange={(e) => setEditingProd((p) => ({ ...p, default_price: Number(e.target.value) }))} />
            <Input type="number" step="0.01" placeholder="Cost per unit ($)" value={editingProd.default_cost}
              onChange={(e) => setEditingProd((p) => ({ ...p, default_cost: Number(e.target.value) }))} />
            <Input placeholder="Distributor (e.g. SanMar)" value={editingProd.default_distributor}
              onChange={(e) => setEditingProd((p) => ({ ...p, default_distributor: e.target.value }))} />
            <Input placeholder="Warehouse (optional)" value={editingProd.default_warehouse}
              onChange={(e) => setEditingProd((p) => ({ ...p, default_warehouse: e.target.value }))} />
            <select value={editingProd.group_id}
              onChange={(e) => setEditingProd((p) => ({ ...p, group_id: e.target.value }))}>
              <option value="">Select group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input type="file" accept="image/*"
              onChange={(e) => setEditingProd((p) => ({ ...p, imageFile: e.target.files?.[0] }))} />
            <Button onClick={async () => {
              try {
                if (!editingProd.name || !editingProd.sku_prefix || !editingProd.group_id) {
                  alert("Fill all fields"); return;
                }
                let image_url = editingProd.image_url || "";
                if (editingProd.imageFile) {
                  const file = editingProd.imageFile;
                  const filename = `products/${Date.now()}-${file.name}`;
                  const { error: upErr } = await supabase.storage.from("product-images")
                    .upload(filename, file, { upsert: true });
                  if (upErr) throw upErr;
                  const { data: pub } = supabase.storage.from("product-images").getPublicUrl(filename);
                  image_url = pub.publicUrl;
                }
                const { data: pd, error: pe } = await supabase.from("products").insert({
                  name: editingProd.name,
                  sku_prefix: editingProd.sku_prefix,
                  default_price: editingProd.default_price || 0,
                  default_cost: editingProd.default_cost || 0,
                  default_distributor: editingProd.default_distributor || "",
                  default_warehouse: editingProd.default_warehouse || "",
                  group_id: editingProd.group_id,
                  image_url,
                }).select();
                if (pe) throw pe;
                const product = pd?.[0];

                // Create default size variants XS–3XL
                const sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
                for (const sz of sizes) {
                  const sku = `${product.sku_prefix}-${sizeToSlug(sz)}`;
                  await supabase.from("variants").insert({
                    product_id: product.id,
                    size: sz,
                    sku,
                    price: product.default_price,           // sale price
                    cost: product.default_cost,             // internal cost
                    distributor: product.default_distributor,
                    warehouse: product.default_warehouse,
                    image_url: image_url || null,
                  });
                }
                setPmOpen(false); setEditingProd({ ...emptyProd });
                const { data: p2 } = await supabase.from("products").select("*").order("name");
                setProducts(p2 || []);
                const { data: v2 } = await supabase.from("variants").select("*").order("sku");
                setVariants(v2 || []);
              } catch (e) {
                alert("Save failed: " + (e.message || e));
              }
            }}>Save Product</Button>
            <Button onClick={() => { setPmOpen(false); setEditingProd({ ...emptyProd }); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Photo POS (fullscreen) */}
      {photoPos && (
        <div style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 9999, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 8 }}>
            <Button onClick={() => setPhotoPos(false)}>Close</Button>
            <strong style={{ fontSize: 18 }}>Photo POS</strong>
            <div style={{ marginLeft: 12 }}>
              <select value={photoFilter.group} onChange={(e) => setPhotoFilter(f => ({ ...f, group: e.target.value }))}>
                <option value="all">All groups</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <input
              placeholder="Search name / SKU / size"
              value={photoFilter.q}
              onChange={(e) => setPhotoFilter(f => ({ ...f, q: e.target.value }))}
              style={{ marginLeft: 8, padding: 6, border: "1px solid #ccc", borderRadius: 6, flex: "0 0 320px" }}
            />
            <div style={{ marginLeft: "auto" }}>
              <Button onClick={() => setPhotoFilter({ group: "all", q: "" })}>Clear</Button>
            </div>
          </div>

          <div style={{ flex: 1, padding: 12, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
              {variants.filter(v => {
                const p = productById(v.product_id);
                if (photoFilter.group !== "all" && p?.group_id !== photoFilter.group) return false;
                if (!photoFilter.q) return true;
                const hay = `${p?.name || ""} ${v.size || ""} ${v.sku || ""}`.toLowerCase();
                return hay.includes(photoFilter.q.toLowerCase());
              }).map(v => {
                const p = productById(v.product_id);
                const img = variantImg(v);
                const stock = stockFor(v.id);
                const c = cart.find(i => i.variantId === v.id);
                return (
                  <div key={v.id} style={{ border: "1px solid #ddd", borderRadius: 14, padding: 10, display: "flex", flexDirection: "column", opacity: stock > 0 ? 1 : 0.5 }}>
                    <div style={{ position: "relative", width: 140, height: 140 }}>
                      <Img src={img} size={140} />
                      {stock < 2 && (
                        <div style={{ position: "absolute", top: 6, left: 6, background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", borderRadius: 6, padding: "2px 6px", fontSize: 12, fontWeight: 700 }}>
                          LOW
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 700, lineHeight: 1.2 }}>{p?.name}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{v.size} · {v.sku}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <span style={{ fontWeight: 700 }}>${Number(v.price || 0).toFixed(2)}</span>
                      <span style={{ fontSize: 12, color: "#333" }}>Stock: {stock}</span>
                    </div>
                    <div style={{ marginTop: 6, display: "flex", gap: 6, justifyContent: "center" }}>
                      <Button disabled={stock <= 0} onClick={() => addToCart(v.id)}>Add</Button>
                      {c && (
                        <>
                          <Button onClick={() => decQty(v.id)}>-</Button>
                          <span>{c.qty}</span>
                          <Button onClick={() => incQty(v.id)} disabled={c.qty >= stock}>+</Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* sticky footer */}
          <div style={{ borderTop: "1px solid #ddd", padding: 12, background: "#fafafa", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label>Discount $</label>
              <input type="number" step="0.01" value={discountAmt} onChange={(e) => setDiscountAmt(Number(e.target.value) || 0)} style={{ width: 100 }} />
              <label>Tax %</label>
              <input type="number" step="0.01" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value) || 0)} style={{ width: 80 }} />
            </div>
            <div style={{ marginLeft: "auto" }}>
              <strong>Items:</strong> {cartTotals.count} &nbsp;|&nbsp; <strong>Subtotal:</strong> ${cartTotals.subtotal.toFixed(2)} &nbsp;|&nbsp; <strong>Discount:</strong> ${cartTotals.discount.toFixed(2)} &nbsp;|&nbsp; <strong>Tax:</strong> ${cartTotals.tax.toFixed(2)} &nbsp;|&nbsp; <strong>Total:</strong> ${cartTotals.total.toFixed(2)}
            </div>
            <Button disabled={!cartTotals.count} onClick={() => checkout("card")}>Checkout (Card)</Button>
            <Button disabled={!cartTotals.count} onClick={() => checkout("cash")}>Checkout (Cash)</Button>
          </div>
        </div>
      )}

      {/* Scan by Image (non-fullscreen) */}
      {scanMode && !photoPos && (
        <div style={{ marginTop: 16 }}>
          <h2>Scan by Image</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {variants.map((v) => {
              const p = productById(v.product_id);
              const img = variantImg(v);
              const stock = stockFor(v.id);
              return (
                <div key={v.id} onClick={() => stock > 0 && addToCart(v.id)} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 8, cursor: stock > 0 ? "pointer" : "not-allowed", opacity: stock > 0 ? 1 : 0.5 }}>
                  <Img src={img} size={120} />
                  <div style={{ marginTop: 6, fontWeight: 600 }}>{p?.name}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{v.size} · {v.sku}</div>
                  <div style={{ fontSize: 12, color: "#333" }}>Stock: {stock}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inventory */}
      {!photoPos && (
        <>
          <h2 style={{ marginTop: 16 }}>Inventory</h2>
          <table border={1} cellPadding={6}>
            <thead>
              <tr><th>Image</th><th>Name</th><th>Size</th><th>SKU</th><th>Cost</th><th>From</th><th>Stock</th><th></th></tr>
            </thead>
            <tbody>
              {variants.map((v) => {
                const p = productById(v.product_id);
                const img = variantImg(v);
                return (
                  <tr key={v.id}>
                    <td><Img src={img} /></td>
                    <td>{p?.name}</td>
                    <td>{v.size}</td>
                    <td>{v.sku}</td>
                    <td>${(v.cost ?? productById(v.product_id)?.default_cost ?? 0).toFixed(2)}</td>
                    <td>{v.distributor || productById(v.product_id)?.default_distributor || "-"}</td>
                    <td>{stockFor(v.id)}</td>
                    <td><Button onClick={() => addToCart(v.id)}>Add</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Cart */}
          <h2 style={{ marginTop: 16 }}>Cart</h2>
          <div style={{ marginBottom: 8 }}>
            {cart.map((i) => {
              const v = variantById(i.variantId); const p = productById(v.product_id);
              return (
                <div key={i.variantId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Img src={variantImg(v)} size={30} /> {p?.name} · {v.size} ×{i.qty}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <Button onClick={() => decQty(v.id)}>-</Button>
                    <span>{i.qty}</span>
                    <Button onClick={() => incQty(v.id)}>+</Button>
                  </div>
                </div>
              );
            })}
            {!cart.length && <div style={{ color: "#666" }}>Cart is empty.</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div><strong>Subtotal:</strong> ${cartTotals.subtotal.toFixed(2)}</div>
            <Button disabled={!cart.length} onClick={() => checkout("card")}>Checkout (Card)</Button>
            <Button disabled={!cart.length} onClick={() => checkout("cash")}>Checkout (Cash)</Button>
          </div>

          {/* Reports */}
          <h2 style={{ marginTop: 24 }}>Reports</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <label>From</label><input type="date" value={repStart} onChange={(e) => setRepStart(e.target.value)} />
            <label>To</label><input type="date" value={repEnd} onChange={(e) => setRepEnd(e.target.value)} />
            <label>Group</label>
            <select value={repGroup} onChange={(e) => setRepGroup(e.target.value)}>
              <option value="all">All</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <label>Distributor</label>
            <select value={repDistributor} onChange={(e) => setRepDistributor(e.target.value)}>
              <option value="all">All</option>
              {[...new Set(variants.map(v => v.distributor || productById(v.product_id)?.default_distributor || ""))]
                .filter(Boolean).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label>Warehouse</label>
            <select value={repWarehouse} onChange={(e) => setRepWarehouse(e.target.value)}>
              <option value="all">All</option>
              {[...new Set(variants.map(v => v.warehouse || productById(v.product_id)?.default_warehouse || ""))]
                .filter(Boolean).map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <label>Payment</label>
            <select value={repPayment} onChange={(e) => setRepPayment(e.target.value)}>
              <option value="all">All</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
            </select>
          </div>

          {/* KPI cards */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "#666" }}>Units Sold</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{repTotals.qty}</div>
            </div>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "#666" }}>Revenue</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>${repTotals.revenue.toFixed(2)}</div>
            </div>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "#666" }}>COGS</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>${repTotals.cogs.toFixed(2)}</div>
            </div>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "#666" }}>Gross Profit</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>${repTotals.gross.toFixed(2)}</div>
            </div>
            <div style={{ padding: 10, border: "1px solid #eee", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "#666" }}>Margin</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{repTotals.margin.toFixed(1)}%</div>
            </div>
          </div>

          {/* Top products table */}
          <table border={1} cellPadding={6}>
            <thead>
              <tr><th>Product · Size</th><th>Qty</th><th>Revenue</th><th>COGS</th><th>Gross</th><th>Margin</th></tr>
            </thead>
            <tbody>
              {variantRows.map(r => (
                <tr key={r.vid}>
                  <td>{r.name}</td>
                  <td>{r.qty}</td>
                  <td>${r.revenue.toFixed(2)}</td>
                  <td>${r.cogs.toFixed(2)}</td>
                  <td>${r.gross.toFixed(2)}</td>
                  <td>{r.margin.toFixed(1)}%</td>
                </tr>
              ))}
              {!variantRows.length && (
                <tr><td colSpan={6} style={{ color: "#666" }}>No sales in this range.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
