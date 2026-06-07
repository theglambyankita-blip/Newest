import { useEffect, useState, useRef } from "react";

function fromUrlSafeBase64(token: string): Record<string, string> {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  return JSON.parse(atob(b64 + "=".repeat(pad)));
}

const LABEL_MAP: Record<string, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  client_email: "Email",
  _client_email: "Email",
  phone: "Phone",
  contact_method: "Preferred Contact",
  preferred_date: "Requested Date",
  num_people: "Number of People",
  services: "Services Requested",
  service: "Services Requested",
  location: "Location / Suburb",
  postcode: "Postcode",
  referral: "How They Found You",
  vision: "Look / Vision / Inspo",
};

const SKIP = new Set([
  "owner_email", "from_email", "_client_name", "type",
  "time", "status", "notes", "total_aud",
]);

export default function ReviewPage() {
  const [data, setData] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const serviceRef = useRef<HTMLInputElement>(null);
  const peopleRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const totalRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const b = params.get("b");
    if (!b) {
      setError("No booking data found. Please use the link from your email.");
      return;
    }
    try {
      const decoded = fromUrlSafeBase64(b);
      setData(decoded);
    } catch {
      setError("Invalid booking link. Please use the link from your email.");
    }
  }, []);

  async function handleSend() {
    setSendError(null);
    const total = parseFloat(totalRef.current?.value || "");
    if (!total || total <= 0) {
      setSendError("Please enter a deposit amount before sending.");
      return;
    }
    const email = emailRef.current?.value.trim();
    if (!email) {
      setSendError("Client email is required.");
      return;
    }

    setSending(true);

    const firstName = firstRef.current?.value.trim() || "";
    const lastName = lastRef.current?.value.trim() || "";
    const clientName = (firstName + " " + lastName).trim() || "there";

    const confirmed: Record<string, string> = {
      "Service": serviceRef.current?.value || "",
      "Date": dateRef.current?.value || "",
      "Time": timeRef.current?.value || "",
      "People": peopleRef.current?.value || "",
      "Location": locationRef.current?.value || "",
      "Client Name": clientName,
      "Phone": phoneRef.current?.value || "",
    };

    try {
      const res = await fetch("/api/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName,
          client_email: email,
          confirmed_data: confirmed,
          notes: notesRef.current?.value.trim() || "",
          total_aud: total,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setSent(true);
    } catch (e: unknown) {
      setSendError("Could not send — please try again or email the client directly.");
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fdf8f4", padding: 24 }}>
        <div style={{ background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 10, padding: "32px 28px", maxWidth: 480, textAlign: "center", color: "#c0392b" }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>⚠️</div>
          <p style={{ fontFamily: "Georgia,serif", fontSize: "1rem" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fdf8f4" }}>
        <div style={{ textAlign: "center", color: "#6b3d2e" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #c9a96e", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontFamily: "Georgia,serif" }}>Loading booking…</p>
        </div>
      </div>
    );
  }

  const submissionRows = Object.entries(data).filter(([k, v]) => !SKIP.has(k) && v);

  const cardStyle: React.CSSProperties = {
    background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, marginBottom: 18, overflow: "hidden",
  };
  const cardTitleStyle: React.CSSProperties = {
    padding: "14px 20px 12px", fontFamily: "Georgia,serif", fontSize: "0.98rem", color: "#6b3d2e",
    borderBottom: "1px solid #f0ddd6", background: "#fdf5f0",
  };
  const cardBodyStyle: React.CSSProperties = { padding: "18px 20px" };
  const fieldStyle: React.CSSProperties = { marginBottom: 14 };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.72rem", fontWeight: 700, color: "#6b3d2e",
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 13px", border: "1.5px solid #e0c8c0", borderRadius: 6,
    fontSize: "0.92rem", color: "#2c1810", background: "#fff", fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  };
  const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

  if (sent) {
    return (
      <div style={{ minHeight: "100vh", background: "#fdf8f4", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "#f0fff4", border: "1px solid #a8e6b8", borderRadius: 14, padding: "40px 32px", maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✅</div>
          <h2 style={{ fontFamily: "Georgia,serif", color: "#2c6e3f", marginBottom: 10, fontSize: "1.3rem" }}>Confirmation Sent!</h2>
          <p style={{ color: "#3a6b47", fontSize: "0.95rem", lineHeight: 1.7 }}>
            The client has been emailed their confirmed booking details and payment link.<br />
            You'll also receive a copy for your records.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fdf8f4", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#2c1810" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: "1px solid #e8c4bc", background: "#fff" }}>
        <img src="/logo.png" width={36} height={36} style={{ borderRadius: "50%", objectFit: "cover" }} alt="" />
        <span style={{ fontFamily: "Georgia,serif", fontSize: "1.05rem", color: "#6b3d2e", fontStyle: "italic" }}>The Glam by Ankita</span>
      </div>

      <div style={{ background: "linear-gradient(135deg,#c9a96e,#9e7c4a)", padding: "26px 24px 20px", color: "#fff" }}>
        <h1 style={{ fontFamily: "Georgia,serif", fontSize: "1.45rem", margin: "0 0 4px" }}>Review Booking Request</h1>
        <p style={{ fontSize: "0.85rem", opacity: 0.88, margin: 0 }}>Check what the client submitted, confirm the details, set your deposit, then send their confirmation.</p>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px" }}>

        <div style={{ ...cardStyle, border: "1px solid #e8d5a0" }}>
          <div style={{ ...cardTitleStyle, background: "#fff9f0" }}>📋 What the Client Submitted</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
            <tbody>
              {submissionRows.length === 0 ? (
                <tr><td style={{ padding: 14, color: "#999" }}>No data found.</td></tr>
              ) : submissionRows.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: "8px 14px", fontWeight: 700, color: "#6b3d2e", whiteSpace: "nowrap", background: "#fdf5f0", borderBottom: "1px solid #f0ddd6" }}>
                    {LABEL_MAP[k] || k.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "8px 14px", color: "#2c1810", borderBottom: "1px solid #f0ddd6" }}>{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>Confirm Client Details <span style={{ fontFamily: "sans-serif", fontWeight: 400, fontSize: "0.72rem", color: "#999" }}>(edit if needed)</span></div>
          <div style={cardBodyStyle}>
            <div style={rowStyle}>
              <div style={fieldStyle}><label style={labelStyle}>First Name</label><input ref={firstRef} style={inputStyle} defaultValue={data.first_name || ""} /></div>
              <div style={fieldStyle}><label style={labelStyle}>Last Name</label><input ref={lastRef} style={inputStyle} defaultValue={data.last_name || ""} /></div>
            </div>
            <div style={rowStyle}>
              <div style={fieldStyle}><label style={labelStyle}>Email</label><input ref={emailRef} type="email" style={inputStyle} defaultValue={data._client_email || data.client_email || ""} /></div>
              <div style={fieldStyle}><label style={labelStyle}>Phone</label><input ref={phoneRef} type="tel" style={inputStyle} defaultValue={data.phone || ""} /></div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>Confirm Booking Details <span style={{ fontFamily: "sans-serif", fontWeight: 400, fontSize: "0.72rem", color: "#999" }}>(edit if needed)</span></div>
          <div style={cardBodyStyle}>
            <div style={rowStyle}>
              <div style={fieldStyle}><label style={labelStyle}>Confirmed Date</label><input ref={dateRef} type="date" style={inputStyle} defaultValue={data.preferred_date || ""} /></div>
              <div style={fieldStyle}><label style={labelStyle}>Time</label><input ref={timeRef} type="time" style={inputStyle} defaultValue={data.time || ""} /></div>
            </div>
            <div style={fieldStyle}><label style={labelStyle}>Service</label><input ref={serviceRef} style={inputStyle} defaultValue={data.services || data.service || ""} /></div>
            <div style={rowStyle}>
              <div style={fieldStyle}><label style={labelStyle}>Number of People</label><input ref={peopleRef} type="text" style={inputStyle} defaultValue={data.num_people || ""} /></div>
              <div style={fieldStyle}><label style={labelStyle}>Location / Address</label><input ref={locationRef} style={inputStyle} defaultValue={data.location || ""} /></div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, border: "2px solid #c9a96e", background: "linear-gradient(135deg,#fff9f0,#fdf5e8)" }}>
          <div style={{ ...cardTitleStyle, background: "linear-gradient(135deg,#f7e9cc,#f0ddb8)", borderBottomColor: "#e0c4a0" }}>💰 Set Deposit Amount</div>
          <div style={cardBodyStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Amount to Charge (AUD $)</label>
              <input ref={totalRef} type="number" min="0" step="0.01" placeholder="e.g. 150" style={{ ...inputStyle, fontSize: "1.18rem", fontWeight: 700, color: "#6b3d2e" }} />
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>Personal Note to Client <span style={{ fontFamily: "sans-serif", fontWeight: 400, fontSize: "0.72rem", color: "#999" }}>(optional)</span></div>
          <div style={cardBodyStyle}>
            <textarea
              ref={notesRef}
              placeholder="e.g. So excited to work with you! Please arrive with a clean face and no eye makeup…"
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
            />
          </div>
        </div>

        {sendError && (
          <div style={{ background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 6, padding: "12px 16px", color: "#c0392b", fontSize: "0.88rem", marginBottom: 16 }}>
            {sendError}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            display: "block", width: "100%", padding: 16,
            background: sending ? "#ccc" : "linear-gradient(135deg,#c9a96e,#9e7c4a)",
            color: "#fff", border: "none", borderRadius: 8, fontSize: "1rem",
            fontWeight: 700, fontFamily: "Georgia,serif", cursor: sending ? "not-allowed" : "pointer",
            letterSpacing: "0.03em", transition: "opacity .2s",
          }}
        >
          {sending ? "Sending…" : "Send Confirmation to Client ✦"}
        </button>
      </div>
    </div>
  );
}
