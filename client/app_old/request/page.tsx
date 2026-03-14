import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function RequestPage() {
  const router = useRouter();
  const [service, setService] = useState('gas');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');

  async function submit() {
    setMsg('');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return router.push('/login');

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', auth.user.id)
      .single();
    if (profile?.role !== 'driver') return setMsg('This account is not a driver.');

    const { data, error } = await supabase
      .from('requests')
      .insert({ driver_id: auth.user.id, service, address_text: address, notes })
      .select()
      .single();

    if (error) return setMsg(error.message);

    router.push(`/status/${data.id}`);
  }

  return (
    <main style={{ padding: 40, fontFamily: 'Arial' }}>
      <h1>Request Roadside Help</h1>

      <div style={{ display: 'grid', gap: 12, maxWidth: 520, marginTop: 16 }}>
        <label>
          Service type
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
          >
            <option value="gas">Gas</option>
            <option value="tire">Tire Change</option>
            <option value="jump">Jump Start</option>
            <option value="tow">Tow</option>
          </select>
        </label>

        <label>
          Address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, State"
            style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the responder should know?"
            style={{ display: 'block', width: '100%', padding: 10, marginTop: 6, minHeight: 90 }}
          />
        </label>

        <button
          onClick={submit}
          style={{
            padding: '12px 18px',
            background: 'black',
            color: 'white',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Submit Request
        </button>

        {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
        <a href="/">← Back home</a>
      </div>
    </main>
  );
}
