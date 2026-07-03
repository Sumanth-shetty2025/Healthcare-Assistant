import { useState, useEffect } from "react";
import {
  FaEnvelope,
  FaLock,
  FaUser,
  FaUserMd,
  FaSun,
  FaMoon,
  FaSpinner,
  FaEye,
  FaEyeSlash,
  FaStethoscope,
  FaHeartbeat,
  FaShieldAlt,
} from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/loginPage.css";

export default function LoginPage() {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState("patient");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode') === 'true';
    setIsDark(saved);
    document.body.classList.toggle('dark', saved);

    if (location.state?.selectedRole) {
      setSelectedRole(location.state.selectedRole);
    }
    if (location.state?.successMessage) {
      setError(location.state.successMessage);
      navigate(location.pathname, { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDarkMode = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    localStorage.setItem('darkMode', newDark);
    document.body.classList.toggle('dark', newDark);
  };
  const navigate = useNavigate();
  const { login, signInWithGoogle, resetPassword } = useAuth();

  const handleRoleChange = (role) => {
    setSelectedRole(role);
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setError("");
  };

  const getErrorMessage = (err) => {
    const message = err.message || "";
    if (
      message.includes("already registered as") ||
      message.includes("already registered") ||
      message.includes("use your")
    ) {
      return message;
    }
    if (message.includes("user-not-found") || message.includes("no user record")) {
      return "Use correct credentials to login.";
    }
    if (message.includes("wrong-password") || message.includes("invalid-login-credentials")) {
      return "Use correct credentials to login.";
    }
    if (message.includes("correct credentials")) {
      return message;
    }
    if (message.includes("Role not configured")) {
      return "Use correct credentials to login.";
    }
    return message || "Login failed. Please try again.";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // eslint-disable-next-line no-console
      console.groupCollapsed('[LoginPage] submit');
      // eslint-disable-next-line no-console
      console.info('[LoginPage] login started', { selectedRole, email });
      // eslint-disable-next-line no-console
      console.log("[Login] selectedRole:", selectedRole);

      const { role, status, redirectTarget, statusMessage } = await login(email, password, selectedRole);
      // eslint-disable-next-line no-console
      console.info('[LoginPage] detected role', { role });
      // eslint-disable-next-line no-console
      console.log("[Login] fetched role:", role);
      // eslint-disable-next-line no-console
      console.log("[Login] fetched status:", status);
      // eslint-disable-next-line no-console
      console.info('[LoginPage] redirect target', { to: redirectTarget || '/home' });
      // eslint-disable-next-line no-console
      console.log("[Login] redirect target:", redirectTarget || "/home");
      navigate(redirectTarget || "/home", {
        replace: true,
        state: statusMessage ? { statusMessage } : undefined,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      // eslint-disable-next-line no-console
      try { console.groupEnd(); } catch (e) { /* ignore */ }
    }
  };

  const handleGoogleAuth = async () => {
    setError("");
    setLoading(true);

    try {
      const { redirectTarget } = await signInWithGoogle(selectedRole);
      navigate(redirectTarget || "/home", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");

    if (!email.trim()) {
      setError("Enter your email first to receive a password reset link.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim());
      setError("Password reset link sent. Please check your inbox.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`login-page login-page--signin ${isDark ? "dark" : ""}`}>
      <div className="login-layout">
        <div className="login-art-panel">
          <div className="background-overlay"></div>
          <div className="art-content">
            <div className="auth-brand">
              <FaStethoscope />
              <h1>IntelliHealth</h1>
            </div>
            <p className="tagline">Smarter diagnostics and connected care for a healthier tomorrow.</p>
            <div className="feature-highlights">
              <p><FaHeartbeat /> Live Care Monitoring</p>
              <p><FaUserMd /> Expert Doctor Recommendations</p>
              <p><FaStethoscope /> Advanced AI Analysis</p>
            </div>
          </div>
        </div>

        <section className="login-form-container">
          <div className="login-card">
            <div className="login-header">
              <p className="auth-mode-pill">Welcome Back</p>
              <h2>Sign In to Continue</h2>
              <p>Access your dashboard and continue your workflow.</p>
              <button type="button" className="dark-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode" title="Toggle dark mode">
                {isDark ? <FaSun /> : <FaMoon />}
              </button>
            </div>

            <div className="role-selector">
              <div
                className={`role-option patient ${selectedRole === "patient" ? "active" : ""}`}
                onClick={() => handleRoleChange("patient")}
              >
                <FaUser className="role-icon" />
                <span>Patient</span>
              </div>
              <div
                className={`role-option doctor ${selectedRole === "doctor" ? "active" : ""}`}
                onClick={() => handleRoleChange("doctor")}
              >
                <FaUserMd className="role-icon" />
                <span>Doctor</span>
              </div>
              <div
                className={`role-option admin ${selectedRole === "admin" ? "active" : ""}`}
                onClick={() => handleRoleChange("admin")}
              >
                <FaShieldAlt className="role-icon" />
                <span>Admin</span>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <div className="floating-field">
                  <FaEnvelope className="field-icon" />
                  <input
                    id="email"
                    type="email"
                    className="floating-input"
                    placeholder=" "
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    aria-describedby={error ? "error-desc" : undefined}
                    aria-invalid={!!error}
                  />
                  <label htmlFor="email" className="floating-label">Email Address</label>
                </div>
              </div>

              <div className="form-group">
                <div className="floating-field password-field-wrap">
                  <FaLock className="field-icon" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="floating-input"
                    placeholder=" "
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-describedby={error ? "error-desc" : undefined}
                    aria-invalid={!!error}
                  />
                  <label htmlFor="password" className="floating-label">Password</label>
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                <button type="button" className="forgot-link" onClick={handleForgotPassword}>
                  Forgot Password?
                </button>
              </div>

              {error && <div className="error-message" id="error-desc">{error}</div>}

              <button type="submit" className="submit-btn" disabled={loading} aria-busy={loading}>
                {loading ? (
                  <>
                    <FaSpinner className="spinner" />
                    Processing...
                  </>
                ) : "🔐 Login Securely"}
              </button>

              <div className="auth-divider" role="separator" aria-label="Alternative sign in method">
                <span>or</span>
              </div>

              <button
                type="button"
                className="google-btn"
                onClick={handleGoogleAuth}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <FaSpinner className="spinner" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FcGoogle className="google-logo" />
                    Continue with Google
                  </>
                )}
              </button>
            </form>

            <div className="toggle-auth">
              <p>
                Don't have an account?
                <Link
                  to={selectedRole === "doctor" ? "/doctor-signup" : "/signup"}
                  state={{ selectedRole }}
                  className="toggle-btn"
                >
                  Sign up here
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
