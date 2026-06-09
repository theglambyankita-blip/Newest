import { useEffect, useState, useRef } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";

function decodeToken(raw: string): Record<string, unknown> {
  const payload = raw.includes(".") ? raw.substring(0, raw.lastIndexOf(".")) : raw;
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  return JSON.parse(atob(b64 + "=".repeat(pad)));
}

function normalise(d: Record<string, unknown>) {
  const clientName = (d.clientName || d.client_name || "") as string;
  const clientEmail = (d.clientEmail || d.client_email || "") as string;
  const totalAud = Number(d.totalAud ?? d.total_aud ?? 0);
  const notes = (d.notes || "") as string;
  const confirmedData = (d.confirmedData || d.confirmed_data || {}) as Record<string, string>;
  return { clientName, clientEmail, totalAud, notes, confirmedData };
}

function buildCalendarUrls(confirmedData: Record<string, string>, uid?: string) {
  const date = confirmedData["Date"] || confirmedData["Confirmed Date"] || "";
  const time = confirmedData["Time"] || "09:00";
  const service = confirmedData["Service"] || "Makeup Appointment";
  const location = confirmedData["Location"] || "";
  const numPeople = confirmedData["Number of People"] || confirmedData["People"] || "";

  if (!date) return null;

  const title = `${service} — The Glam by Ankita`;
  const descParts = [`Appointment with Ankita from The Glam by Ankita.`, `Service: ${service}`];
  if (numPeople) descParts.push(`Number of people: ${numPeople}`);
  if (location) descParts.push(`Location: ${location}`);
  const desc = descParts.join("\n");

  const [year, month, day] = date.split("-").map(Number);
  const [hour, min] = (time || "09:00").split(":").map(Number);
  const pad = (n: number) => String(n || 0).padStart(2, "0");

  const startDT = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(min)}00`;
  const endH = (hour + 2) % 24;
  const endDT = `${year}${pad(month)}${pad(day)}T${pad(endH)}${pad(min)}00`;

  const gCal =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${startDT}/${endDT}` +
    `&details=${encodeURIComponent(desc)}` +
    `&location=${encodeURIComponent(location)}`;

  const outlook =
    `https://outlook.live.com/calendar/0/deeplink/compose` +
    `?subject=${encodeURIComponent(title)}` +
    `&startdt=${date}T${pad(hour)}:${pad(min)}:00` +
    `&enddt=${date}T${pad(endH)}:${pad(min)}:00` +
    `&body=${encodeURIComponent(desc)}` +
    `&location=${encodeURIComponent(location)}`;

  const icsParams = new URLSearchParams({
    title,
    date,
    time: time || "09:00",
    location,
    description: desc,
    uid: uid || `booking-${date}@theglambyankita.com`,
  });
  const ics = `/api/calendar?${icsParams}`;

  return { gCal, outlook, ics };
}

