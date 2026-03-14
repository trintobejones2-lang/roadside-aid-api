export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "Arial" }}>
      <h1>Roadside Assistance App</h1>
      <p>Request help instantly.</p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <a
          href="/request"
          style={{
            padding: "12px 18px",
            background: "black",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Request Help
        </a>
      </div>
    </main>
  );
}
