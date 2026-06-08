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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Screen = "loading" | "choose" | "card-loading" | "card-ready" | "success-card" | "success-cash" | "error";

export default function PaymentPage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [booking, setBooking] = useState<ReturnType<typeof normalise> | null>(null);
  const [rawToken, setRawToken] = useState("");
  const [stripeObj, setStripeObj] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [payError, setPayError] = useState("");
  const [paying, setPaying] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);
  const stripeLoaded = useRef(false);

  useEffect(() => {
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
  }, []);

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
    } else {
      setScreen("success-card");
      setPaying(false);
    }
  }

  async function handleCash() {
    if (!booking) return;
    setCashLoading(true);
    try {
      await fetch(`${BASE}/api/select-cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: booking.clientName,
          client_email: booking.clientEmail,
          total_aud: booking.totalAud,
          confirmed_data: booking.confirmedData,
        }),
      });
    } catch {
    }
    setCashLoading(false);
    setScreen("success-cash");
  }

  const page: React.CSSProperties = { minHeight: "100vh", background: "#fdf8f4", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#2c1810" };

  if (screen === "error") {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 10, padding: "32px 28px", maxWidth: 480, textAlign: "center", color: "#c0392b" }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>⚠️</div>
          <p style={{ fontFamily: "Georgia,serif", fontSize: "1rem" }}>{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (screen === "success-card") {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#f0fff4", border: "1px solid #a8e6b8", borderRadius: 14, padding: "40px 32px", maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🎉</div>
          <h2 style={{ fontFamily: "Georgia,serif", color: "#2c6e3f", marginBottom: 10, fontSize: "1.4rem" }}>Deposit Paid!</h2>
          <p style={{ color: "#3a6b47", fontSize: "0.95rem", lineHeight: 1.7 }}>
            Your deposit has been received — your appointment is now secured.<br />
            Ankita will be in touch with any final details. See you soon! ✨
          </p>
          <p style={{ color: "#9e7c4a", fontSize: "0.82rem", marginTop: 20 }}>A receipt has been sent to your email.</p>
        </div>
      </div>
    );
  }

  if (screen === "success-cash") {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff9f0", border: "1px solid #e8d5a0", borderRadius: 14, padding: "40px 32px", maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>💵</div>
          <h2 style={{ fontFamily: "Georgia,serif", color: "#6b3d2e", marginBottom: 10, fontSize: "1.4rem" }}>Cash Selected!</h2>
          <p style={{ color: "#4a2e22", fontSize: "0.95rem", lineHeight: 1.7 }}>
            Got it — Ankita has been notified that you'll be paying the A${booking?.totalAud.toFixed(2)} deposit in cash.<br /><br />
            Your appointment is confirmed. See you soon! ✨
          </p>
        </div>
      </div>
    );
  }

  const cardTitleStyle: React.CSSProperties = { padding: "14px 20px 12px", fontFamily: "Georgia,serif", fontSize: "0.98rem", color: "#6b3d2e", borderBottom: "1px solid #f0ddd6", background: "#fdf5f0" };
  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5ede9", fontSize: "0.9rem" };

  return (
    <div style={page}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: "1px solid #e8c4bc", background: "#fff" }}>
        <img src="/logo.png" width={36} height={36} style={{ borderRadius: "50%", objectFit: "cover" }} alt="" />
        <span style={{ fontFamily: "Georgia,serif", fontSize: "1.05rem", color: "#6b3d2e", fontStyle: "italic" }}>The Glam by Ankita</span>
      </div>

      <div style={{ background: "linear-gradient(135deg,#c9a96e,#9e7c4a)", padding: "28px 24px 22px", color: "#fff" }}>
        <h1 style={{ fontFamily: "Georgia,serif", fontSize: "1.45rem", margin: "0 0 4px" }}>Confirm & Pay Deposit</h1>
        <p style={{ fontSize: "0.85rem", opacity: 0.88, margin: 0 }}>Review your booking details below and complete your deposit to lock in your appointment.</p>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px" }}>
        {screen === "loading" && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#6b3d2e" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #c9a96e", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
                    <span style={{ color: "#2c1810", textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {booking.notes && (
              <div style={{ background: "#fff9f0", border: "1px solid #e8d5a0", borderRadius: 8, padding: "14px 18px", marginBottom: 18, fontSize: "0.88rem", color: "#4a2e22", lineHeight: 1.7 }}>
                <strong style={{ color: "#6b3d2e" }}>💬 Note from Ankita:</strong><br />
                {booking.notes}
              </div>
            )}

            <div style={{ background: "linear-gradient(135deg,#fff9f0,#fdf5e8)", border: "2px solid #c9a96e", borderRadius: 10, padding: "20px 24px", marginBottom: 24, textAlign: "center" }}>
              <div style={{ fontSize: "0.82rem", color: "#9e7c4a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Deposit Due</div>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "2rem", color: "#6b3d2e", margin: "6px 0 2px" }}>A${booking.totalAud.toFixed(2)}</div>
              <div style={{ fontSize: "0.82rem", color: "#9e7c4a" }}>Secures your appointment · Non-refundable</div>
            </div>
          </>
        )}

        {screen === "choose" && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "Georgia,serif", fontSize: "1rem", color: "#6b3d2e", marginBottom: 14, textAlign: "center" }}>How would you like to pay?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                onClick={initStripe}
                style={{
                  padding: "20px 12px", background: "linear-gradient(135deg,#c9a96e,#9e7c4a)",
                  color: "#fff", border: "none", borderRadius: 10, cursor: "pointer",
                  fontFamily: "Georgia,serif", fontSize: "0.95rem", fontWeight: 700,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
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
                  padding: "20px 12px", background: "#fff", color: "#6b3d2e",
                  border: "2px solid #c9a96e", borderRadius: 10, cursor: cashLoading ? "not-allowed" : "pointer",
                  fontFamily: "Georgia,serif", fontSize: "0.95rem", fontWeight: 700,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  opacity: cashLoading ? 0.6 : 1,
                }}
              >
                <span style={{ fontSize: "1.6rem" }}>💵</span>
                {cashLoading ? "Confirming…" : "Pay with Cash"}
                <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "#9e7c4a" }}>Notify Ankita</span>
              </button>
            </div>
          </div>
        )}

        {(screen === "card-loading" || screen === "card-ready") && (
          <div style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, padding: "22px 20px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "0.98rem", color: "#6b3d2e" }}>💳 Card Details</div>
              <button
                onClick={() => { stripeLoaded.current = false; setScreen("choose"); setElements(null); setStripeObj(null); setPayError(""); }}
                style={{ background: "none", border: "none", color: "#9e7c4a", fontSize: "0.82rem", cursor: "pointer", textDecoration: "underline" }}
              >
                ← Back
              </button>
            </div>

            {screen === "card-loading" && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#6b3d2e" }}>
                <div style={{ width: 32, height: 32, border: "3px solid #c9a96e", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ fontSize: "0.88rem", fontFamily: "Georgia,serif" }}>Loading payment form…</p>
              </div>
            )}

            <div id="stripe-payment-element" />

            {payError && (
              <div style={{ background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 6, padding: "12px 16px", color: "#c0392b", fontSize: "0.88rem", marginTop: 12 }}>
                {payError}
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={paying || screen !== "card-ready"}
              style={{
                display: "block", width: "100%", padding: 16, marginTop: 16,
                background: (paying || screen !== "card-ready") ? "#ccc" : "linear-gradient(135deg,#c9a96e,#9e7c4a)",
                color: "#fff", border: "none", borderRadius: 8, fontSize: "1rem",
                fontWeight: 700, fontFamily: "Georgia,serif",
                cursor: (paying || screen !== "card-ready") ? "not-allowed" : "pointer",
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
