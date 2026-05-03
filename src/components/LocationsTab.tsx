import { useState, useEffect } from 'react';
import { MapPin, Package } from 'lucide-react';
import { getAllLocations, getAllMetros, type Location, type Metro } from '../db';

export default function LocationsTab() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [metros, setMetros] = useState<Metro[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAllLocations(), getAllMetros()]).then(([l, m]) => {
      setLocations(l);
      setMetros(m);
    });
  }, []);

  const getMetrosAtLocation = (locId: string) => metros.filter(m => m.locationId === locId);

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">All Locations</div>
            <div className="card-subtitle">{locations.length} locations configured in the system</div>
          </div>
          <MapPin size={20} style={{ color: 'var(--text-muted)' }} />
        </div>

        {locations.map(loc => {
          const locMetros = getMetrosAtLocation(loc.id);
          const expanded = expandedId === loc.id;
          return (
            <div key={loc.id} className="list-item" style={{ flexDirection: 'column', cursor: 'pointer' }}
              onClick={() => setExpandedId(expanded ? null : loc.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <div className="item-icon" style={{
                    background: loc.type === 'Buffer' ? '#e0f2fe' : loc.type === 'Storage' ? '#dcfce7' : loc.type === 'Dock' ? '#fef3c7' : loc.type === 'Plant' ? '#ede9fe' : '#e0e7ff',
                    color: loc.type === 'Buffer' ? '#0369a1' : loc.type === 'Storage' ? '#166534' : loc.type === 'Dock' ? '#92400e' : loc.type === 'Plant' ? '#5b21b6' : '#3730a3',
                  }}>
                    <MapPin size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      {loc.name}
                      <span className={`badge badge-${loc.type.toLowerCase()}`}>{loc.type}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{loc.area} · ID: {loc.id}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    background: locMetros.length > 0 ? 'var(--primary-light)' : '#f1f5f9',
                    color: locMetros.length > 0 ? 'var(--primary)' : 'var(--text-muted)',
                    padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700
                  }}>
                    {locMetros.length} metro{locMetros.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {expanded && locMetros.length > 0 && (
                <div style={{ width: '100%', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {locMetros.map(m => (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.4rem 0.6rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.82rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Package size={14} style={{ color: 'var(--text-muted)' }} />
                          <span style={{ fontWeight: 700 }}>{m.id}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{m.contents}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <span className={`badge badge-${m.type.toLowerCase()}`}>{m.type}</span>
                          <span className={`badge badge-${m.status.toLowerCase()}`}>{m.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {expanded && locMetros.length === 0 && (
                <div style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No metros at this location currently.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
