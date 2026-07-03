import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, requiredRole = null }) {
  const { currentUser, userRole, userStatus, authLoading } = useAuth();

  // eslint-disable-next-line no-console
  console.log("[ProtectedRoute] authLoading:", authLoading);
  // eslint-disable-next-line no-console
  console.log("[ProtectedRoute] currentUser:", currentUser);

  if (authLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowed.includes(userRole)) {
      return <Navigate to="/unauthorized" replace />;
    }

    // Extra gating: approved doctors only
    if (allowed.includes('doctor')) {
      const status = String(userStatus || '').toLowerCase();
      if (status && status !== 'approved') {
        return <Navigate to="/unauthorized" replace />;
      }
    }
  }

  return children;
}
