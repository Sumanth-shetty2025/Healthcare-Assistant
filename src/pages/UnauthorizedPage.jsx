import { Link } from "react-router-dom";

export default function UnauthorizedPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <h2 style={{ margin: 0 }}>Unauthorized</h2>
        <p style={{ color: "#64748b", fontWeight: 700, marginTop: 8 }}>
          You don’t have permission to access this page.
        </p>
        <Link to="/login" style={{ fontWeight: 900, color: "#007bff", textDecoration: "none" }}>
          Return to Login
        </Link>
      </div>
    </div>
  );
}
