import React, { useEffect, useMemo, useState } from 'react';
import { getLabOrders, updateLabOrderStatus, addLabResult, getLabResult, uploadLabReport, downloadLabReport } from '../../services/api';
import toast from 'react-hot-toast';

export default function LabDashboard() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [today, setToday] = useState(false);
  
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState({ result_value: '', unit: '', reference_range: '', interpretation: 'NORMAL', technician_notes: '' });
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
      await addLabResult({ order_id: selected.order_id, ...result });
      if (file) {
        const f = new FormData();
        f.append('report', file);
        await uploadLabReport(selected.order_id, f);
      }
      toast.success('Result completed');
      setSelected(null);
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
      toast.error('Unable to load result');
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
      toast.error('Failed to download report');
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
                  {o.status === 'ORDERED' ? 
                    <button onClick={() => startProcessing(o.order_id)} style={{ padding: '6px 12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Start Processing</button> 
                  : o.status === 'PROCESSING' ? 
                    <button onClick={() => { setSelected(o); setResult(r => ({ ...r, unit: o.unit || '', reference_range: o.normal_range || '' })); }} style={{ padding: '6px 12px', background: 'var(--warning)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Enter Result</button> 
                  : <button onClick={() => showResult(o.order_id)} style={{ padding: '6px 12px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>View Result</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7" style={{ padding: 24, textAlign: 'center' }}>No orders found</td></tr>}
          </tbody>
        </table>
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
                  <input required value={result.result_value} onChange={e => setResult({...result, result_value: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8 }}>Unit</label>
                  <input value={result.unit} onChange={e => setResult({...result, unit: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8 }}>Reference Range</label>
                  <input value={result.reference_range} onChange={e => setResult({...result, reference_range: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8 }}>Interpretation</label>
                  <select value={result.interpretation} onChange={e => setResult({...result, interpretation: e.target.value})} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}>
                    <option value="NORMAL">Normal</option>
                    <option value="LOW">Low</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
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
              <div><strong>Value:</strong> {view.result?.result_value} {view.result?.unit}</div>
              <div><strong>Interpretation:</strong> <span style={{ color: view.result?.interpretation === 'CRITICAL' ? 'red' : 'inherit', fontWeight: 'bold' }}>{view.result?.interpretation}</span></div>
              <div><strong>Reference Range:</strong> {view.result?.reference_range}</div>
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
