import React, { useEffect, useMemo, useState } from 'react';
import { getPrescriptions, dispensePrescription, getPrescription, getMedicines, updateMedicineStock } from '../../services/api';
import toast from 'react-hot-toast';

export default function PharmacyDashboard() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  const [detail, setDetail] = useState(null);
  
  // Inventory Modals
  const [receiveStockMedicine, setReceiveStockMedicine] = useState(null);
  const [adjustStockMedicine, setAdjustStockMedicine] = useState(null);
  
  const [stockForm, setStockForm] = useState({ quantity: '', type: 'RECEIPT', reason: '', notes: '' });

  const load = async () => {
    try {
      const [pRes, mRes] = await Promise.all([getPrescriptions(), getMedicines()]);
      setPrescriptions(pRes.data.data || []);
      setMedicines(mRes.data.data || []);
    } catch (e) {
      toast.error('Failed to load pharmacy data');
    }
  };

  useEffect(() => { load(); }, []);

  const filteredPrescriptions = useMemo(() => {
    return prescriptions.filter(p => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      const term = search.toLowerCase();
      return p.patientName?.toLowerCase().includes(term) || String(p.prescription_id).includes(term);
    });
  }, [prescriptions, statusFilter, search]);

  const stats = {
    pending: prescriptions.filter(p => p.status === 'CREATED').length,
    dispensedToday: prescriptions.filter(p => p.status === 'DISPENSED' && new Date(p.prescription_date).toDateString() === new Date().toDateString()).length,
    lowStock: medicines.filter(m => m.stock_quantity > 0 && m.stock_quantity <= m.reorder_level).length,
    outOfStock: medicines.filter(m => m.stock_quantity === 0).length
  };

  const openDetail = async (id) => {
    try {
      const res = await getPrescription(id);
      setDetail(res.data.data);
    } catch (e) {
      toast.error('Failed to load prescription detail');
    }
  };

  const handleDispense = async (id) => {
    if (!window.confirm("Verify items and dispense?")) return;
    try {
      await dispensePrescription(id);
      toast.success('Prescription dispensed successfully');
      setDetail(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Unable to dispense prescription');
    }
  };

  const submitStockChange = async (e, medicineId) => {
    e.preventDefault();
    try {
      await updateMedicineStock(medicineId, {
        quantity: Number(stockForm.quantity),
        type: stockForm.type,
        reason: stockForm.reason,
        notes: stockForm.notes
      });
      toast.success('Stock updated successfully');
      setReceiveStockMedicine(null);
      setAdjustStockMedicine(null);
      setStockForm({ quantity: '', type: 'RECEIPT', reason: '', notes: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Unable to update stock');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <h1>Pharmacy Work Center</h1>
      
      {/* SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div className="stat-card" style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '8px', boxShadow: 'var(--shadow)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Pending Prescriptions</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.pending}</div>
        </div>
        <div className="stat-card" style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '8px', boxShadow: 'var(--shadow)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Dispensed Today</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--success)' }}>{stats.dispensedToday}</div>
        </div>
        <div className="stat-card" style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '8px', boxShadow: 'var(--shadow)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Low Stock Items</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--warning)' }}>{stats.lowStock}</div>
        </div>
        <div className="stat-card" style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '8px', boxShadow: 'var(--shadow)' }}>
          <div style={{ color: 'var(--text-secondary)' }}>Out of Stock</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--danger)' }}>{stats.outOfStock}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
        
        {/* PRESCRIPTION QUEUE */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', boxShadow: 'var(--shadow)' }}>
          <h2 style={{ marginTop: 0 }}>Prescription Queue</h2>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <input 
              placeholder="Search patient or ID" 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              style={{ flex: 1, padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }}
            />
            <select 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '4px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="CREATED">Pending</option>
              <option value="DISPENSED">Dispensed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>ID</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Patient</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Items</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrescriptions.map(p => (
                <tr key={p.prescription_id}>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>#{p.prescription_id}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>{p.patientName}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>{p.medication}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ 
                      padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                      background: p.status === 'CREATED' ? '#fef3c7' : p.status === 'DISPENSED' ? '#dcfce7' : '#f1f5f9',
                      color: p.status === 'CREATED' ? '#d97706' : p.status === 'DISPENSED' ? '#15803d' : '#64748b'
                    }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => openDetail(p.prescription_id)} style={{ padding: '6px 12px', background: 'var(--secondary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>View / Dispense</button>
                  </td>
                </tr>
              ))}
              {filteredPrescriptions.length === 0 && (
                <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>No prescriptions found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* INVENTORY */}
        <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '8px', boxShadow: 'var(--shadow)' }}>
          <h2 style={{ marginTop: 0 }}>Inventory Management</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Medicine</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Stock</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Reorder Lvl</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map(m => {
                const status = m.stock_quantity === 0 ? 'OUT OF STOCK' : (m.stock_quantity <= m.reorder_level ? 'LOW STOCK' : 'IN STOCK');
                return (
                  <tr key={m.medicine_id}>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border)', fontWeight: 'bold' }}>{m.name}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>{m.stock_quantity}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>{m.reorder_level}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ 
                        padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                        background: status === 'OUT OF STOCK' ? '#fee2e2' : status === 'LOW STOCK' ? '#fef3c7' : '#dcfce7',
                        color: status === 'OUT OF STOCK' ? '#b91c1c' : status === 'LOW STOCK' ? '#d97706' : '#15803d'
                      }}>
                        {status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => { setReceiveStockMedicine(m); setStockForm({ quantity: '', type: 'RECEIPT', reason: 'Restock', notes: '' }); }}
                        style={{ padding: '6px 12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >Receive</button>
                      <button 
                        onClick={() => { setAdjustStockMedicine(m); setStockForm({ quantity: '', type: 'ADJUSTMENT', reason: 'DAMAGED', notes: '' }); }}
                        style={{ padding: '6px 12px', background: 'var(--warning)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >Adjust</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* PRESCRIPTION MODAL */}
      {detail && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>Prescription #{detail.prescription_id}</h2>
              <button onClick={() => setDetail(null)} style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div><strong>Status:</strong> {detail.status}</div>
              <div><strong>Date:</strong> {new Date(detail.prescription_date).toLocaleString()}</div>
            </div>

            <h3>Items</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '24px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Medicine</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Dosage</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Req Qty</th>
                  <th style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map(item => (
                  <tr key={item.item_id}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{item.medicine_name}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{item.dosage} {item.frequency}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>{item.quantity}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--border)', color: item.stock_quantity < item.quantity ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>
                      {item.stock_quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {detail.status === 'CREATED' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button onClick={() => setDetail(null)} style={{ padding: '10px 16px', border: '1px solid var(--border)', background: 'white', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button 
                  onClick={() => handleDispense(detail.prescription_id)} 
                  style={{ padding: '10px 16px', border: 'none', background: 'var(--primary)', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Confirm Dispense All
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECEIVE STOCK MODAL */}
      {receiveStockMedicine && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2>Receive Stock: {receiveStockMedicine.name}</h2>
            <form onSubmit={(e) => submitStockChange(e, receiveStockMedicine.medicine_id)}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Quantity Received</label>
                <input 
                  type="number" min="1" required 
                  value={stockForm.quantity} 
                  onChange={e => setStockForm({...stockForm, quantity: e.target.value})}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Notes / Supplier</label>
                <input 
                  type="text" 
                  value={stockForm.notes} 
                  onChange={e => setStockForm({...stockForm, notes: e.target.value})}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setReceiveStockMedicine(null)} style={{ padding: '10px 16px', border: '1px solid var(--border)', background: 'white', borderRadius: '4px' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 16px', border: 'none', background: 'var(--success)', color: 'white', borderRadius: '4px' }}>Receive Inventory</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST STOCK MODAL */}
      {adjustStockMedicine && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2>Adjust Stock: {adjustStockMedicine.name}</h2>
            <p>Current Stock: {adjustStockMedicine.stock_quantity}</p>
            <form onSubmit={(e) => submitStockChange(e, adjustStockMedicine.medicine_id)}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Quantity to Deduct</label>
                <input 
                  type="number" min="1" max={adjustStockMedicine.stock_quantity} required 
                  value={stockForm.quantity} 
                  onChange={e => setStockForm({...stockForm, quantity: e.target.value})}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Reason</label>
                <select 
                  value={stockForm.reason} 
                  onChange={e => setStockForm({...stockForm, reason: e.target.value})}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                >
                  <option value="DAMAGED">Damaged</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="LOST">Lost</option>
                  <option value="CORRECTION">Correction</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px' }}>Notes</label>
                <input 
                  type="text" 
                  value={stockForm.notes} 
                  onChange={e => setStockForm({...stockForm, notes: e.target.value})}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setAdjustStockMedicine(null)} style={{ padding: '10px 16px', border: '1px solid var(--border)', background: 'white', borderRadius: '4px' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 16px', border: 'none', background: 'var(--warning)', color: 'white', borderRadius: '4px' }}>Adjust Stock</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const modalOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000 };
const modalContentStyle = { background: 'white', padding: '32px', borderRadius: '8px', width: '100%', maxWidth: '600px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' };
