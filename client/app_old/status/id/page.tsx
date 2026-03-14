'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';

export default function StatusPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [req, setReq] = useState<any>(null);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return router.push('/login');

    const { data, error } = await supabase.from('requests').select('*').eq('id', id).single();
    if (error) return setMsg(error.message);
    setReq(data);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (msg)
    return (
      <main style={{ padding: 40, fontFamily: 'Arial' }}>
        <p style={{ color: 'crimson' }}>{msg}</p>
      </main>
    );
  if (!req)
    return (
      <main style={{ padding: 40, fontFamily: 'Arial' }}>
        <p>Loading…</p>
      </main>
    );

  return (
    <main style={{ padding: 40, fontFamily: 'Arial' }}>
      <h1>Request Status</h1>
      <p>
        <strong>Status:</strong> {req.status}
      </p>
      <p>
        <strong>Service:</strong> {req.service}
      </p>
      <p>
        <strong>Address:</strong> {req.address_text}
      </p>
      {req.notes && (
        <p>
          <strong>Notes:</strong> {req.notes}
        </p>
      )}
      <a href="/">← Back home</a>
    </main>
  );
}
