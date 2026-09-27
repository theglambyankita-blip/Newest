import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState<"loading" | "unauthorized" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin-token", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setErrorMessage(data.error || "Could not open the admin dashboard.");
          setStatus(r.status === 401 || r.status === 403 ? "unauthorized" : "error");
          return null;
        }
        return data;
      })
      .then((data) => {
        if (data?.token) {
          window.location.replace(`/api/admin?token=${encodeURIComponent(data.token)}`);
        } else if (data) {
          setStatus("error");
        }
      })
      .catch(() => {
        setErrorMessage("Could not connect to the API server.");
        setStatus("error");
      });
  }, []);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>✦ Glam by Ankita</div>
        {status === "loading" ? (
          <>
            <div style={styles.spinner} />
            <p style={styles.label}>Opening Admin Dashboard…</p>
          </>
        ) : (
          <>
            <p style={{ ...styles.label, color: "#c0392b" }}>{errorMessage || "Could not load the admin dashboard."}</p>
            {status === "unauthorized" && (
              <>
                <p style={styles.label}>Sign in with the owner's verified email on the main website, then return here. Alternatively, open your private admin dashboard link from your email.</p>
                <a href="/sign-in" style={styles.retryBtn} data-testid="link-owner-sign-in">Sign in on the website</a>
              </>
            )}
            <button style={styles.retryBtn} data-testid="button-retry-dashboard" onClick={() => { setStatus("loading"); window.location.reload(); }}>
              Try again
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #fdf0ee 0%, #f7e9d0 100%)",
    fontFamily: "'Nunito', Georgia, sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: "14px",
    boxShadow: "0 20px 60px rgba(201,169,110,0.2)",
    padding: "3rem 2.5rem",
    textAlign: "center" as const,
    maxWidth: "360px",
    width: "90%",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "1.1rem",
  },
  logo: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#9e7c4a",
    letterSpacing: "0.02em",
  },
  spinner: {
    width: "38px",
    height: "38px",
    border: "3px solid rgba(201,169,110,0.2)",
    borderTop: "3px solid #c9a96e",
    borderRadius: "50%",
    animation: "spin 0.85s linear infinite",
  },
  label: {
    color: "#9a7060",
    fontSize: "0.9rem",
    margin: 0,
  },
  retryBtn: {
    background: "linear-gradient(135deg, #c9a96e, #9e7c4a)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 24px",
    fontSize: "0.9rem",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
