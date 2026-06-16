import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    `&text=${encodeURIComponent(title)}&dates=${startDT}/${endDT}` +
    `&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(location)}`;
  const outlook =
    `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}` +
    `&startdt=${date}T${pad(hour)}:${pad(min)}:00&enddt=${date}T${pad(endH)}:${pad(min)}:00` +
    `&body=${encodeURIComponent(desc)}&location=${encodeURIComponent(location)}`;
  const icsParams = new URLSearchParams({ title, date, time: time || "09:00", location, description: desc, uid: uid || `booking-${date}@theglambyankita.com` });
  return { gCal, outlook, ics: `/api/calendar?${icsParams}` };
}

function CalendarButtons({ confirmedData }: { confirmedData: Record<string, string> }) {
  const cal = buildCalendarUrls(confirmedData);
  if (!cal) return null;
  const btnBase: React.CSSProperties = { display: "inline-block", padding: "9px 16px", borderRadius: 5, fontWeight: 700, fontSize: "0.82rem", textDecoration: "none", color: "#fff", margin: "4px", letterSpacing: "0.02em" };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} style={{ marginTop: 22, padding: "18px 20px", background: "#f0f6ff", border: "1px solid #c5d8f7", borderRadius: 10, textAlign: "center" }}>
      <p style={{ margin: "0 0 12px", fontSize: "0.78rem", fontWeight: 700, color: "#4a6fa5", textTransform: "uppercase", letterSpacing: "0.1em" }}>📅 Add to your calendar</p>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
        <a href={cal.gCal} target="_blank" rel="noopener noreferrer" style={{ ...btnBase, background: "#4285f4" }}>Google Calendar</a>
        <a href={cal.outlook} target="_blank" rel="noopener noreferrer" style={{ ...btnBase, background: "#0078d4" }}>Outlook</a>
        <a href={cal.ics} style={{ ...btnBase, background: "#555" }}>Apple Calendar (.ics)</a>
      </div>
    </motion.div>
  );
}

function Sparkles() {
  const items = ["✨", "💄", "🌸", "💫", "✦", "💕", "🎉", "⭐"];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      {Array.from({ length: 16 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: "110vh", x: `${Math.random() * 100}vw`, rotate: 0, scale: 0.5 }}
          animate={{ opacity: [0, 1, 1, 0], y: "-10vh", rotate: Math.random() * 720 - 360, scale: [0.5, 1.2, 0.8] }}
          transition={{ duration: 2.5 + Math.random() * 1.5, delay: Math.random() * 0.8, ease: "easeOut" }}
          style={{ position: "absolute", fontSize: `${1 + Math.random() * 1.2}rem` }}
        >
          {items[i % items.length]}
        </motion.div>
      ))}
    </div>
  );
}

function ProgressSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Review", "Pay", "Done!"];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 0 4px", gap: 0 }}>
      {steps.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <motion.div
                animate={{ background: done ? "#2c6e3f" : active ? "linear-gradient(135deg,#c9a96e,#9e7c4a)" : "#e8c4bc", scale: active ? 1.15 : 1 }}
                transition={{ duration: 0.3 }}
                style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, color: (done || active) ? "#fff" : "#9e7c4a", background: done ? "#2c6e3f" : active ? "linear-gradient(135deg,#c9a96e,#9e7c4a)" : "#e8c4bc" }}
              >
                {done ? "✓" : n}
              </motion.div>
              <span style={{ fontSize: "0.65rem", color: active ? "#6b3d2e" : "#aaa", fontWeight: active ? 700 : 400, whiteSpace: "nowrap" }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 48, height: 2, margin: "0 4px", marginBottom: 18, background: "#e8c4bc", position: "relative", overflow: "hidden" }}>
                <motion.div
                  animate={{ width: step > n + 1 ? "100%" : step === n + 1 ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                  style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,#c9a96e,#9e7c4a)", width: "0%" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Screen = "loading" | "choose" | "card-loading" | "card-ready" | "paying" | "success-card" | "success-cash" | "error";
type Booking = ReturnType<typeof normalise>;

const fadeUp = { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } };
const slideRight = { initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -40 } };

