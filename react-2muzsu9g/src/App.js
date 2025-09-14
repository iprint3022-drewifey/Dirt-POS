import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ==============================
// Dirt Athletics — Supabase Live Sync + Per-Variant Images + Scan-by-Image + Fullscreen POS
// ==============================
// - Product & per-variant images
// - Scan-by-Image grid
// - Photo-only POS fullscreen mode with qty steppers and sticky cart bar

const SUPABASE_URL = "https://hvuzvmiujscirrmnwjgy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2dXp2bWl1anNjaXJybW53amd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3OTMxMzAsImV4cCI6MjA3MzM2OTEzMH0.yKQ4G4dr3H4SOf8mpSAkmFd4CYVrJu9tioyyT05ls8Q";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI helpers
const Button = ({ children, ...props }) => (
  <button
    {...props}
    style={{ padding: "6px 10px", margin: 2, border: "1px solid #ccc", borderRadius: 6, cursor: props.disabled ? "not-allowed" : "pointer", background: props.disabled?"#eee":"#fff" }}
  >{children}</button>
);
const Input = (props) => <input {...props} style={{ padding: "6px", margin: 2, border: "1px solid #ccc", borderRadius: 6 }} />;
const Img = ({ src, size=40, alt="" }) => src ? <img src={src} alt={alt} style={{ width:size, height:size, objectFit:"cover", borderRadius:6, border:"1px solid #ddd" }} /> : <span style={{ color:'#bbb' }}>—</span>;
const sizeToSlug = (s) => String(s).trim().replace(/[^A-Za-z0-9]+/g, "-").toUpperCase();

