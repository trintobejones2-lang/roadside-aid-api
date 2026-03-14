const demoRequests = [
  {
    id: '1',
    service: 'tire',
    address: '55 Oak St, Newark, NJ',
    notes: 'Front right tire flat',
    created: '2 min ago',
  },
  {
    id: '2',
    service: 'jump',
    address: '210 Market St, Jersey City, NJ',
    notes: 'Car won’t start',
    created: '6 min ago',
  },
];

function label(service: string) {
  if (service === 'gas') return 'Gas';
  if (service === 'tire') return 'Tire Change';
  if (service === 'jump') return 'Jump Start';
  if (service === 'tow') return 'Tow';
  return service;
}

export default function ResponderPage() {
  return (
    <main style={{ padding: 40, fontFamily: 'Arial' }}>
      <h1>Responder Dashboard</h1>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" defaultChecked />
          Online
        </label>
      </div>

      <h2 style={{ marginTop: 24 }}>Open Requests</h2>

      <div style={{ display: 'grid', gap: 12, maxWidth: 700, marginTop: 12 }}>
        {demoRequests.map((r) => (
          <div key={r.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{label(r.service)}</strong>
              <span style={{ color: '#666' }}>{r.created}</span>
            </div>
            <div style={{ marginTop: 6 }}>{r.address}</div>
            <div style={{ marginTop: 6, color: '#444' }}>{r.notes}</div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #000',
                  cursor: 'pointer',
                }}
                onClick={() => alert(`Viewing request ${r.id}`)}
              >
                View
              </button>
              <button
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'black',
                  color: 'white',
                  cursor: 'pointer',
                }}
                onClick={() => alert(`Next step: accept request ${r.id} via Supabase RPC`)}
              >
                Accept
              </button>
            </div>
          </div>
        ))}
      </div>

      <a href="/" style={{ display: 'inline-block', marginTop: 20 }}>
        ← Back home
      </a>
    </main>
  );
}
