import { useState, useEffect } from 'react';
import { DollarSign, Search } from 'lucide-react';
import { getAllGarmentProcessingPrices, type GarmentProcessingPrice } from '../db';

export default function PayoutsTab() {
  const [payouts, setPayouts] = useState<GarmentProcessingPrice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    getAllGarmentProcessingPrices().then(setPayouts);
  }, []);

  const filteredPayouts = payouts.filter(p => 
    p.textileProductId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Garment Processing Prices (Payouts)</div>
            <div className="card-subtitle">Manage payout rates for garment processing across plants</div>
          </div>
          <DollarSign size={20} style={{ color: 'var(--success)' }} />
        </div>

        <div style={{ marginBottom: '1rem', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search by Product ID..." 
            className="input-field" 
            style={{ paddingLeft: '2.5rem', width: '100%', maxWidth: '400px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Product ID</th>
                <th>Processing Type</th>
                <th>Plant ID</th>
                <th>Effective Date</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayouts.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.textileProductId}</td>
                  <td>
                    <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                      Type {p.garmentProcessingTypeId}
                    </span>
                  </td>
                  <td>Plant {p.plantId}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{new Date(p.effectiveDate).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>
                    ${p.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
              {filteredPayouts.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No processing prices found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