function TestModeBanner() {
  return (
    <div style={{ background: "#ff6b00", color: "#fff", textAlign: "center", padding: "10px 16px", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.04em", position: "sticky", top: 0, zIndex: 100 }}>
      🧪 TEST MODE — No real charge. Use card <strong>4242 4242 4242 4242</strong>, any future expiry &amp; any CVC.
    </div>
  );
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
  const [isTestMode, setIsTestMode] = useState(false);
  const stripeLoaded = useRef(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("testpayment") === "1") setIsTestMode(true);
      const token = params.get("t") || params.get("b") || "";
      if (!token) { setErrorMsg("No booking data found. Please use the link from your email."); setScreen("error"); return; }
      setRawToken(token);
      let decoded: Record<string, unknown>;
      try { decoded = decodeToken(token); } catch {
        setErrorMsg("Your booking link appears to be invalid. Please contact Ankita directly."); setScreen("error"); return;
      }
      const b = normalise(decoded);
      if (!b.totalAud || b.totalAud <= 0) { setErrorMsg("This booking link does not have a valid deposit amount. Please contact Ankita."); setScreen("error"); return; }
      setBooking(b);
      setScreen("choose");
    } catch { setErrorMsg("Something went wrong loading your booking. Please contact Ankita directly."); setScreen("error"); }
  }, []);

  async function initStripe() {
    if (stripeLoaded.current) return;
    stripeLoaded.current = true;
    setScreen("card-loading");
    try {
      const cfgRes = await fetch(`${BASE}/api/config${isTestMode ? "?test=1" : ""}`);
      const cfg = await cfgRes.json();
      if (!cfg.stripePublishableKey) throw new Error(isTestMode ? "Test Stripe keys not configured. Please add STRIPE_TEST_SECRET_KEY and STRIPE_TEST_PUBLISHABLE_KEY as Replit secrets." : "Stripe not configured.");
      const stripe = await loadStripe(cfg.stripePublishableKey);
      if (!stripe) throw new Error("Failed to load Stripe.");
      const piRes = await fetch(`${BASE}/api/create-payment-intent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: rawToken, testMode: isTestMode }) });
      const piJson = await piRes.json();
      if (!piRes.ok) throw new Error(piJson.error || "Could not create payment.");
      const els = stripe.elements({
        clientSecret: piJson.client_secret,
        appearance: { theme: "stripe", variables: { colorPrimary: "#c9a96e", colorBackground: "#ffffff", colorText: "#2c1810", colorDanger: "#c0392b", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", borderRadius: "6px" } },
      });
      const payEl = els.create("payment");
      setStripeObj(stripe); setElements(els); setScreen("card-ready");
      setTimeout(() => { payEl.mount("#stripe-payment-element"); }, 50);
    } catch (e: unknown) { stripeLoaded.current = false; setErrorMsg((e as Error).message || "Could not load payment. Please try again or contact Ankita."); setScreen("error"); }
  }

  async function handlePay() {
    if (!stripeObj || !elements || !booking) return;
    setPayError(""); setPaying(true); setScreen("paying");
    const { error } = await stripeObj.confirmPayment({ elements, confirmParams: { return_url: window.location.href, receipt_email: booking.clientEmail || undefined }, redirect: "if_required" });
    if (error) { setPayError(error.message || "Payment failed. Please try again."); setPaying(false); setScreen("card-ready"); }
    else {
      try { await fetch(`${BASE}/api/confirm-payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: rawToken, testMode: isTestMode }) }); } catch {}
      setPaying(false); setScreen("success-card");
    }
  }

  async function handleCash() {
    if (!booking) return;
    if (isTestMode) { setScreen("success-cash"); return; }
    setCashLoading(true);
    try { await fetch(`${BASE}/api/select-cash`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: rawToken }) }); } catch {}
    setCashLoading(false); setScreen("success-cash");
  }

  const page: React.CSSProperties = { minHeight: "100vh", background: "#fdf8f4", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#2c1810" };

  const Header = () => (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: "1px solid #e8c4bc", background: "#fff" }}>
        <img src="/logo.png" width={36} height={36} style={{ borderRadius: "50%", objectFit: "cover" }} alt="" />
        <span style={{ fontFamily: "Georgia,serif", fontSize: "1.05rem", color: "#6b3d2e", fontStyle: "italic" }}>The Glam by Ankita</span>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes pulse-glow { 0%,100%{box-shadow:0 0 0 0 rgba(201,169,110,0.3)} 50%{box-shadow:0 0 0 10px rgba(201,169,110,0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
      `}</style>
    </motion.div>
  );

  if (screen === "error") return (
    <div style={page}>{isTestMode && <TestModeBanner />}<Header />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, minHeight: "80vh" }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200 }}
          style={{ background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 10, padding: "32px 28px", maxWidth: 480, textAlign: "center", color: "#c0392b" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⚠️</div>
          <p style={{ fontFamily: "Georgia,serif", fontSize: "1rem" }}>{errorMsg}</p>
        </motion.div>
      </div>
    </div>
  );

  if (screen === "success-card") return (
    <div style={{ ...page, overflow: "hidden" }}>{isTestMode && <TestModeBanner />}<Header />
      <Sparkles />
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 60px", position: "relative", zIndex: 1 }}>
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14 }}
          style={{ background: "#f0fff4", border: "1px solid #a8e6b8", borderRadius: 14, padding: "40px 28px", textAlign: "center" }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 0.2, duration: 0.5 }} style={{ fontSize: "3.5rem", marginBottom: 12 }}>🎉</motion.div>
          <h2 style={{ fontFamily: "Georgia,serif", color: "#2c6e3f", marginBottom: 10, fontSize: "1.5rem" }}>Deposit Paid!</h2>
          <p style={{ color: "#3a6b47", fontSize: "0.95rem", lineHeight: 1.7, margin: 0 }}>
            Your deposit has been received — your appointment is officially locked in.<br />A confirmation has been sent to your email. See you soon! ✨
          </p>
        </motion.div>
        {booking && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, marginTop: 18, overflow: "hidden" }}>
              <div style={{ padding: "13px 20px 11px", fontFamily: "Georgia,serif", fontSize: "0.95rem", color: "#6b3d2e", borderBottom: "1px solid #f0ddd6", background: "#fdf5f0" }}>📅 Your Booking</div>
              <div style={{ padding: "16px 20px" }}>
                {Object.entries(booking.confirmedData).filter(([, v]) => v).map(([k, v], i) => (
                  <motion.div key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.06 }}
                    style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f5ede9", fontSize: "0.88rem" }}>
                    <span style={{ color: "#6b3d2e", fontWeight: 600 }}>{k}</span>
                    <span style={{ color: "#2c1810", textAlign: "right", maxWidth: "55%" }}>{v}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            <CalendarButtons confirmedData={booking.confirmedData} />
          </motion.div>
        )}
      </div>
    </div>
  );

  if (screen === "success-cash") return (
    <div style={{ ...page, overflow: "hidden" }}>{isTestMode && <TestModeBanner />}<Header />
      <Sparkles />
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 60px", position: "relative", zIndex: 1 }}>
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14 }}
          style={{ background: "#fff9f0", border: "1px solid #e8d5a0", borderRadius: 14, padding: "40px 28px", textAlign: "center" }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 0.2, duration: 0.5 }} style={{ fontSize: "3.5rem", marginBottom: 12 }}>✅</motion.div>
          <h2 style={{ fontFamily: "Georgia,serif", color: "#6b3d2e", marginBottom: 10, fontSize: "1.5rem" }}>Booking Confirmed!</h2>
          <p style={{ color: "#4a2e22", fontSize: "0.95rem", lineHeight: 1.7, margin: 0 }}>
            Got it — Ankita has been notified and your appointment is confirmed.<br />A confirmation email has been sent to you. See you soon! ✨
          </p>
          {booking && <p style={{ color: "#9e7c4a", fontSize: "0.85rem", marginTop: 10 }}>Cash deposit of <strong>A${booking.totalAud.toFixed(2)}</strong> to be paid at appointment.</p>}
        </motion.div>
        {booking && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, marginTop: 18, overflow: "hidden" }}>
              <div style={{ padding: "13px 20px 11px", fontFamily: "Georgia,serif", fontSize: "0.95rem", color: "#6b3d2e", borderBottom: "1px solid #f0ddd6", background: "#fdf5f0" }}>📅 Your Booking</div>
              <div style={{ padding: "16px 20px" }}>
                {Object.entries(booking.confirmedData).filter(([, v]) => v).map(([k, v], i) => (
                  <motion.div key={k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.06 }}
                    style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f5ede9", fontSize: "0.88rem" }}>
                    <span style={{ color: "#6b3d2e", fontWeight: 600 }}>{k}</span>
                    <span style={{ color: "#2c1810", textAlign: "right", maxWidth: "55%" }}>{v}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            <CalendarButtons confirmedData={booking.confirmedData} />
          </motion.div>
        )}
      </div>
    </div>
  );

  const isCardScreen = screen === "card-loading" || screen === "card-ready" || screen === "paying";
  const progressStep: 1 | 2 | 3 = isCardScreen ? 2 : 1;

  return (
    <div style={page}>
      {isTestMode && <TestModeBanner />}
      <Header />

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        style={{ background: "linear-gradient(135deg,#c9a96e,#9e7c4a)", padding: "24px 24px 0", color: "#fff" }}>
        <h1 style={{ fontFamily: "Georgia,serif", fontSize: "1.45rem", margin: "0 0 4px" }}>Confirm & Pay Deposit</h1>
        <p style={{ fontSize: "0.85rem", opacity: 0.88, margin: 0 }}>Review your booking and complete your deposit to lock in your appointment.</p>
        <ProgressSteps step={progressStep} />
      </motion.div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px" }}>


        {screen === "loading" && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#6b3d2e" }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
              style={{ width: 40, height: 40, border: "3px solid #c9a96e", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 16px" }} />
            <p style={{ fontFamily: "Georgia,serif" }}>Loading your booking…</p>
          </div>
        )}

        {/* Booking details */}
        <AnimatePresence>
          {booking && (
            <motion.div key="booking-details" {...fadeUp} transition={{ duration: 0.4 }}>
              <motion.div style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 10, marginBottom: 18, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px 12px", fontFamily: "Georgia,serif", fontSize: "0.98rem", color: "#6b3d2e", borderBottom: "1px solid #f0ddd6", background: "#fdf5f0" }}>📅 Your Confirmed Booking</div>
                <div style={{ padding: "18px 20px" }}>
                  {Object.entries(booking.confirmedData).filter(([, v]) => v).map(([k, v], i) => (
                    <motion.div key={k} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }}
                      style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5ede9", fontSize: "0.9rem" }}>
                      <span style={{ color: "#6b3d2e", fontWeight: 600 }}>{k}</span>
                      <span style={{ color: "#2c1810", textAlign: "right", maxWidth: "55%" }}>{v}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {booking.notes && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  style={{ background: "#fff9f0", border: "1px solid #e8d5a0", borderRadius: 8, padding: "14px 18px", marginBottom: 18, fontSize: "0.88rem", color: "#4a2e22", lineHeight: 1.7 }}>
                  <strong style={{ color: "#6b3d2e" }}>💬 Note from Ankita:</strong><br />{booking.notes}
                </motion.div>
              )}

              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25, type: "spring", stiffness: 200 }}
                style={{ background: "linear-gradient(135deg,#fff9f0,#fdf5e8)", border: "2px solid #c9a96e", borderRadius: 10, padding: "20px 24px", marginBottom: 24, textAlign: "center", animation: "pulse-glow 3s ease-in-out infinite" }}>
                <div style={{ fontSize: "0.82rem", color: "#9e7c4a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Deposit Due</div>
                <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  style={{ fontFamily: "Georgia,serif", fontSize: "2rem", color: "#6b3d2e", margin: "6px 0 2px" }}>
                  A${booking.totalAud.toFixed(2)}
                </motion.div>
                <div style={{ fontSize: "0.82rem", color: "#9e7c4a" }}>Secures your appointment · Non-refundable</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Screen content */}
        <AnimatePresence mode="wait">

          {screen === "choose" && (
            <motion.div key="choose" {...fadeUp} transition={{ duration: 0.35 }} style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: "Georgia,serif", fontSize: "1rem", color: "#6b3d2e", marginBottom: 14, textAlign: "center" }}>
                How would you like to pay?
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <motion.button onClick={initStripe} whileHover={{ scale: 1.04, boxShadow: "0 6px 24px rgba(201,169,110,0.4)" }} whileTap={{ scale: 0.96 }}
                  style={{ padding: "22px 12px", background: "linear-gradient(135deg,#c9a96e,#9e7c4a)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontFamily: "Georgia,serif", fontSize: "0.95rem", fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "box-shadow 0.2s" }}>
                  <motion.span animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} style={{ fontSize: "1.8rem" }}>💳</motion.span>
                  Pay by Card
                  <span style={{ fontSize: "0.75rem", fontWeight: 400, opacity: 0.88 }}>Secure · instant</span>
                </motion.button>
                <motion.button onClick={handleCash} disabled={cashLoading} whileHover={{ scale: cashLoading ? 1 : 1.04, boxShadow: cashLoading ? "none" : "0 6px 18px rgba(158,124,74,0.25)" }} whileTap={{ scale: cashLoading ? 1 : 0.96 }}
                  style={{ padding: "22px 12px", background: "#fff", color: "#6b3d2e", border: "2px solid #c9a96e", borderRadius: 12, cursor: cashLoading ? "not-allowed" : "pointer", fontFamily: "Georgia,serif", fontSize: "0.95rem", fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: cashLoading ? 0.6 : 1, transition: "box-shadow 0.2s" }}>
                  <motion.span animate={cashLoading ? {} : { y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }} style={{ fontSize: "1.8rem" }}>💵</motion.span>
                  {cashLoading ? "Confirming…" : "Lay-by / Cash"}
                  <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "#9e7c4a" }}>Pay at appointment</span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {isCardScreen && (
            <motion.div key="card-form" {...slideRight} transition={{ duration: 0.35 }}
              style={{ background: "#fff", border: "1px solid #e8c4bc", borderRadius: 12, padding: "22px 20px", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontFamily: "Georgia,serif", fontSize: "0.98rem", color: "#6b3d2e" }}>💳 Card Details</div>
                {screen !== "paying" && (
                  <motion.button whileHover={{ x: -2 }} onClick={() => { stripeLoaded.current = false; setScreen("choose"); setElements(null); setStripeObj(null); setPayError(""); }}
                    style={{ background: "none", border: "none", color: "#9e7c4a", fontSize: "0.82rem", cursor: "pointer", textDecoration: "underline" }}>← Back</motion.button>
                )}
              </div>

              {screen === "card-loading" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: "center", padding: "32px 0", color: "#6b3d2e" }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                    style={{ width: 36, height: 36, border: "3px solid #c9a96e", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 14px" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[80, 60, 70].map((w, i) => (
                      <div key={i} style={{ height: 14, borderRadius: 6, background: "linear-gradient(90deg,#f0e8df 25%,#fdf5f0 50%,#f0e8df 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease-in-out infinite", width: `${w}%`, margin: "0 auto" }} />
                    ))}
                  </div>
                  <p style={{ fontSize: "0.88rem", fontFamily: "Georgia,serif", marginTop: 16 }}>Loading payment form…</p>
                </motion.div>
              )}

              <div id="stripe-payment-element" />

              <AnimatePresence>
                {payError && (
                  <motion.div key="pay-error" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
                    style={{ background: "#fff0f0", border: "1px solid #f5c0c0", borderRadius: 6, padding: "12px 16px", color: "#c0392b", fontSize: "0.88rem", marginTop: 12 }}>
                    ⚠️ {payError}
                  </motion.div>
                )}
              </AnimatePresence>


              <motion.button onClick={handlePay} disabled={paying || screen !== "card-ready"}
                whileHover={screen === "card-ready" && !paying ? { scale: 1.02, boxShadow: "0 6px 24px rgba(201,169,110,0.45)" } : {}}
                whileTap={screen === "card-ready" && !paying ? { scale: 0.98 } : {}}
                style={{ display: "block", width: "100%", padding: 16, marginTop: 16, background: paying || screen !== "card-ready" ? "#ccc" : "linear-gradient(135deg,#c9a96e,#9e7c4a)", color: "#fff", border: "none", borderRadius: 8, fontSize: "1rem", fontWeight: 700, fontFamily: "Georgia,serif", cursor: paying || screen !== "card-ready" ? "not-allowed" : "pointer", letterSpacing: "0.03em", transition: "background 0.2s, box-shadow 0.2s" }}>
                {paying ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                      style={{ display: "inline-block", width: 16, height: 16, border: "2.5px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%" }} />
                    Processing…
                  </span>
                ) : `Pay A$${booking?.totalAud.toFixed(2) ?? ""} Deposit ✦`}
              </motion.button>
              <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#aaa", marginTop: 10 }}>Secured by Stripe · Your card details are never stored by us.</p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
