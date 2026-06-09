import { useAuth, useUser, useClerk } from "@clerk/react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

interface Booking {
  id: number;
  clientName: string | null;
  service: string | null;
  bookingDate: string | null;
  bookingTime: string | null;
  location: string | null;
  numPeople: string | null;
  totalAud: string | null;
  paymentMethod: string | null;
  status: string | null;
  createdAt: string | null;
}

function statusBadgeStyle(status: string | null): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "20px",
    fontSize: "0.75rem",
    fontWeight: 700,
    background: status === "confirmed" ? "#d1fae5" : "#fef3c7",
    color: status === "confirmed" ? "#065f46" : "#92400e",
    border: `1px solid ${status === "confirmed" ? "#6ee7b7" : "#fcd34d"}`,
  };
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: "linear-gradient(135deg, #fdf8f4 0%, #f7e9d0 100%)",
    fontFamily: "Nunito, sans-serif",
    color: "#2c1810",
  },
  nav: {
    background: "rgba(253,248,244,0.95)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(232,196,188,0.5)",
    padding: "0.85rem 2rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
  },
  navLogo: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    textDecoration: "none",
    fontFamily: "Georgia, serif",
    fontStyle: "italic",
    fontSize: "1.1rem",
    color: "#6b3d2e",
  },
  navRight: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  backLink: {
    fontSize: "0.82rem",
    color: "#9e7c4a",
    textDecoration: "none",
    fontWeight: 600,
  },
  signOutBtn: {
    background: "none",
    border: "1.5px solid #e8c4bc",
    borderRadius: "6px",
    padding: "0.4rem 1rem",
    fontSize: "0.82rem",
    color: "#6b3d2e",
    cursor: "pointer",
    fontFamily: "Nunito, sans-serif",
    fontWeight: 600,
    transition: "background 0.2s",
  },
  hero: {
    background: "linear-gradient(135deg, #c9a96e, #9e7c4a)",
    padding: "2.5rem 2rem 2rem",
    textAlign: "center" as const,
  },
  heroName: {
    margin: "0 0 4px",
    color: "#fff",
    fontFamily: "Georgia, serif",
    fontSize: "1.5rem",
  },
  heroSub: {
    margin: 0,
    color: "rgba(255,255,255,0.85)",
    fontSize: "0.88rem",
  },
  body: {
    maxWidth: "700px",
    margin: "0 auto",
    padding: "2rem 1rem 4rem",
  },
  sectionTitle: {
    fontFamily: "Georgia, serif",
    fontSize: "1.15rem",
    color: "#6b3d2e",
    margin: "0 0 1.2rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  card: {
    background: "#fff",
    border: "1px solid #e8c4bc",
    borderRadius: "10px",
    marginBottom: "1rem",
    overflow: "hidden",
  },
  cardHead: {
    background: "linear-gradient(135deg, #fdf0ee, #fdf5e8)",
    padding: "0.9rem 1.2rem",
    borderBottom: "1px solid #e8c4bc",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
  },
  service: {
    fontFamily: "Georgia, serif",
    fontWeight: 700,
    fontSize: "1rem",
    color: "#2c1810",
    margin: 0,
  },
  cardBody: {
    padding: "0.85rem 1.2rem",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.5rem 1.5rem",
    fontSize: "0.88rem",
  },
  detail: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
  },
  detailLabel: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#9e7c4a",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  detailValue: {
    color: "#2c1810",
    fontWeight: 600,
  },
  payMethod: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
  },
  empty: {
    textAlign: "center" as const,
    padding: "3rem 2rem",
    background: "#fff",
    border: "1px solid #e8c4bc",
    borderRadius: "10px",
  },
  emptyIcon: {
    fontSize: "3rem",
    marginBottom: "0.75rem",
  },
  emptyTitle: {
    fontFamily: "Georgia, serif",
    color: "#6b3d2e",
    margin: "0 0 8px",
    fontSize: "1.15rem",
  },
  emptyText: {
    color: "#9e7c4a",
    fontSize: "0.9rem",
    lineHeight: 1.6,
    margin: "0 0 1.5rem",
  },
  bookBtn: {
    display: "inline-block",
    background: "linear-gradient(135deg, #c9a96e, #9e7c4a)",
    color: "#fff",
    textDecoration: "none",
    padding: "0.75rem 2rem",
    borderRadius: "6px",
    fontFamily: "Georgia, serif",
    fontWeight: 700,
    fontSize: "0.95rem",
  },
  spinner: {
    textAlign: "center" as const,
    padding: "3rem",
    color: "#9e7c4a",
    fontSize: "0.9rem",
  },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-AU", {
      weekday: "short", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return d; }
}

