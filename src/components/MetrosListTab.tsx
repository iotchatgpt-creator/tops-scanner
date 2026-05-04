import { Fragment, useState, useEffect, useMemo } from 'react';
import { List, RefreshCw, ChevronRight, ChevronDown, Clock } from 'lucide-react';
import {
  getAllMetros, getAllLocations, getAllOrders, getAllRfidAliases, getMetroScanHistory,
  metroMatchesDashboardBucket,
  type Metro, type Location, type Order, type RfidAlias, type ScanEvent,
  type MetroDashboardBucket,
} from '../db';

const BUCKET_LABELS: Record<MetroDashboardBucket, string> = {
  all: 'All metros',
  cleanAvailable: 'Clean available',
  allocated: 'Allocated',
  inTransit: 'In transit / pickup',
  atStorage: 'At storage',
  soiled: 'Soiled',
  atPlant: 'At plant / cleaning',
};

const BUCKET_ORDER: MetroDashboardBucket[] = [
  'all', 'cleanAvailable', 'allocated', 'inTransit', 'atStorage', 'soiled', 'atPlant',
];

export default function MetrosListTab({
  listBucket,
  onListBucketChange,
}: {
  listBucket: MetroDashboardBucket;
  onListBucketChange: (b: MetroDashboardBucket) => void;
}) {
  const [metros, setMetros] = useState<Metro[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [aliases, setAliases] = useState<RfidAlias[]>([]);
  const [detailMetroId, setDetailMetroId] = useState<string | null>(null);
  const [histEvents, setHistEvents] = useState<ScanEvent[]>([]);

  const load = async () => {
    const [m, l, o, a] = await Promise.all([
      getAllMetros(),
      getAllLocations(),
      getAllOrders(),
      getAllRfidAliases(),
    ]);
    setMetros(m.sort((x, y) => x.id.localeCompare(y.id)));
    setLocations(l);
    setOrders(o);
    setAliases(a);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    setDetailMetroId(null);
  }, [listBucket]);

  useEffect(() => {
    if (!detailMetroId) {
      setHistEvents([]);
      return;
    }
    void getMetroScanHistory(detailMetroId).then(setHistEvents);
  }, [detailMetroId]);

  const locById = useMemo(() => Object.fromEntries(locations.map(x => [x.id, x])), [locations]);
  const orderById = useMemo(() => Object.fromEntries(orders.map(x => [x.id, x])), [orders]);
  const tagsByMetroId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of aliases) {
      const list = map.get(row.metroId) ?? [];
      list.push(row.tagId);
      map.set(row.metroId, list);
    }
    return map;
  }, [aliases]);

  const filteredMetros = useMemo(
    () => metros.filter(m => metroMatchesDashboardBucket(m, listBucket)),
    [metros, listBucket],
  );

  const toggleDetail = (metroId: string) => {
    setDetailMetroId(prev => (prev === metroId ? null : metroId));
  };

  return (
    <div className="card">
      <div className="card-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="card-title">Metros</div>
          <div className="card-subtitle">
            {filteredMetros.length} of {metros.length} shown
            {listBucket !== 'all' ? ` · ${BUCKET_LABELS[listBucket]}` : ''}. Click a row for scan history and full fields.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
          <List size={22} style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      <div className="metro-bucket-chips" style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem', paddingBottom: '0.75rem',
        borderBottom: '1px solid var(--border)',
      }}>
        {BUCKET_ORDER.map(b => (
          <button
            key={b}
            type="button"
            className={`btn btn-sm ${listBucket === b ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onListBucketChange(b)}
          >
            {BUCKET_LABELS[b]}
          </button>
        ))}
      </div>

      {metros.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem' }}>
          <List size={36} />
          <p>No metros in the database.</p>
        </div>
      ) : filteredMetros.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem' }}>
          <List size={36} />
          <p>No metros in this category. Try another filter above.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th style={{ width: '2rem' }} aria-hidden />
                <th>Metro ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Location</th>
                <th>Work order</th>
                <th>Contents</th>
                <th>RFID tag map</th>
                <th>Last scanned</th>
              </tr>
            </thead>
            <tbody>
              {filteredMetros.map(m => {
                const loc = locById[m.locationId];
                const ord = m.orderId ? orderById[m.orderId] : undefined;
                const tags = tagsByMetroId.get(m.id) ?? [];
                const open = detailMetroId === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr
                      className="metro-row-expandable"
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => toggleDetail(m.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleDetail(m.id);
                        }
                      }}
                    >
                      <td style={{ verticalAlign: 'middle', color: 'var(--text-muted)' }}>
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </td>
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{m.id}</td>
                      <td><span className={`badge badge-${m.type.toLowerCase()}`}>{m.type}</span></td>
                      <td><span className={`badge badge-${m.status.toLowerCase()}`}>{m.status}</span></td>
                      <td style={{ fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 600 }}>{loc?.name ?? m.locationId}</div>
                        {loc?.area && <div style={{ color: 'var(--text-muted)' }}>{loc.area}</div>}
                      </td>
                      <td style={{ fontSize: '0.82rem', maxWidth: '200px' }}>
                        {m.orderId ? (
                          <>
                            <div style={{ fontWeight: 600 }}>{m.orderId}</div>
                            {ord?.description && (
                              <div style={{ color: 'var(--text-muted)' }}>{ord.description}</div>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', maxWidth: '220px' }}>{m.contents}</td>
                      <td style={{ fontSize: '0.75rem', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all', maxWidth: '180px' }}>
                        {tags.length ? tags.join(', ') : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(m.lastScannedAt).toLocaleString()}
                        <div>{m.lastScanMethod}</div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="metro-detail-row">
                        <td colSpan={9} className="metro-detail-panel">
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.65rem', marginBottom: '0.75rem' }}>
                            <div><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Created</span><div style={{ fontWeight: 600 }}>{new Date(m.createdAt).toLocaleString()}</div></div>
                            <div><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Location ID</span><div style={{ fontWeight: 600 }}>{m.locationId}</div></div>
                            <div><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Order ID</span><div style={{ fontWeight: 600 }}>{m.orderId ?? '—'}</div></div>
                            <div><span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Last scan method</span><div style={{ fontWeight: 600 }}>{m.lastScanMethod}</div></div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.35rem' }}>Scan history</div>
                          {histEvents.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No scan events yet.</div>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: '1.1rem', maxHeight: '200px', overflowY: 'auto' }}>
                              {histEvents.slice(0, 12).map(evt => (
                                <li key={evt.id} style={{ marginBottom: '0.35rem' }}>
                                  <Clock size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem', opacity: 0.7 }} />
                                  <strong>{evt.action}</strong>
                                  <span style={{ color: 'var(--text-muted)' }}> · {new Date(evt.timestamp).toLocaleString()} · {evt.method}</span>
                                  {evt.notes ? <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{evt.notes}</div> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
