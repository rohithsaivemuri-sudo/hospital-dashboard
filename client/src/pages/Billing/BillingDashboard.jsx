import React, { useState, useEffect } from 'react';
import { getBills, payBill } from '../../services/api';
import toast from 'react-hot-toast';
import { FaFileInvoiceDollar, FaMoneyBillWave } from 'react-icons/fa';

export default function BillingDashboard() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await getBills();
      setBills(res.data?.data || res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch bills');
      toast.error('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async (bill) => {
    try {
      const amount = bill.total_amount;
      const res = await payBill(bill.bill_id, { amount });
      if (res.data?.success || res.status === 200) {
        toast.success('Bill paid successfully');
        fetchBills();
      } else {
        toast.error('Failed to pay bill');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error paying bill');
    }
  };

  if (loading) return <div style={{ padding: '24px' }}>Loading...</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--danger)' }}>{error}</div>;

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>
        <FaFileInvoiceDollar style={{ marginRight: '8px' }} />
        Billing Dashboard
      </h1>
      
      <div style={{ backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
        {bills.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No bills found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>ID</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Patient</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Amount</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.map(b => (
                <tr key={b.bill_id}>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>{b.bill_id}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>{b.patient_name || 'Unknown'}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>${Number(b.total_amount).toFixed(2)}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ 
                      padding: '4px 12px', 
                      borderRadius: '12px', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      backgroundColor: b.status === 'PAID' ? '#dcfce7' : (b.status === 'PARTIAL' ? '#fef9c3' : '#fee2e2'),
                      color: b.status === 'PAID' ? 'var(--success)' : (b.status === 'PARTIAL' ? '#ca8a04' : 'var(--danger)')
                    }}>
                      {b.status || 'UNPAID'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
                    {b.status !== 'PAID' && (
                      <button 
                        onClick={() => handlePay(b)}
                        style={{ 
                          padding: '6px 12px', 
                          backgroundColor: 'var(--success)', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '6px', 
                          cursor: 'pointer' 
                        }}
                      >
                        <FaMoneyBillWave style={{ marginRight: '4px' }} /> Pay Now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
