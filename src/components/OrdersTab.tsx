import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, Package, ChevronDown, ChevronUp, Radio, Search, Loader2 } from 'lucide-react';
import {
  type Order, type Metro, type Location,
  getAllOrders, getAllMetros, getAllLocations, createOrder, deleteOrder,
  getNextOrderId, updateOrderStatus, type OrderStatus,
  findMetroByCode, allocateMetroToOrder, normalizeRfidInput, setRfidAlias,
} from '../db';

export default function OrdersTab({ onDataChange }: { onDataChange: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metros, setMetros] = useState<Metro[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [newId, setNewId] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDest, setNewDest] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [linkInput, setLinkInput] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pendingTagForLink, setPendingTagForLink] = useState<string | null>(null);
  const [aliasTargetMetroId, setAliasTargetMetroId] = useState('');
  const [metrosForAlias, setMetrosForAlias] = useState<Metro[]>([]);
  const orderLinkInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const [o, m, l] = await Promise.all([getAllOrders(), getAllMetros(), getAllLocations()]);
    setOrders(o.sort((a, b) => new Date(b.orderDateTime).getTime() - new Date(a.orderDateTime).getTime()));
    setMetros(m);
    setLocations(l);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setLinkInput('');
    setLinkMsg(null);
    setPendingTagForLink(null);
    setAliasTargetMetroId('');
    setLinkBusy(false);
  }, [expandedId]);

  useEffect(() => {
    if (!pendingTagForLink) {
      setMetrosForAlias([]);
      return;
    }
    void getAllMetros().then(ms => {
      const sorted = ms.sort((a, b) => a.id.localeCompare(b.id));
      setMetrosForAlias(sorted);
      setAliasTargetMetroId(prev => (prev && sorted.some(m => m.id === prev) ? prev : (sorted[0]?.id ?? '')));
    });
  }, [pendingTagForLink]);

  useEffect(() => {
    if (!expandedId) return;
    window.setTimeout(() => orderLinkInputRef.current?.focus(), 0);
  }, [expandedId]);

  const tryResolveAndAllocate = useCallback(async (orderId: string, raw: string) => {
    const norm = normalizeRfidInput(raw);
    if (!norm) return;
    setLinkBusy(true);
    setLinkMsg(null);
    setPendingTagForLink(null);
    const metro = await findMetroByCode(norm);
    if (!metro) {
      setLinkMsg({ type: 'err', text: `Unknown tag or metro "${norm}". Link the tag to a metro below, or add the mapping in Metro Scan.` });
      if (norm.length >= 4) setPendingTagForLink(norm);
      setLinkBusy(false);
      return;
    }
    if (metro.status !== 'Available') {
      setLinkMsg({ type: 'err', text: `${metro.id} must be Available to link to an order (currently ${metro.status}).` });
      setLinkBusy(false);
      return;
    }
    const ok = await allocateMetroToOrder(orderId, metro.id, 'RFID');
    if (ok) {
      setLinkInput('');
      setLinkMsg({ type: 'ok', text: `Linked ${metro.id} to this order.` });
      onDataChange();
      await load();
    } else {
      setLinkMsg({ type: 'err', text: 'Could not link metro to this order.' });
    }
    setLinkBusy(false);
  }, [onDataChange]);

  const handleSaveAliasAndAllocate = async (orderId: string) => {
    if (!pendingTagForLink || !aliasTargetMetroId) return;
    await setRfidAlias(pendingTagForLink, aliasTargetMetroId);
    setPendingTagForLink(null);
    setLinkMsg(null);
    await tryResolveAndAllocate(orderId, aliasTargetMetroId);
  };

  useEffect(() => {
    if (!expandedId || linkBusy || linkMsg) return;
    const v = normalizeRfidInput(linkInput);
    if (!v) return;
    const hexEPC = /^[0-9A-Fa-f]+$/.test(v) && v.length >= 8;
    const metroSku = /^MTR-\d+$/i.test(v);
    if (!hexEPC && !metroSku) return;
    const t = window.setTimeout(() => {
      void tryResolveAndAllocate(expandedId, v);
    }, 140);
    return () => window.clearTimeout(t);
  }, [linkInput, expandedId, linkBusy, linkMsg, tryResolveAndAllocate]);

  const handleCreate = async () => {
    if (!newId.trim() || !newDest) return;
    await createOrder(newId.trim(), newDesc.trim(), newDest);
    setNewId(''); setNewDesc(''); setNewDest('');
    onDataChange(); load();
  };

  const handleSuggest = async () => { setNewId(await getNextOrderId()); };

  const handleDelete = async (id: string) => {
    await deleteOrder(id);
    onDataChange(); load();
  };

  const handleStatusUpdate = async (id: string, status: OrderStatus) => {
    await updateOrderStatus(id, status);
    onDataChange(); load();
  };

  const getLocName = (id: string) => locations.find(l => l.id === id)?.name || id;
  const getOrderMetros = (order: Order) => metros.filter(m => order.metroIds.includes(m.id));

  const storageLocations = locations.filter(l => l.type === 'Storage' || l.type === 'Buffer');

  return (
    <>
      {/* Create order */}
      <div className="card">
        <div className="card-title mb-1">New Order</div>
        <div className="input-row">
          <div className="field">
            <label className="form-label">Order ID (required)</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input className="input-field" value={newId} onChange={e => setNewId(e.target.value)}
                placeholder="e.g. ORD-003" onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void handleSuggest()}>Suggest</button>
            </div>
          </div>
          <div className="field">
            <label className="form-label">Description</label>
            <input className="input-field" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="field">
            <label className="form-label">Destination</label>
            <select className="input-field" value={newDest} onChange={e => setNewDest(e.target.value)}>
              <option value="">Select location…</option>
              {storageLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <div className="btn-group mt-1">
          <button type="button" className="btn btn-success" disabled={!newId.trim() || !newDest} onClick={() => void handleCreate()}>
            <Plus size={15} /> Create Order
          </button>
          <button type="button" className="btn btn-outline" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      {/* Order list */}
      <div className="card-title mb-1">All Orders ({orders.length})</div>

      {orders.length === 0 && (
        <div className="empty-state"><Package size={40} /><p>No orders. Create one above.</p></div>
      )}

      {orders.map(order => {
        const expanded = expandedId === order.id;
        const orderMetros = getOrderMetros(order);
        return (
          <div key={order.id} className="list-item" style={{ flexDirection: 'column', gap: '0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.65rem', flex: 1 }}>
                <div className="item-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  <Package size={16} />
                </div>
                <div className="item-info">
                  <div className="item-title">
                    {order.id}
                    <span className={`badge badge-${order.status.toLowerCase()}`}>{order.status}</span>
                  </div>
                  <div className="item-sub">{order.description || '—'}</div>
                  <div className="item-meta">
                    Dest: {getLocName(order.locationId)} · {orderMetros.length} metro(s) · {new Date(order.orderDateTime).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="item-actions">
                {order.status === 'Allocated' && (
                  <button type="button" className="btn btn-warning btn-sm" onClick={() => void handleStatusUpdate(order.id, 'Pickup')}>Pickup</button>
                )}
                {order.status === 'Pickup' && (
                  <button type="button" className="btn btn-warning btn-sm" onClick={() => void handleStatusUpdate(order.id, 'InTransit')}>Dispatch</button>
                )}
                {order.status === 'InTransit' && (
                  <button type="button" className="btn btn-success btn-sm" onClick={() => void handleStatusUpdate(order.id, 'Delivered')}>Deliver</button>
                )}
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setExpandedId(expanded ? null : order.id)}>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => void handleDelete(order.id)}><Trash2 size={14} /></button>
              </div>
            </div>

            {expanded && (
              <div style={{ width: '100%', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <div className="form-label" style={{ marginBottom: '0.4rem' }}>Products Ordered</div>
                {(!order.items || order.items.length === 0) ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.75rem' }}>
                    No products specified in this work order.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
                    {order.items.map(item => (
                      <div key={item.id} style={{
                        display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem',
                        background: '#f8fafc', borderRadius: '6px', fontSize: '0.82rem'
                      }}>
                        <div>
                          <strong>{item.textileProductId}</strong> (Plant {item.plantId})
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>
                          Qty: {item.quantity} (Shipped: {item.shippedQuantity})
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="form-label">Allocated Metros</div>
                {orderMetros.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '0.5rem' }}>
                    No metros linked yet — use scan below.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.3rem', marginBottom: '0.75rem' }}>
                    {orderMetros.map(m => (
                      <div key={m.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.3rem 0.6rem', background: '#f0fdf4', border: '1px solid #bbf7d0',
                        borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600
                      }}>
                        {m.id} — {m.contents}
                        <span className={`badge badge-${m.status.toLowerCase()}`}>{m.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{
                  marginTop: '0.75rem', padding: '0.85rem', background: 'var(--primary-light)', borderRadius: 'var(--radius-md)',
                  border: '1px solid #bfdbfe'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                    <Radio size={15} style={{ color: 'var(--primary)' }} />
                    <span className="form-label" style={{ marginBottom: 0 }}>Scan or enter metro to link to this order</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.65rem', lineHeight: 1.45 }}>
                    Pair your reader in <strong>Bluetooth HID</strong> mode, focus the field, then scan. Only metros in <strong>Available</strong> status are linked. You can add more metros anytime while this panel is open.
                  </p>
                  <div className="search-row" style={{ marginBottom: '0.5rem' }}>
                    <input
                      ref={orderLinkInputRef}
                      className="input-field"
                      value={linkInput}
                      onChange={e => {
                        setLinkInput(e.target.value);
                        setLinkMsg(null);
                      }}
                      placeholder="EPC / MTR-001 / paste…"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void tryResolveAndAllocate(order.id, linkInput);
                        }
                      }}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text/plain');
                        const norm = normalizeRfidInput(text);
                        if (norm.length >= 4) {
                          e.preventDefault();
                          setLinkInput(norm);
                          setLinkMsg(null);
                          window.setTimeout(() => void tryResolveAndAllocate(order.id, norm), 0);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={linkBusy || !normalizeRfidInput(linkInput)}
                      onClick={() => void tryResolveAndAllocate(order.id, linkInput)}
                    >
                      {linkBusy ? <Loader2 className="animate-spin" size={15} /> : <><Search size={15} /> Link</>}
                    </button>
                  </div>
                  {linkMsg && (
                    <div style={{
                      fontSize: '0.8rem', padding: '0.45rem 0.55rem', borderRadius: '6px',
                      background: linkMsg.type === 'ok' ? '#dcfce7' : '#fee2e2',
                      color: linkMsg.type === 'ok' ? '#166534' : '#991b1b', marginBottom: pendingTagForLink ? '0.65rem' : 0
                    }}>
                      {linkMsg.text}
                    </div>
                  )}
                  {pendingTagForLink && metrosForAlias.length > 0 && (
                    <div style={{ borderTop: '1px solid #bfdbfe', paddingTop: '0.65rem' }}>
                      <div className="form-label">Unknown tag — map to a metro then link</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem', wordBreak: 'break-all' }}>
                        <code>{pendingTagForLink}</code>
                      </div>
                      <select
                        className="input-field mb-1"
                        value={aliasTargetMetroId}
                        onChange={e => setAliasTargetMetroId(e.target.value)}
                      >
                        {metrosForAlias.map(m => (
                          <option key={m.id} value={m.id}>{m.id} — {m.contents} ({m.status})</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!aliasTargetMetroId || linkBusy}
                        onClick={() => void handleSaveAliasAndAllocate(order.id)}
                      >
                        Save tag map &amp; link to order
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
