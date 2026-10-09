import React, { useEffect, useMemo, useState } from 'react';
import { getLabOrders, updateLabOrderStatus, addLabResult, getLabResult, uploadLabReport, downloadLabReport } from '../../services/api';
import toast from 'react-hot-toast';

export default function LabDashboard() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [today, setToday] = useState(false);
  
  const [selected, setSelected] = useState(null);
  const EMPTY_RESULT = { result_value: '', unit: '', reference_low: '', reference_high: '', interpretation: '', escalate: false, technician_notes: '' };
  const [result, setResult] = useState(EMPTY_RESULT);
  const [layout, setLayout] = useState('board');
  const [file, setFile] = useState(null);
  
  const [view, setView] = useState(null);

  const load = async () => {
    try {
      const res = await getLabOrders();
      setOrders(res.data.data || []);
    } catch (e) {
      toast.error('Failed to load lab orders');
    }
  };
  
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => orders.filter(o => {
    if (status !== 'ALL' && o.status !== status) return false;
    if (today && new Date(o.order_date).toDateString() !== new Date().toDateString()) return false;
    const term = search.toLowerCase();
    return `${o.order_id} ${o.patient_name} ${o.test_name}`.toLowerCase().includes(term);
  }), [orders, status, today, search]);

  const counts = s => orders.filter(o => o.status === s).length;

  // Same rule as the server (utils/labRanges.js): a whole-number/decimal value against the bounds.
  const numericValue = /^\s*-?\d+(\.\d+)?\s*$/.test(result.result_value) ? Number(result.result_value) : null;
  const low = result.reference_low === '' ? null : Number(result.reference_low);
  const high = result.reference_high === '' ? null : Number(result.reference_high);
  const autoFlag = numericValue == null || (low == null && high == null) ? null
    : low != null && numericValue < low ? 'LOW' : high != null && numericValue > high ? 'HIGH' : 'NORMAL';
  const flagColor = (f) => (f === 'CRITICAL' || f === 'HIGH' || f === 'LOW' ? 'var(--danger)' : f === 'NORMAL' ? 'var(--success)' : 'inherit');
  const sameUnit = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

  const bound = v => (v == null ? '' : String(Number(v))); // DECIMAL comes back as "70.0000"
  const openEntry = (o) => {
    setSelected(o);
    setResult({ ...EMPTY_RESULT, unit: o.unit || '', reference_low: bound(o.reference_low), reference_high: bound(o.reference_high) });
  };
  // Changing the unit away from the test's unit drops its default bounds (never compare across units).
  const changeUnit = (unit) => setResult(r => {
    const defaults = String(r.reference_low) === bound(selected.reference_low) && String(r.reference_high) === bound(selected.reference_high);
    return { ...r, unit, ...(defaults && !sameUnit(unit, selected.unit) ? { reference_low: '', reference_high: '' } : defaults && sameUnit(unit, selected.unit) ? { reference_low: bound(selected.reference_low), reference_high: bound(selected.reference_high) } : {}) };
  });

  const actionFor = (o) => (o.status === 'ORDERED'
    ? <button onClick={() => startProcessing(o.order_id)} style={{ padding: '6px 12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Start Processing</button>
    : o.status === 'PROCESSING'
      ? <button onClick={() => openEntry(o)} style={{ padding: '6px 12px', background: 'var(--warning)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Enter Result</button>
      : <button onClick={() => showResult(o.order_id)} style={{ padding: '6px 12px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>View Result</button>);

  const startProcessing = async id => {
    try {
      await updateLabOrderStatus(id, 'PROCESSING');
      toast.success('Processing started');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Unable to start');
    }
  };

  const saveResult = async e => {
    e.preventDefault();
    try {
      const res = await addLabResult({
        order_id: selected.order_id,
        result_value: result.result_value,
        unit: result.unit,
        technician_notes: result.technician_notes,
        ...(result.reference_low !== '' ? { reference_low: Number(result.reference_low) } : {}),
        ...(result.reference_high !== '' ? { reference_high: Number(result.reference_high) } : {}),
        // The server computes the flag when it can; a manual one is only sent when it cannot (or to escalate).
        ...(result.escalate ? { interpretation: 'CRITICAL' } : !autoFlag && result.interpretation ? { interpretation: result.interpretation } : {}),
      });
      const flag = res.data?.data?.interpretation;
      if (flag && flag !== 'NORMAL') toast(`Result flagged ${flag}`, { icon: '⚠️' });
      if (file) {
        const f = new FormData();
        f.append('report', file);
        await uploadLabReport(selected.order_id, f);
      }
      toast.success('Result completed');
      setSelected(null);
      setResult(EMPTY_RESULT);
      setFile(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Unable to save result');
    }
  };

  const showResult = async id => {
    try {
      const res = await getLabResult(id);
      setView(res.data.data);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Unable to load result');
    }
  };
  
  const downloadFile = async (attachmentId, originalName) => {
    try {
      const response = await downloadLabReport(attachmentId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (e) {
      // Blob responses carry the server's JSON error as a Blob; surface its message when there is one.
      let message = null;
      if (e.response?.data instanceof Blob) {
        try { message = JSON.parse(await e.response.data.text()).message; } catch { /* not JSON */ }
      }
      toast.error(message || 'Failed to download report');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Laboratory Work Queue</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 8, boxShadow: 'var(--shadow)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Pending Tests</div>
          <div style={{ fontSize: 28, fontWeight: 'bold' }}>{counts('ORDERED')}</div>
        </div>
        <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 8, boxShadow: 'var(--shadow)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Processing Tests</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--primary)' }}>{counts('PROCESSING')}</div>
        </div>
        <div style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 8, boxShadow: 'var(--shadow)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Completed Tests</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--success)' }}>{counts('COMPLETED')}</div>
        </div>
      </div>
      
      <div style={{ background: 'var(--bg-card)', padding: 24, borderRadius: 8, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
          <input 
            placeholder="Search patient, order, test" 
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 4, flex: 1 }}
          />
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 4 }}>
            <option value="ALL">All Statuses</option>
            <option value="ORDERED">Ordered</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={today} onChange={e => setToday(e.target.checked)} /> Today
          </label>
        </div>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['board', 'table'].map(l => (
            <button key={l} onClick={() => setLayout(l)} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border)', background: layout === l ? 'var(--primary)' : 'transparent', color: layout === l ? 'white' : 'inherit', cursor: 'pointer' }}>
              {l === 'board' ? 'Board' : 'Table'}
            </button>
          ))}
        </div>
        {layout === 'board' && (
          <div data-testid="lab-board" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {[['ORDERED', 'Awaiting processing'], ['PROCESSING', 'Processing'], ['COMPLETED', 'Completed']].map(([st, label]) => (
              <div key={st} data-column={st} style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: 12 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{label} <span style={{ color: 'var(--text-secondary)' }}>({rows.filter(o => o.status === st).length})</span></h3>
                {rows.filter(o => o.status === st).map(o => (
                  <div key={o.order_id} data-order={o.order_id} style={{ background: 'var(--bg-card)', borderRadius: 6, padding: 10, marginBottom: 10, boxShadow: 'var(--shadow)', borderLeft: `4px solid ${o.interpretation && o.interpretation !== 'NORMAL' ? 'var(--danger)' : 'var(--border)'}` }}>
                    <div style={{ fontWeight: 'bold' }}>#{o.order_id} {o.test_name}</div>
                    <div style={{ fontSize: 13 }}>{o.patient_name} · Dr. {o.doctor_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>{new Date(o.order_date).toLocaleString()}{o.interpretation ? <strong style={{ color: flagColor(o.interpretation), marginLeft: 8 }}>{o.interpretation}</strong> : null}</div>
                    {actionFor(o)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {layout === 'table' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)' }}>
              <th style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>ID</th>
              <th style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>Patient</th>
              <th style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>Test</th>
              <th style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>Ordered By</th>
              <th style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>Date</th>
              <th style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>Status</th>
              <th style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => (
              <tr key={o.order_id}>
                <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{o.order_id}</td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{o.patient_name}</td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{o.test_name}</td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>Dr. {o.doctor_name}</td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>{new Date(o.order_date).toLocaleDateString()}</td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ 
                      padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                      background: o.status === 'ORDERED' ? '#fef3c7' : o.status === 'COMPLETED' ? '#dcfce7' : '#e0e7ff',
                      color: o.status === 'ORDERED' ? '#d97706' : o.status === 'COMPLETED' ? '#15803d' : '#4f46e5'
                  }}>
                    {o.status}
                  </span>
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                  {actionFor(o)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7" style={{ padding: 24, textAlign: 'center' }}>No orders found</td></tr>}
          </tbody>
        </table>
        )}
      </div>
      
      {/* ENTER RESULT MODAL */}
      {selected && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2>Enter Result: {selected.test_name}</h2>
            <p>Patient: {selected.patient_name}</p>
            <form onSubmit={saveResult}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8 }}>Result Value</label>
                  <input required name="result_value" value={result.result_value} onChange={e => setResult({...result, result_value: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box', borderColor: autoFlag && autoFlag !== 'NORMAL' ? 'var(--danger)' : undefined, color: autoFlag && autoFlag !== 'NORMAL' ? 'var(--danger)' : 'inherit', fontWeight: autoFlag && autoFlag !== 'NORMAL' ? 'bold' : 'normal', borderWidth: 2 }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8 }}>Unit</label>
                  <input name="unit" value={result.unit} onChange={e => changeUnit(e.target.value)} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8 }}>Reference Range <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>(test: {selected.normal_range || '—'})</span></label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input name="reference_low" type="number" step="any" placeholder="Low" value={result.reference_low} onChange={e => setResult({...result, reference_low: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
                    <span>–</span>
                    <input name="reference_high" type="number" step="any" placeholder="High" value={result.reference_high} onChange={e => setResult({...result, reference_high: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8 }}>Interpretation</label>
                  {autoFlag ? (
                    <div data-testid="auto-flag" style={{ padding: 8, fontWeight: 'bold', color: flagColor(result.escalate ? 'CRITICAL' : autoFlag) }}>
                      {result.escalate ? 'CRITICAL (escalated)' : `${autoFlag} (automatic)`}
                    </div>
                  ) : (
                    <select name="interpretation" value={result.interpretation} onChange={e => setResult({...result, interpretation: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}>
                      <option value="">Not flagged</option>
                      <option value="NORMAL">Normal</option>
                      <option value="LOW">Low</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  )}
                  {autoFlag && (
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 13 }}>
                      <input type="checkbox" name="escalate" checked={result.escalate} onChange={e => setResult({...result, escalate: e.target.checked})} /> Escalate as CRITICAL
                    </label>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8 }}>Technician Notes</label>
                <textarea rows="3" value={result.technician_notes} onChange={e => setResult({...result, technician_notes: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 8 }}>Attach Report (PDF/PNG/JPG)</label>
                <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={e => setFile(e.target.files[0])} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" onClick={() => setSelected(null)} style={{ padding: '10px 16px', border: '1px solid var(--border)', background: 'white', borderRadius: 4 }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 16px', border: 'none', background: 'var(--success)', color: 'white', borderRadius: 4 }}>Complete Test & Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW RESULT MODAL */}
      {view && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2>Lab Result Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
              <div><strong>Value:</strong> <span style={{ color: flagColor(view.result?.interpretation), fontWeight: 'bold' }}>{view.result?.result_value} {view.result?.unit}</span></div>
              <div><strong>Interpretation:</strong> <span style={{ color: view.result?.interpretation === 'CRITICAL' ? 'red' : 'inherit', fontWeight: 'bold' }}>{view.result?.interpretation}</span></div>
              <div><strong>Reference Range:</strong> {view.result?.reference_range || '—'}{view.result?.interpretation_source ? ` · flag ${view.result.interpretation_source === 'AUTO' ? 'automatic' : 'manual'}` : ''}</div>
              <div><strong>Performed By:</strong> {view.result?.performed_by_name}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {view.result?.technician_notes || 'None'}</div>
            </div>
            
            {view.attachments && view.attachments.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3>Attached Reports</h3>
                {view.attachments.map(a => (
                  <div key={a.attachment_id} style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 8 }}>
                    <span>{a.original_filename}</span>
                    <button onClick={() => downloadFile(a.attachment_id, a.original_filename)} style={{ padding: '4px 8px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Download</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setView(null)} style={{ padding: '10px 16px', border: '1px solid var(--border)', background: 'white', borderRadius: 4, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000 };
const modalContentStyle = { background: 'white', padding: 32, borderRadius: 8, width: '100%', maxWidth: 700, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' };
