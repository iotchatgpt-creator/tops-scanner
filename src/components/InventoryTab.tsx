import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { getInventorySummary, type InventorySummary } from '../db';

export default function InventoryTab() {
  const [data, setData] = useState<InventorySummary[]>([]);

  useEffect(() => { getInventorySummary().then(setData); }, []);

  const totals = data.reduce((acc, d) => ({
    clean: acc.clean + d.cleanCount,
    soiled: acc.soiled + d.soiledCount,
    alloc: acc.alloc + d.allocatedCount,
    transit: acc.transit + d.inTransitCount,
    total: acc.total + d.totalCount,
  }), { clean: 0, soiled: 0, alloc: 0, transit: 0, total: 0 });

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Inventory by Location</div>
            <div className="card-subtitle">Clean and soiled textile metro counts across all locations</div>
          </div>
          <BarChart3 size={20} style={{ color: 'var(--text-muted)' }} />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Type</th>
                <th>Area</th>
                <th style={{ textAlign: 'center' }}>Clean</th>
                <th style={{ textAlign: 'center' }}>Soiled</th>
                <th style={{ textAlign: 'center' }}>Allocated</th>
                <th style={{ textAlign: 'center' }}>In Transit</th>
                <th style={{ textAlign: 'center' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.locationId}>
                  <td style={{ fontWeight: 600 }}>{row.locationName}</td>
                  <td><span className={`badge badge-${row.locationType.toLowerCase()}`}>{row.locationType}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{row.area}</td>
                  <td className="count-cell count-clean">{row.cleanCount || '—'}</td>
                  <td className="count-cell count-soiled">{row.soiledCount || '—'}</td>
                  <td className="count-cell count-alloc">{row.allocatedCount || '—'}</td>
                  <td className="count-cell count-transit">{row.inTransitCount || '—'}</td>
                  <td className="count-cell" style={{ fontWeight: 800 }}>{row.totalCount || '—'}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc' }}>
                <td colSpan={3} style={{ fontWeight: 700 }}>Totals</td>
                <td className="count-cell count-clean" style={{ fontWeight: 800 }}>{totals.clean}</td>
                <td className="count-cell count-soiled" style={{ fontWeight: 800 }}>{totals.soiled}</td>
                <td className="count-cell count-alloc" style={{ fontWeight: 800 }}>{totals.alloc}</td>
                <td className="count-cell count-transit" style={{ fontWeight: 800 }}>{totals.transit}</td>
                <td className="count-cell" style={{ fontWeight: 800 }}>{totals.total}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Clean vs Soiled flow summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card">
          <div className="card-title" style={{ color: 'var(--success)' }}>🟢 Clean Textile Flow</div>
          <div className="card-subtitle mb-1">Product injection → Buffer → Allocate → Pickup → Transit → Storage → Delivered</div>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.8 }}>
            <div>Buffer inventory: <strong>{data.filter(d => d.locationType === 'Buffer').reduce((a, d) => a + d.cleanCount, 0)}</strong> metros</div>
            <div>At storage locations: <strong>{data.filter(d => d.locationType === 'Storage').reduce((a, d) => a + d.cleanCount, 0)}</strong> metros</div>
            <div>Staging area: <strong>{data.filter(d => d.locationType === 'StagingArea').reduce((a, d) => a + d.cleanCount, 0)}</strong> metros</div>
          </div>
        </div>
        <div className="card">
          <div className="card-title" style={{ color: 'var(--error)' }}>🔴 Soiled Textile Flow</div>
          <div className="card-subtitle mb-1">Soiled at location → Pickup → Transit → Dock → Plant → Clean → Return to buffer</div>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.8 }}>
            <div>Soiled at locations: <strong>{data.filter(d => d.locationType === 'Storage').reduce((a, d) => a + d.soiledCount, 0)}</strong> metros</div>
            <div>At dock: <strong>{data.filter(d => d.locationType === 'Dock').reduce((a, d) => a + d.soiledCount, 0)}</strong> metros</div>
            <div>At plant: <strong>{data.filter(d => d.locationType === 'Plant').reduce((a, d) => a + d.totalCount, 0)}</strong> metros</div>
          </div>
        </div>
      </div>
    </>
  );
}