function CalendarButtons({ confirmedData }: { confirmedData: Record<string, string> }) {
  const cal = buildCalendarUrls(confirmedData);
  if (!cal) return null;

  const btnBase: React.CSSProperties = {
    display: "inline-block",
    padding: "9px 16px",
    borderRadius: 5,
    fontWeight: 700,
    fontSize: "0.82rem",
    textDecoration: "none",
    color: "#fff",
    margin: "4px",
    letterSpacing: "0.02em",
  };

  return (
    <div style={{ marginTop: 22, padding: "18px 20px", background: "#f0f6ff", border: "1px solid #c5d8f7", borderRadius: 10, textAlign: "center" }}>
      <p style={{ margin: "0 0 12px", fontSize: "0.78rem", fontWeight: 700, color: "#4a6fa5", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        📅 Add to your calendar
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 0 }}>
        <a href={cal.gCal} target="_blank" rel="noopener noreferrer" style={{ ...btnBase, background: "#4285f4" }}>
          Google Calendar
        </a>
        <a href={cal.outlook} target="_blank" rel="noopener noreferrer" style={{ ...btnBase, background: "#0078d4" }}>
          Outlook
        </a>
        <a href={cal.ics} style={{ ...btnBase, background: "#555" }}>
          Apple Calendar (.ics)
        </a>
      </div>
    </div>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Screen =
  | "loading"
  | "choose"
  | "card-loading"
  | "card-ready"
  | "paying"
  | "success-card"
  | "success-cash"
  | "error";

type Booking = ReturnType<typeof normalise>;

type SavedDetails = { name: string; email: string; phone: string };

function loadSavedDetails(): SavedDetails | null {
  try {
    const raw = localStorage.getItem("glamSavedDetails");
    if (!raw) return null;
    const d = JSON.parse(raw) as SavedDetails;
    if (!d.name && !d.email && !d.phone) return null;
    return d;
  } catch { return null; }
}

export default function PaymentPage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [rawToken, setRawToken] = useState("");
  const [stripeObj, setStripeObj] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);
  const stripeLoaded = useRef(false);

  const [savedDetails, setSavedDetails] = useState<SavedDetails | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: "", email: "", phone: "" });
  const [detailsSaved, setDetailsSaved] = useState(false);

  useEffect(() => {
    setSavedDetails(loadSavedDetails());
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("t") || params.get("b") || "";
      if (!token) {
        setErrorMsg("No booking data found. Please use the link from your email.");
        setScreen("error");
        return;
      }
      setRawToken(token);

      let decoded: Record<string, unknown>;
      try {
        decoded = decodeToken(token);
      } catch {
        setErrorMsg("Your booking link appears to be invalid. Please contact Ankita directly.");
        setScreen("error");
        return;
      }

      const b = normalise(decoded);
      if (!b.totalAud || b.totalAud <= 0) {
        setErrorMsg("This booking link does not have a valid deposit amount. Please contact Ankita.");
        setScreen("error");
        return;
      }
      setBooking(b);
      setScreen("choose");
    } catch {
      setErrorMsg("Something went wrong loading your booking. Please contact Ankita directly.");
      setScreen("error");
    }
  }, []);

  function handleSaveDetails() {
    const details: SavedDetails = {
      name: saveForm.name.trim(),
      email: saveForm.email.trim(),
      phone: saveForm.phone.trim(),
    };
    if (!details.name && !details.email && !details.phone) return;
    localStorage.setItem("glamSavedDetails", JSON.stringify(details));
    setSavedDetails(details);
    setShowSaveForm(false);
    setDetailsSaved(true);
  }

  function handleClearDetails() {
    localStorage.removeItem("glamSavedDetails");
    setSavedDetails(null);
    setDetailsSaved(false);
  }

  async function initStripe() {
    if (stripeLoaded.current) return;
    stripeLoaded.current = true;
    setScreen("card-loading");
    try {
      const cfgRes = await fetch(`${BASE}/api/config`);
      const cfg = await cfgRes.json();
      if (!cfg.stripePublishableKey) throw new Error("Stripe not configured.");

      const stripe = await loadStripe(cfg.stripePublishableKey);
      if (!stripe) throw new Error("Failed to load Stripe.");

      const piRes = await fetch(`${BASE}/api/create-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken }),
      });
      const piJson = await piRes.json();
      if (!piRes.ok) throw new Error(piJson.error || "Could not create payment.");

      const els = stripe.elements({
        clientSecret: piJson.client_secret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#c9a96e",
            colorBackground: "#ffffff",
            colorText: "#2c1810",
            colorDanger: "#c0392b",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            borderRadius: "6px",
          },
        },
      });

      const payEl = els.create("payment");
      setStripeObj(stripe);
      setElements(els);
      setScreen("card-ready");

      setTimeout(() => {
        payEl.mount("#stripe-payment-element");
      }, 50);
    } catch (e: unknown) {
      stripeLoaded.current = false;
      setErrorMsg((e as Error).message || "Could not load payment. Please try again or contact Ankita.");
      setScreen("error");
    }
  }

  async function handlePay() {
    if (!stripeObj || !elements || !booking) return;
    setPayError("");
    setPaying(true);
    setScreen("paying");

    const { error } = await stripeObj.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
        receipt_email: booking.clientEmail || undefined,
      },
      redirect: "if_required",
    });

    if (error) {
      setPayError(error.message || "Payment failed. Please try again.");
      setPaying(false);
      setScreen("card-ready");
    } else {
      try {
        await fetch(`${BASE}/api/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: rawToken }),
        });
      } catch {
      }
      setPaying(false);
      setScreen("success-card");
    }
  }

  async function handleCash() {
    if (!booking) return;
    setCashLoading(true);
    try {
      await fetch(`${BASE}/api/select-cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken }),
      });
    } catch {
    }
    setCashLoading(false);
    setScreen("success-cash");
  }

  const page: React.CSSProperties = {
    minHeight: "100vh",
    background: "#fdf8f4",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    color: "#2c1810",
  };

  const Header = () => (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: "1px solid #e8c4bc", background: "#fff" }}>
        <img src="/logo.png" width={36} height={36} style={{ borderRadius: "50%", objectFit: "cover" }} alt="" />
        <span style={{ fontFamily: "Georgia,serif", fontSize: "1.05rem", color: "#6b3d2e", fontStyle: "italic" }}>The Glam by Ankita</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );

  if (screen === "error") {
    return (
      <div style={page}>
        <Header />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, minHeight: "80vh" }}>
          <div style={{ background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 10, padding: "32px 28px", maxWidth: 480, textAlign: "center", color: "#c0392b" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>⚠️</div>
            <p style={{ fontFamily: "Georgia,serif", fontSize: "1rem" }}>{errorMsg}</p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "success-card") {
    return (
      <div style={page}>
        <Header />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 60px" }}>
          <div style={{ background: "#f0fff4", border: "1px solid #a8e6b8", borderRadius: 14, padding: "36px 28px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontFamily: "Georgia,serif", color: "#2c6e3f", marginBottom: 10, fontSize: "1.4rem" }}>Deposit Paid!</h2>
            <p style={{ color: "#3a6b47", fontSize: "0.95rem", lineHeight: 1.7, margin: 0 }}>
              Your deposit has been received — your appointment is officially locked in.<br />
              A confirmation has been sent to your email. See you soon! ✨
            </p>
          </div>

          {booking && (
            <>
              <div style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, marginTop: 18, overflow: "hidden" }}>
                <div style={{ padding: "13px 20px 11px", fontFamily: "Georgia,serif", fontSize: "0.95rem", color: "#6b3d2e", borderBottom: "1px solid #f0ddd6", background: "#fdf5f0" }}>
                  📅 Your Booking
                </div>
                <div style={{ padding: "16px 20px" }}>
                  {Object.entries(booking.confirmedData).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f5ede9", fontSize: "0.88rem" }}>
                      <span style={{ color: "#6b3d2e", fontWeight: 600 }}>{k}</span>
                      <span style={{ color: "#2c1810", textAlign: "right", maxWidth: "55%" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <CalendarButtons confirmedData={booking.confirmedData} />
            </>
          )}
        </div>
      </div>
    );
  }

  if (screen === "success-cash") {
    return (
      <div style={page}>
        <Header />
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 60px" }}>
          <div style={{ background: "#fff9f0", border: "1px solid #e8d5a0", borderRadius: 14, padding: "36px 28px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>✅</div>
            <h2 style={{ fontFamily: "Georgia,serif", color: "#6b3d2e", marginBottom: 10, fontSize: "1.4rem" }}>Booking Confirmed!</h2>
            <p style={{ color: "#4a2e22", fontSize: "0.95rem", lineHeight: 1.7, margin: 0 }}>
              Got it — Ankita has been notified and your appointment is confirmed.<br />
              A confirmation email has been sent to you. See you soon! ✨
            </p>
            {booking && (
              <p style={{ color: "#9e7c4a", fontSize: "0.85rem", marginTop: 10 }}>
                Cash deposit of <strong>A${booking.totalAud.toFixed(2)}</strong> to be paid at appointment.
              </p>
            )}
          </div>

          {booking && (
            <>
              <div style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, marginTop: 18, overflow: "hidden" }}>
                <div style={{ padding: "13px 20px 11px", fontFamily: "Georgia,serif", fontSize: "0.95rem", color: "#6b3d2e", borderBottom: "1px solid #f0ddd6", background: "#fdf5f0" }}>
                  📅 Your Booking
                </div>
                <div style={{ padding: "16px 20px" }}>
                  {Object.entries(booking.confirmedData).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f5ede9", fontSize: "0.88rem" }}>
                      <span style={{ color: "#6b3d2e", fontWeight: 600 }}>{k}</span>
                      <span style={{ color: "#2c1810", textAlign: "right", maxWidth: "55%" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <CalendarButtons confirmedData={booking.confirmedData} />
            </>
          )}
        </div>
      </div>
    );
  }

  const cardTitleStyle: React.CSSProperties = {
    padding: "14px 20px 12px",
    fontFamily: "Georgia,serif",
    fontSize: "0.98rem",
    color: "#6b3d2e",
    borderBottom: "1px solid #f0ddd6",
    background: "#fdf5f0",
  };
  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "7px 0",
    borderBottom: "1px solid #f5ede9",
    fontSize: "0.9rem",
  };

  return (
    <div style={page}>
      <Header />

      <div style={{ background: "linear-gradient(135deg,#c9a96e,#9e7c4a)", padding: "28px 24px 22px", color: "#fff" }}>
        <h1 style={{ fontFamily: "Georgia,serif", fontSize: "1.45rem", margin: "0 0 4px" }}>Confirm & Pay Deposit</h1>
        <p style={{ fontSize: "0.85rem", opacity: 0.88, margin: 0 }}>
          Review your booking details below and complete your deposit to lock in your appointment.
        </p>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px" }}>

        {/* ── Fast checkout banner ── */}
        {savedDetails && screen !== "loading" && (
          <div style={{ background: "#fff", border: "1.5px solid #c9a96e", borderRadius: 10, padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#c9a96e,#9e7c4a)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "1rem", flexShrink: 0 }}>👤</div>
              <div>
                <div style={{ fontWeight: 700, color: "#2c1810", fontSize: "0.9rem" }}>Welcome back, {savedDetails.name || savedDetails.email}!</div>
                <div style={{ fontSize: "0.78rem", color: "#9e7c4a" }}>{[savedDetails.email, savedDetails.phone].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <button onClick={handleClearDetails} style={{ background: "none", border: "none", color: "#c9a96e", fontSize: "0.78rem", cursor: "pointer", textDecoration: "underline", flexShrink: 0 }}>Not you?</button>
          </div>
        )}

        {screen === "loading" && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#6b3d2e" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #c9a96e", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ fontFamily: "Georgia,serif" }}>Loading your booking…</p>
          </div>
        )}

        {booking && (
          <>
            <div style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
              <div style={cardTitleStyle}>📅 Your Confirmed Booking</div>
              <div style={{ padding: "18px 20px" }}>
                {Object.entries(booking.confirmedData).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} style={rowStyle}>
                    <span style={{ color: "#6b3d2e", fontWeight: 600 }}>{k}</span>
                    <span style={{ color: "#2c1810", textAlign: "right", maxWidth: "55%" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {booking.notes && (
              <div style={{ background: "#fff9f0", border: "1px solid #e8d5a0", borderRadius: 8, padding: "14px 18px", marginBottom: 18, fontSize: "0.88rem", color: "#4a2e22", lineHeight: 1.7 }}>
                <strong style={{ color: "#6b3d2e" }}>💬 Note from Ankita:</strong>
                <br />
                {booking.notes}
              </div>
            )}

            <div style={{ background: "linear-gradient(135deg,#fff9f0,#fdf5e8)", border: "2px solid #c9a96e", borderRadius: 10, padding: "20px 24px", marginBottom: 24, textAlign: "center" }}>
              <div style={{ fontSize: "0.82rem", color: "#9e7c4a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Deposit Due
              </div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "2rem", color: "#6b3d2e", margin: "6px 0 2px" }}>
                A${booking.totalAud.toFixed(2)}
              </div>
              <div style={{ fontSize: "0.82rem", color: "#9e7c4a" }}>Secures your appointment · Non-refundable</div>
            </div>
          </>
        )}

        {screen === "choose" && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "Georgia,serif", fontSize: "1rem", color: "#6b3d2e", marginBottom: 14, textAlign: "center" }}>
              How would you like to pay?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                onClick={initStripe}
                style={{
                  padding: "20px 12px",
                  background: "linear-gradient(135deg,#c9a96e,#9e7c4a)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "Georgia,serif",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: "1.6rem" }}>💳</span>
                Pay by Card
                <span style={{ fontSize: "0.75rem", fontWeight: 400, opacity: 0.88 }}>Secure · instant</span>
              </button>
              <button
                onClick={handleCash}
                disabled={cashLoading}
                style={{
                  padding: "20px 12px",
                  background: "#fff",
                  color: "#6b3d2e",
                  border: "2px solid #c9a96e",
                  borderRadius: 10,
                  cursor: cashLoading ? "not-allowed" : "pointer",
                  fontFamily: "Georgia,serif",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  opacity: cashLoading ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: "1.6rem" }}>💵</span>
                {cashLoading ? "Confirming…" : "Lay-by / Cash"}
                <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "#9e7c4a" }}>Pay at appointment</span>
              </button>
            </div>
          </div>
        )}

        {(screen === "card-loading" || screen === "card-ready" || screen === "paying") && (
          <div style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, padding: "22px 20px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "0.98rem", color: "#6b3d2e" }}>💳 Card Details</div>
              {screen !== "paying" && (
                <button
                  onClick={() => {
                    stripeLoaded.current = false;
                    setScreen("choose");
                    setElements(null);
                    setStripeObj(null);
                    setPayError("");
                  }}
                  style={{ background: "none", border: "none", color: "#9e7c4a", fontSize: "0.82rem", cursor: "pointer", textDecoration: "underline" }}
                >
                  ← Back
                </button>
              )}
            </div>

            {screen === "card-loading" && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#6b3d2e" }}>
                <div style={{ width: 32, height: 32, border: "3px solid #c9a96e", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                <p style={{ fontSize: "0.88rem", fontFamily: "Georgia,serif" }}>Loading payment form…</p>
              </div>
            )}

            <div id="stripe-payment-element" />

            {payError && (
              <div style={{ background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 6, padding: "12px 16px", color: "#c0392b", fontSize: "0.88rem", marginTop: 12 }}>
                {payError}
              </div>
            )}

            {/* ── Save details for next time ── */}
            {screen === "card-ready" && !savedDetails && !detailsSaved && (
              <div style={{ marginTop: 18, border: "1px solid #e8c4bc", borderRadius: 8, overflow: "hidden" }}>
                <button
                  onClick={() => setShowSaveForm(v => !v)}
                  style={{ width: "100%", background: "#fdf5f0", border: "none", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: "#6b3d2e", fontSize: "0.85rem", fontWeight: 600, fontFamily: "inherit" }}
                >
                  <span>💾 Save your details for faster checkout next time</span>
                  <span style={{ fontSize: "0.78rem", color: "#c9a96e" }}>{showSaveForm ? "▲ Hide" : "▼ Show"}</span>
                </button>
                {showSaveForm && (
                  <div style={{ padding: "14px 16px", background: "#fff" }}>
                    <p style={{ fontSize: "0.78rem", color: "#9e7c4a", margin: "0 0 12px", lineHeight: 1.5 }}>
                      Saved on this device only — no account needed. Your card details are never stored here.
                    </p>
                    {(["name", "email", "phone"] as const).map((field) => (
                      <input
                        key={field}
                        type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
                        placeholder={field === "name" ? "Your name" : field === "email" ? "Email address" : "Phone number"}
                        value={saveForm[field]}
                        onChange={e => setSaveForm(f => ({ ...f, [field]: e.target.value }))}
                        style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e0c8c0", borderRadius: 6, fontSize: "0.9rem", color: "#2c1810", background: "#fff", fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box" }}
                      />
                    ))}
                    <button
                      onClick={handleSaveDetails}
                      style={{ background: "linear-gradient(135deg,#c9a96e,#9e7c4a)", border: "none", color: "#fff", padding: "9px 20px", borderRadius: 6, fontSize: "0.88rem", fontWeight: 700, cursor: "pointer", fontFamily: "Georgia,serif" }}
                    >
                      Save Details
                    </button>
                  </div>
                )}
              </div>
            )}
            {screen === "card-ready" && (savedDetails || detailsSaved) && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#f0fff4", border: "1px solid #a8e6b8", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.82rem" }}>
                <span style={{ color: "#2c6e3f" }}>✅ Details saved for faster checkout next time</span>
                <button onClick={handleClearDetails} style={{ background: "none", border: "none", color: "#9e7c4a", fontSize: "0.78rem", cursor: "pointer", textDecoration: "underline" }}>Clear</button>
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={paying || screen !== "card-ready"}
              style={{
                display: "block",
                width: "100%",
                padding: 16,
                marginTop: 16,
                background: paying || screen !== "card-ready" ? "#ccc" : "linear-gradient(135deg,#c9a96e,#9e7c4a)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: "1rem",
                fontWeight: 700,
                fontFamily: "Georgia,serif",
                cursor: paying || screen !== "card-ready" ? "not-allowed" : "pointer",
                letterSpacing: "0.03em",
              }}
            >
              {paying ? "Processing…" : `Pay A$${booking?.totalAud.toFixed(2) ?? ""} Deposit ✦`}
            </button>
            <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#aaa", marginTop: 10 }}>
              Secured by Stripe · Your card details are never stored by us.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