function BookingCard({ b }: { b: Booking }) {
  const payIcon = b.paymentMethod === "card" ? "💳" : "💵";
  const payLabel = b.paymentMethod === "card" ? "Card" : "Cash";

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <p style={s.service}>{b.service || "Appointment"}</p>
        <span style={statusBadgeStyle(b.status)}>
          {b.status === "confirmed" ? "✓ Confirmed" : b.status || "Pending"}
        </span>
      </div>
      <div style={s.cardBody}>
        {b.bookingDate && (
          <div style={s.detail}>
            <span style={s.detailLabel}>Date</span>
            <span style={s.detailValue}>{formatDate(b.bookingDate)}</span>
          </div>
        )}
        {b.bookingTime && (
          <div style={s.detail}>
            <span style={s.detailLabel}>Time</span>
            <span style={s.detailValue}>{b.bookingTime}</span>
          </div>
        )}
        {b.location && (
          <div style={s.detail}>
            <span style={s.detailLabel}>Location</span>
            <span style={s.detailValue}>{b.location}</span>
          </div>
        )}
        {b.numPeople && (
          <div style={s.detail}>
            <span style={s.detailLabel}>People</span>
            <span style={s.detailValue}>{b.numPeople}</span>
          </div>
        )}
        {b.totalAud && (
          <div style={s.detail}>
            <span style={s.detailLabel}>Deposit</span>
            <span style={s.detailValue}>A${Number(b.totalAud).toFixed(2)}</span>
          </div>
        )}
        {b.paymentMethod && (
          <div style={s.detail}>
            <span style={s.detailLabel}>Payment</span>
            <span style={{ ...s.detailValue, ...s.payMethod }}>
              {payIcon} {payLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountPortal() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/my-bookings", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then((data) => {
        setMyBookings(data.bookings || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load your bookings. Please try again.");
        setLoading(false);
      });
  }, []);

  const firstName = user?.firstName || user?.fullName?.split(" ")[0] || "there";

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <a href="/" style={s.navLogo}>
          <img src="/logo-original.png" alt="" width={36} height={36} style={{ borderRadius: "50%", objectFit: "cover" }} />
          The Glam by Ankita
        </a>
        <div style={s.navRight}>
          <a href="/" style={s.backLink}>← Main Site</a>
          <button
            style={s.signOutBtn}
            onClick={() => signOut({ redirectUrl: "/" })}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fdf0ee"; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div style={s.hero}>
        <h1 style={s.heroName}>Hi, {firstName}! ✨</h1>
        <p style={s.heroSub}>{user?.primaryEmailAddress?.emailAddress}</p>
      </div>

      <div style={s.body}>
        <h2 style={s.sectionTitle}>📅 My Bookings</h2>

        {loading && <div style={s.spinner}>Loading your bookings…</div>}

        {error && (
          <div style={{ ...s.empty, borderColor: "#f5c0c0", background: "#fff5f5" }}>
            <p style={{ color: "#c0392b", fontSize: "0.9rem" }}>{error}</p>
          </div>
        )}

        {!loading && !error && myBookings.length === 0 && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>💄</div>
            <h3 style={s.emptyTitle}>No bookings yet</h3>
            <p style={s.emptyText}>
              Ready to book your next glam session?<br />
              Use your email address <strong>{user?.primaryEmailAddress?.emailAddress}</strong> when booking so it shows up here.
            </p>
            <a href="/#contact" style={s.bookBtn}>✦ Book Now</a>
          </div>
        )}

        {!loading && !error && myBookings.map((b) => (
          <BookingCard key={b.id} b={b} />
        ))}
      </div>
    </div>
  );
}

function SignInPrompt() {
  const [, setLocation] = useLocation();
  return (
    <div style={{ ...s.page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: "2rem" }}>
      <img src="/logo-original.png" alt="The Glam by Ankita" width={64} height={64} style={{ borderRadius: "50%", marginBottom: "1rem", objectFit: "cover" }} />
      <h2 style={{ fontFamily: "Georgia, serif", color: "#6b3d2e", margin: "0 0 8px", fontSize: "1.4rem" }}>My Account</h2>
      <p style={{ color: "#9e7c4a", fontSize: "0.9rem", margin: "0 0 2rem", textAlign: "center", maxWidth: "320px", lineHeight: 1.6 }}>
        Sign in to view your bookings and appointment history.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => setLocation("/sign-in")}
          style={{ background: "linear-gradient(135deg,#c9a96e,#9e7c4a)", color: "#fff", border: "none", padding: "0.75rem 1.75rem", borderRadius: "6px", fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}
        >
          Sign In
        </button>
        <button
          onClick={() => setLocation("/sign-up")}
          style={{ background: "#fff", color: "#6b3d2e", border: "1.5px solid #e8c4bc", padding: "0.75rem 1.75rem", borderRadius: "6px", fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}
        >
          Create Account
        </button>
      </div>
      <a href="/" style={{ marginTop: "2rem", fontSize: "0.82rem", color: "#9e7c4a", textDecoration: "none", fontWeight: 600 }}>← Back to The Glam by Ankita</a>
    </div>
  );
}

export default function AccountPage() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fdf8f4" }}>
        <p style={{ color: "#9e7c4a", fontFamily: "Nunito, sans-serif" }}>Loading…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return <SignInPrompt />;
  }

  return <AccountPortal />;
}
