import { useState, useEffect } from "react";
import { FaEnvelope, FaLock, FaPhone, FaUser, FaUserMd, FaSun, FaMoon, FaSpinner, FaEye, FaEyeSlash, FaStethoscope, FaHeartbeat } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/loginPage.css";
import "../styles/patientSignupFix.css";


export default function SignupPage() {
  const location = useLocation();
  const selectedRoleFromState = location.state?.selectedRole;
  const initialRole = selectedRoleFromState === "doctor" ? "doctor" : "patient";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("Male");
  const [bloodGroup, setBloodGroup] = useState("A+");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const navigate = useNavigate();
  const { signup, signInWithGoogle, logout } = useAuth();

  useEffect(() => {
    const saved = localStorage.getItem("darkMode") === "true";
    setIsDark(saved);
    document.body.classList.toggle("dark", saved);

    if (selectedRoleFromState === "doctor") {
      navigate("/doctor-signup", { replace: true, state: { selectedRole: "doctor" } });
    }
  }, [navigate, selectedRoleFromState]);

  const toggleDarkMode = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    localStorage.setItem("darkMode", newDark);
    document.body.classList.toggle("dark", newDark);
  };

  const handleRoleChange = (role) => {
    if (role === "doctor") {
      navigate("/doctor-signup", { replace: true, state: { selectedRole: "doctor" } });
      return;
    }

    setSelectedRole(role);
    setFullName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setPhoneNumber("");
    setAge("");
    setGender("Male");
    setBloodGroup("A+");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Full name is required");
      return;
    }

    if (!phoneNumber.trim()) {
      setError("Phone number is required");
      return;
    }

    if (!age.trim()) {
      setError("Age is required");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      // eslint-disable-next-line no-console
      console.groupCollapsed('[SignupPage] submit');
      // eslint-disable-next-line no-console
      console.info('[SignupPage] signup started', { selectedRole, email });

      await signup(email, password, selectedRole, {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        age: age.trim(),
        gender,
        bloodGroup,
      });

      // eslint-disable-next-line no-console
      console.info('[SignupPage] signup success - logging out and redirecting to login', { selectedRole, email });

      await logout();
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setPhoneNumber("");
      setAge("");
      setGender("Male");
      setBloodGroup("A+");
      navigate("/login", {
        replace: true,
        state: { selectedRole },
      });
    } catch (err) {
      setError(err.message || "Sign-up failed. Please try again.");
    } finally {
      setLoading(false);
      // eslint-disable-next-line no-console
      try { console.groupEnd(); } catch (e) { /* ignore */ }
    }
  };

  const handleGoogleSignup = async () => {
    setError("");
    setLoading(true);

    try {
      await signInWithGoogle(selectedRole);
      await logout();
      navigate("/login", {
        replace: true,
        state: { selectedRole },
      });
    } catch (err) {
      setError(err.message || "Google sign-up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page login-page--signup">
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />
      <div className="background-orb orb-three" />

      <div className="auth-shell">
        <header className="auth-top-banner" aria-label="IntelliHealth overview">
          <div className="auth-brand auth-brand--outside">
            <span className="auth-brand-icon"><FaStethoscope /></span>
            <div>
              <h1>IntelliHealth</h1>
              <p>Smarter diagnostics and connected care</p>
            </div>
          </div>
          <div className="healthcare-pulse" aria-hidden="true">
            <FaHeartbeat className="healthcare-pulse-icon" />
            <span className="healthcare-pulse-line" />
            <span className="healthcare-pulse-text">Live Care Monitoring</span>
          </div>
        </header>

        <div className="login-layout login-layout--single">
          <section className="login-form-container">
            <div className="login-card">
              <div className="login-header">
              <p className="auth-mode-pill">Create Account</p>
              <h2 className="signup-heading">Sign Up to Continue</h2>
              <p>Create your {selectedRole} account with username, email, and password.</p>
              <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                <button type="button" className="back-btn" onClick={() => navigate('/login', { state: { selectedRole } })} aria-label="Back to login">
                  ← Back
                </button>
                <button type="button" className="dark-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode" title="Toggle dark mode">
                  {isDark ? <FaSun /> : <FaMoon />}
                </button>
              </div>
            </div>

            <div className="role-selector">
              <label className={`role-option ${selectedRole === "patient" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="signup-role"
                  value="patient"
                  checked={selectedRole === "patient"}
                  onChange={(e) => handleRoleChange(e.target.value)}
                />
                <span><FaUser className="role-icon" /> Patient</span>
              </label>
              <label className={`role-option ${selectedRole === "doctor" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="signup-role"
                  value="doctor"
                  checked={selectedRole === "doctor"}
                  onChange={(e) => handleRoleChange(e.target.value)}
                />
                <span><FaUserMd className="role-icon" /> Doctor</span>
              </label>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <div className="floating-field">
                  <FaUser className="field-icon" />
                  <input
                    id="fullName"
                    type="text"
                    className="floating-input"
                    placeholder=" "
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    aria-describedby={error ? "error-desc" : undefined}
                    aria-invalid={!!error}
                  />
                  <label htmlFor="fullName" className="floating-label">Full Name</label>
                </div>
              </div>

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

              <div className="signup-grid two-col">
                <div className="form-group">
                  <div className="floating-field">
                    <FaPhone className="field-icon" />
                    <input
                      id="phoneNumber"
                      type="tel"
                      className="floating-input"
                      placeholder=" "
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      required
                      aria-describedby={error ? "error-desc" : undefined}
                      aria-invalid={!!error}
                    />
                    <label htmlFor="phoneNumber" className="floating-label">Phone Number</label>
                  </div>
                </div>

                <div className="form-group">
                  <div className="floating-field">
                    <FaUser className="field-icon" />
                    <input
                      id="age"
                      type="number"
                      min="1"
                      max="120"
                      className="floating-input"
                      placeholder=" "
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      required
                      aria-describedby={error ? "error-desc" : undefined}
                      aria-invalid={!!error}
                    />
                    <label htmlFor="age" className="floating-label">Age</label>
                  </div>
                </div>
              </div>

              <div className="signup-grid two-col">
                <div className="form-group">
                  <div className="select-field-wrap">
                    <label htmlFor="gender" className="select-label">Gender</label>
                    <select
                      id="gender"
                      className="signup-select"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      required
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <div className="select-field-wrap">
                    <label htmlFor="bloodGroup" className="select-label">Blood Group</label>
                    <select
                      id="bloodGroup"
                      className="signup-select"
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value)}
                      required
                    >
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <div className="password-field-wrap">
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
              </div>

              <div className="form-group">
                <div className="password-field-wrap">
                  <FaLock className="field-icon" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    className="floating-input"
                    placeholder=" "
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    aria-describedby={error ? "error-desc" : undefined}
                    aria-invalid={!!error}
                  />
                  <label htmlFor="confirmPassword" className="floating-label">Confirm Password</label>
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="error-message" id="error-desc">
                  {error}
                </div>
              )}

              <button type="submit" className="submit-btn" disabled={loading} aria-busy={loading}>
                {loading ? (
                  <>
                    <FaSpinner className="spinner" />
                    Processing...
                  </>
                ) : (
                  "Create Account"
                )}
              </button>

              <div className="auth-divider" role="separator" aria-label="Alternative sign up method">
                <span>or</span>
              </div>

              <button
                type="button"
                className="google-btn"
                onClick={handleGoogleSignup}
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
                    Sign up with Google
                  </>
                )}
              </button>
            </form>

            <div className="toggle-auth">
              <p>
                Already have an account?
                <Link to="/login" state={{ selectedRole }} className="toggle-btn">Login here</Link>
              </p>
            </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
