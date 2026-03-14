'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<'driver' | 'responder'>('driver');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function onSignup() {
    setMsg('');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return setMsg(error.message);

    // Create profile row (RLS allows insert where id = auth.uid())
    const userId = data.user?.id;
    if (!userId)
      return setMsg('Signup succeeded but no user id returned. Check email confirmation setting.');

    const { error: profileErr } = await supabase.from('profiles').insert({
      id: userId,
      role,
      full_name: fullName,
      phone,
    });

    if (profileErr) return setMsg(profileErr.message);

    // responder status row (optional)
    if (role === 'responder') {
      await supabase.from('responder_status').insert({ responder_id: userId, is_online: false });
    }

    router.push('/');
  }

  return (
    <main style={{ padding: 40, fontFamily: 'Arial', maxWidth: 520 }}>
      <h1>Sign up</h1>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <label>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            style={{ display: 'block', width: '100%', padding: 10, marginTop: 6 }}
          >
            <option value="driver">Driver</option>
            <option value="responder">Responder</option>
          </select>
        </label>

        <input
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />

        <button
          onClick={onSignup}
          style={{ padding: '12px 16px', background: 'black', color: 'white', borderRadius: 8 }}
        >
          Create account
        </button>

        {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
        <a href="/login">Already have an account? Login</a>
      </div>
    </main>
  );
}