export default function App() {
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [movements, setMovements] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Product manager
  const emptyProd = { id: "", name: "", sku_prefix: "", default_price: 0, group_id: "", image_url: "" };
  const [editingProd, setEditingProd] = useState(emptyProd);
  const [pmOpen, setPmOpen] = useState(false);

  // POS
  const [cart, setCart] = useState([]);
  const [scanMode, setScanMode] = useState(false);
  const [photoPos, setPhotoPos] = useState(false);
  const [photoFilter, setPhotoFilter] = useState({ group: "all", q: "" });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: g } = await supabase.from("groups").select("*").order("name");
        const { data: p } = await supabase.from("products").select("*").order("name");
        const { data: v } = await supabase.from("variants").select("*").order("sku");
        const { data: m } = await supabase.from("movements").select("*").order("created_at", { ascending: false });
        const { data: o } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
        setGroups(g||[]); setProducts(p||[]); setVariants(v||[]); setMovements(m||[]); setOrders(o||[]);
      } catch (err) {
        console.error(err); setError(String(err.message||err));
      } finally { setLoading(false); }
    })();
  }, []);

  const productById = (id) => products.find(p => p.id === id);
  const variantById = (id) => variants.find(v => v.id === id);
  const stockFor = (variantId) => movements.filter(m => m.variant_id === variantId).reduce((s,m)=> s+Number(m.qty_change||0),0);
  const variantImg = (v) => v?.image_url || productById(v?.product_id)?.image_url || "";

  const addToCart = (variantId) => {
    const v = variantById(variantId); if (!v) return;
    if (stockFor(variantId) <= 0) return;
    const already = cart.find(i => i.variantId === variantId);
    if (already) setCart(cart.map(i => i.variantId===variantId ? { ...i, qty: i.qty+1 } : i));
    else setCart([...cart, { variantId, qty:1, price: v.price }]);
  };
  const qtyInCart = (variantId) => cart.find(i => i.variantId===variantId)?.qty || 0;
  const incQty = (variantId) => {
    const stock = stockFor(variantId);
    setCart(cart.map(i=> i.variantId===variantId? { ...i, qty: Math.min(stock, i.qty+1) }: i));
  };
  const decQty = (variantId) => setCart(cart.map(i=> i.variantId===variantId? { ...i, qty:Math.max(1,i.qty-1) }: i));

  const cartTotals = useMemo(() => {
    const count = cart.reduce((s,i)=> s + i.qty, 0);
    const subtotal = cart.reduce((s,i)=> s + i.qty * i.price, 0);
    return { count, subtotal, total: subtotal };
  }, [cart]);

  // === Checkout: create order + items + SALE movements ===
  const checkout = async () => {
    try {
      if (!cartTotals.count) return;
      for (const item of cart) {
        if (stockFor(item.variantId) < item.qty) {
          alert('Not enough stock for one or more items');
          return;
        }
      }
      const now = new Date().toISOString();
      const totalsPayload = cartTotals;
      const { data: od, error: eo } = await supabase
        .from('orders')
        .insert({ created_at: now, subtotal: cartTotals.subtotal, total: cartTotals.total, totals: totalsPayload, items: [] })
        .select();
      if (eo) throw eo;
      const order = od?.[0];
      if (!order) throw new Error('Order not created');
      for (const it of cart) {
        await supabase.from('order_items').insert({ order_id: order.id, variant_id: it.variantId, qty: it.qty, price: it.price });
        await supabase.from('movements').insert({ type: 'SALE', variant_id: it.variantId, qty_change: -Number(it.qty), created_at: now, meta: {} });
      }
      setCart([]);
      alert('Checked out order ' + order.id);
    } catch (e) {
      alert('Checkout failed: ' + (e.message||e));
    }
  };

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;

  return (
    <div style={{ padding:20 }}>
      <h1>Dirt Inventory + POS — Live</h1>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <Button onClick={()=> setPmOpen(true)}>Add Product</Button>
        <Button onClick={()=> setScanMode(s=>!s)} style={{ background: scanMode? '#111':'#fff', color: scanMode? '#fff':'#000' }}>{scanMode? 'Exit Scan by Image':'Scan by Image'}</Button>
        <Button onClick={()=> setPhotoPos(true)} style={{ background: photoPos? '#111':'#fff', color: photoPos? '#fff':'#000' }}>Photo POS</Button>
      </div>

      {/* ===== Photo POS Fullscreen ===== */}
      {photoPos && (
        <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:9999, display:'flex', flexDirection:'column' }}>
          <div style={{ padding:12, borderBottom:'1px solid #eee', display:'flex', alignItems:'center', gap:8 }}>
            <Button onClick={()=> setPhotoPos(false)}>Close</Button>
            <strong style={{ fontSize:18 }}>Photo POS</strong>
            <div style={{ marginLeft:12 }}>
              <select value={photoFilter.group} onChange={(e)=> setPhotoFilter(f=>({ ...f, group: e.target.value }))}>
                <option value="all">All groups</option>
                {groups.map(g=> <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <input placeholder="Search name / SKU / size" value={photoFilter.q} onChange={(e)=> setPhotoFilter(f=>({ ...f, q: e.target.value }))} style={{ marginLeft:8, padding:6, border:'1px solid #ccc', borderRadius:6, flex:'0 0 320px' }} />
            <div style={{ marginLeft:'auto' }}>
              <Button onClick={()=> setPhotoFilter({ group:'all', q:'' })}>Clear</Button>
            </div>
          </div>

          <div style={{ flex:1, padding:12, overflow:'auto' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:14 }}>
              {variants.filter(v=>{
                const p = productById(v.product_id);
                if (photoFilter.group!=='all' && p?.group_id!==photoFilter.group) return false;
                if (!photoFilter.q) return true;
                const hay = `${p?.name||''} ${v.size||''} ${v.sku||''}`.toLowerCase();
                return hay.includes(photoFilter.q.toLowerCase());
              }).map(v=>{
                const p = productById(v.product_id);
                const img = variantImg(v);
                const stock = stockFor(v.id);
                const c = cart.find(i=> i.variantId===v.id);
                return (
                  <div key={v.id} style={{ border:'1px solid #ddd', borderRadius:14, padding:10, display:'flex', flexDirection:'column', opacity: stock>0?1:0.5 }}>
                    <div style={{ position:'relative', width:140, height:140 }}>
                      <Img src={img} size={140} />
                      {stock < 2 && (
                        <div style={{ position:'absolute', top:6, left:6, background:'#fee2e2', color:'#b91c1c', border:'1px solid #fca5a5', borderRadius:6, padding:'2px 6px', fontSize:12, fontWeight:700 }}>
                          LOW
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop:8, fontWeight:700, lineHeight:1.2 }}>{p?.name}</div>
                    <div style={{ fontSize:12, color:'#555' }}>{v.size} · {v.sku}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
                      <span style={{ fontWeight:700 }}>${Number(v.price||0).toFixed(2)}</span>
                      <span style={{ fontSize:12, color:'#333' }}>Stock: {stock}</span>
                    </div>
                    <div style={{ marginTop:6, display:'flex', gap:6, justifyContent:'center' }}>
                      <Button disabled={stock<=0} onClick={()=> addToCart(v.id)}>Add</Button>
                      {c && (
                        <>
                          <Button onClick={()=> decQty(v.id)}>-</Button>
                          <span>{c.qty}</span>
                          <Button onClick={()=> incQty(v.id)} disabled={c.qty >= stock}>+</Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sticky cart bar */}
          <div style={{ borderTop:'1px solid #ddd', padding:12, background:'#fafafa', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1 }}>
              <strong>Cart:</strong> {cartTotals.count} items — <strong>Subtotal: ${cartTotals.subtotal.toFixed(2)}</strong>
            </div>
            <Button disabled={!cartTotals.count} onClick={checkout}>Checkout</Button>
          </div>
        </div>
      )}

      <h2>Inventory</h2>
      <table border={1} cellPadding={6}>
        <thead><tr><th>Image</th><th>Name</th><th>Size</th><th>SKU</th><th>Stock</th><th></th></tr></thead>
        <tbody>
          {variants.map(v=> {
            const p = productById(v.product_id);
            const img = variantImg(v);
            return (
              <tr key={v.id}>
                <td><Img src={img} /></td>
                <td>{p?.name}</td>
                <td>{v.size}</td>
                <td>{v.sku}</td>
                <td>{stockFor(v.id)}</td>
                <td><Button onClick={()=> addToCart(v.id)}>Add</Button></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Cart</h2>
      {cart.map(i=> {
        const v = variantById(i.variantId); const p = productById(v.product_id);
        return <div key={i.variantId}><Img src={variantImg(v)} size={30} /> {p?.name} · {v.size} ×{i.qty}</div>;
      })}

      {scanMode && (
        <div style={{ marginTop: 16 }}>
          <h2>Scan by Image</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:12 }}>
            {variants.map(v=>{
              const p = productById(v.product_id);
              const img = variantImg(v);
              const stock = stockFor(v.id);
              return (
                <div key={v.id} onClick={()=> stock>0 && addToCart(v.id)} style={{ border:'1px solid #ddd', borderRadius:10, padding:8, cursor: stock>0 ? 'pointer':'not-allowed', opacity: stock>0?1:0.5 }}>
                  <Img src={img} size={100} />
                  <div style={{ marginTop:6, fontWeight:600 }}>{p?.name}</div>
                  <div style={{ fontSize:12, color:'#555' }}>{v.size} · {v.sku}</div>
                  <div style={{ fontSize:12, color:'#333' }}>Stock: {stock}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
