"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function onLogin() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);
    router.push("/");
  }

  return (
    <main style={{ padding: 40, fontFamily: "Arial", maxWidth: 520 }}>
      <h1>Login</h1>
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: 10 }} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: 10 }} />
        <button onClick={onLogin} style={{ padding: "12px 16px", background: "black", color: "white", borderRadius: 8 }}>
          Login
        </button>
        {msg && <p style={{ color: "crimson" }}>{msg}</p>}
        <a href="/signup">Need an account? Sign up</a>
      </div>
    </main>
  );
}
