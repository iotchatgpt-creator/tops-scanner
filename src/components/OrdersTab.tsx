import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Package, ChevronDown, ChevronUp } from 'lucide-react';
import {
  type Order, type Metro, type Location,
  getAllOrders, getAllMetros, getAllLocations, createOrder, deleteOrder,
  getNextOrderId, updateOrderStatus, type OrderStatus
} from '../db';

export default function OrdersTab({ onDataChange }: { onDataChange: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [metros, setMetros] = useState<Metro[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [newId, setNewId] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDest, setNewDest] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    const [o, m, l] = await Promise.all([getAllOrders(), getAllMetros(), getAllLocations()]);
    setOrders(o.sort((a, b) => new Date(b.orderDateTime).getTime() - new Date(a.orderDateTime).getTime()));
    setMetros(m);
    setLocations(l);
  };

  useEffect(() => { load(); }, []);

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
                placeholder="e.g. ORD-003" onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} />
              <button className="btn btn-outline btn-sm" onClick={handleSuggest}>Suggest</button>
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
          <button className="btn btn-success" disabled={!newId.trim() || !newDest} onClick={handleCreate}>
            <Plus size={15} /> Create Order
          </button>
          <button className="btn btn-outline" onClick={load}><RefreshCw size={15} /> Refresh</button>
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
                  <button className="btn btn-warning btn-sm" onClick={() => handleStatusUpdate(order.id, 'Pickup')}>Pickup</button>
                )}
                {order.status === 'Pickup' && (
                  <button className="btn btn-warning btn-sm" onClick={() => handleStatusUpdate(order.id, 'InTransit')}>Dispatch</button>
                )}
                {order.status === 'InTransit' && (
                  <button className="btn btn-success btn-sm" onClick={() => handleStatusUpdate(order.id, 'Delivered')}>Deliver</button>
                )}
                <button className="btn btn-outline btn-sm" onClick={() => setExpandedId(expanded ? null : order.id)}>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(order.id)}><Trash2 size={14} /></button>
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
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No metros allocated. Use Metro Scan tab to scan and allocate.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
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
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
