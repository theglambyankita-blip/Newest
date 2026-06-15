import { useEffect } from "react";

const ADMIN_URL = "/api/admin?token=c6dcc60c-72bd-4969-b8a8-9fa5098f6bcc";

export default function App() {
  useEffect(() => {
    window.location.replace(ADMIN_URL);
  }, []);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.logo}>✦ Glam by Ankita</div>
        <div style={styles.spinner} />
        <p style={styles.label}>Opening Admin Dashboard…</p>
        <a href={ADMIN_URL} style={styles.link}>
          Click here if not redirected →
        </a>
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
  link: {
    color: "#c9a96e",
    fontSize: "0.82rem",
    textDecoration: "none",
    fontWeight: 600,
  },
};
