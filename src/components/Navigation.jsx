import { NavLink, useNavigate } from "react-router-dom";
import { loadStoredPrediction } from "../utils/predictionUtils";
import { useAuth } from "../contexts/AuthContext";
import "../styles/Navigation.css";

const links = [
  { path: "/home", label: "Home" },
  { path: "/upload", label: "Upload Image" },
  { path: "/result", label: "Results" },
  { path: "/scanning-report", label: "Report" },
  { path: "/doctor-details", label: "Doctors" },
  { path: "/my-appointments", label: "My Appointments" },
];

export default function Navigation() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const welcomeName = user?.displayName || user?.email?.split("@")[0] || "Guest";

  const handleNavigationGuard = (event, path) => {
    const hasPrediction = Boolean(loadStoredPrediction());

    if (path === "/scanning-report" && !hasPrediction) {
      event.preventDefault();
      window.alert("Please upload the medical image and click the scanning report button.");
      return;
    }

    if (path === "/doctor-details") {
      return;
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <nav className="navbar-custom">
      <div className="navbar-container">
        <NavLink className="navbar-brand-custom" to="/home">
          <div className="logo-icon-wrapper">
            <span className="logo-mark-custom">IH</span>
          </div>
          <span className="brand-name">IntelliHealth</span>
        </NavLink>
        {user && (
          <div className="welcome-pill">
            Welcome, {welcomeName}
          </div>
        )}
        <div className="navbar-links">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              onClick={(event) => handleNavigationGuard(event, link.path)}
              className={({ isActive }) =>
                "nav-link-custom" + (isActive ? " active-link" : "")
              }
              end={link.path === "/"}
            >
              {link.label}
            </NavLink>
          ))}
          {user && (
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
