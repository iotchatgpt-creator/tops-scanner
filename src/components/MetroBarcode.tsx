import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { isMetroIdBarcode, normalizeRfidInput } from '../db';

/**
 * Renders a CODE128 barcode for a metro ID. Only metros use this encoding in the POC — orders/locations are not barcoded.
 */
export default function MetroBarcode({ metroId }: { metroId: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !isMetroIdBarcode(metroId)) return;
    const value = normalizeRfidInput(metroId);
    el.replaceChildren();
    try {
      JsBarcode(el, value, {
        format: 'CODE128',
        width: 2,
        height: 44,
        margin: 10,
        displayValue: true,
        fontSize: 13,
        background: '#ffffff',
        lineColor: '#0f172a',
      });
    } catch {
      // Invalid data for encoder — should not occur for MTR-### IDs
    }
  }, [metroId]);

  if (!isMetroIdBarcode(metroId)) return null;

  return (
    <div className="metro-barcode-wrap">
      <div className="metro-barcode-label">Metro barcode (CODE128)</div>
      <svg ref={svgRef} className="metro-barcode-svg" role="img" aria-label={`Barcode encoding ${normalizeRfidInput(metroId)}`} />
      <p className="metro-barcode-hint">Encodes the metro ID only — not orders or locations.</p>
    </div>
  );
}
