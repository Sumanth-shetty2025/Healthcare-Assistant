import { useEffect, useMemo, useState } from "react";
import {
  FaEnvelope,
  FaLock,
  FaPhone,
  FaUser,
  FaSun,
  FaMoon,
  FaSpinner,
  FaStethoscope,
  FaHeartbeat,
  FaGraduationCap,
  FaEye,
  FaEyeSlash,
  FaFileUpload,
  FaIdCard,
  FaCheckCircle,
  FaShieldAlt,
} from "react-icons/fa";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "../styles/doctorSignup.css";

const specializationOptions = [
  "Pulmonologist",
  "Chest Physician",
  "Respiratory Medicine",
  "Infectious Disease Specialist",
  "Internal Medicine",
  "General Physician",
];

export default function DoctorSignupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { submitDoctorVerificationRequest, reapplyDoctorVerificationRequest, currentUser, logout } = useAuth();

  const isReapply = Boolean(location.state?.reapply);
  const reapplyRecord = location.state?.record || null;

  const [existingProfilePhotoUrl, setExistingProfilePhotoUrl] = useState(null);
  const [existingLicenseDocumentUrl, setExistingLicenseDocumentUrl] = useState(null);
  const [existingIdDocumentUrl, setExistingIdDocumentUrl] = useState(null);

  const [isDark, setIsDark] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const [profilePhoto, setProfilePhoto] = useState(null);
  const [licenseDocument, setLicenseDocument] = useState(null);
  const [idDocument, setIdDocument] = useState(null);

  const validateFile = (file, kind) => {
    if (!file) return null;
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) {
      return "Invalid file format. Allowed: PDF, JPG, PNG, WEBP.";
    }
    const max = kind === "photo" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > max) {
      return `File too large. Max allowed is ${Math.round(max / (1024 * 1024))}MB.`;
    }
    return null;
  };

  const [availabilityDays, setAvailabilityDays] = useState({
    Mon: true,
    Tue: true,
    Wed: true,
    Thu: true,
    Fri: true,
    Sat: false,
    Sun: false,
  });
  const [availabilityStart, setAvailabilityStart] = useState("10:00");
  const [availabilityEnd, setAvailabilityEnd] = useState("16:00");

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    licenseNumber: "",
    specialization: "Pulmonologist",
    hospitalName: "",
    location: "",
    yearsOfExperience: "",
    phoneNumber: "",
    availability: "",
    bio: "",
  });

  useEffect(() => {
    const saved = localStorage.getItem("darkMode") === "true";
    setIsDark(saved);
    document.body.classList.toggle("dark", saved);
    if (isReapply && reapplyRecord) {
      setFormData((prev) => ({
        ...prev,
        fullName: reapplyRecord.fullName || prev.fullName,
        email: reapplyRecord.email || prev.email,
        licenseNumber: reapplyRecord.licenseNumber || prev.licenseNumber,
        specialization: reapplyRecord.specialization || prev.specialization,
        hospitalName: reapplyRecord.hospitalName || prev.hospitalName,
        location: reapplyRecord.location || prev.location,
        yearsOfExperience: reapplyRecord.yearsOfExperience || prev.yearsOfExperience,
        phoneNumber: reapplyRecord.phoneNumber || prev.phoneNumber,
        availability: reapplyRecord.availability || prev.availability,
        bio: reapplyRecord.bio || prev.bio,
      }));

      setExistingProfilePhotoUrl(reapplyRecord.profilePhoto || reapplyRecord.profilePhotoUrl || reapplyRecord.documents?.profilePhotoUrl || null);
      setExistingLicenseDocumentUrl(reapplyRecord.licenseDocument || reapplyRecord.licenseDocumentUrl || reapplyRecord.documents?.licenseDocumentUrl || null);
      setExistingIdDocumentUrl(reapplyRecord.doctorCertificate || reapplyRecord.idDocument || reapplyRecord.documents?.idDocumentUrl || null);
    }
  }, []);

  const getNameFromUrl = (url) => {
    if (!url) return null;
    try {
      const parts = String(url).split('/');
      return parts[parts.length - 1] || url;
    } catch (e) {
      return url;
    }
  };

  const toggleDarkMode = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    localStorage.setItem("darkMode", newDark);
    document.body.classList.toggle("dark", newDark);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const passwordStrength = useMemo(() => {
    const pwd = String(formData.password || "");
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    if (pwd.length >= 12) score += 1;

    const label = score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";
    return { score, label };
  }, [formData.password]);

  const syncAvailabilityText = (nextDays = availabilityDays, nextStart = availabilityStart, nextEnd = availabilityEnd) => {
    const selected = Object.entries(nextDays)
      .filter(([, enabled]) => enabled)
      .map(([day]) => day);
    const daysText = selected.length ? selected.join(", ") : "Not set";
    const timeText = nextStart && nextEnd ? `${nextStart} - ${nextEnd}` : "";
    setFormData((prev) => ({
      ...prev,
      availability: timeText ? `${daysText}, ${timeText}` : daysText,
    }));
  };

  useEffect(() => {
    // Keep existing availability field working, but make it easier to fill.
    syncAvailabilityText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGoNextFromStep1 = () => {
    if (!formData.fullName.trim() || !formData.email.trim()) return false;
    if (isReapply) return true;
    if (!formData.password || !formData.confirmPassword) return false;
    if (formData.password !== formData.confirmPassword) return false;
    if (formData.password.length < 6) return false;
    return true;
  };

  const canGoNextFromStep2 = () => {
    if (!formData.licenseNumber.trim() || !formData.hospitalName.trim() || !formData.location.trim()) return false;
    if (!String(formData.yearsOfExperience).trim()) return false;
    if (!String(formData.phoneNumber).trim()) return false;
    if (!String(formData.availability).trim()) return false;
    return true;
  };

  const handleNext = () => {
    setError("");
    if (step === 1 && !canGoNextFromStep1()) {
      setError("Please complete all required account details correctly.");
      return;
    }
    if (step === 2 && !canGoNextFromStep2()) {
      setError("Please complete all required professional details.");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const handleBackStep = () => {
    setError("");
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setUploadProgress(null);

    if (!isReapply) {
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      if (formData.password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    if (!formData.fullName.trim() || !formData.licenseNumber.trim() || !formData.hospitalName.trim()) {
      setError("Please complete all required doctor details.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the terms and medical compliance policy.");
      return;
    }

    if (!licenseDocument && !existingLicenseDocumentUrl) {
      setError("Please upload your medical license document.");
      return;
    }

    if (!idDocument && !existingIdDocumentUrl) {
      setError("Please upload your doctor ID / certificate document.");
      return;
    }

    setLoading(true);
    try {
      // eslint-disable-next-line no-console
      console.info("[DoctorSignup] Form submit", {
        step,
        email: formData.email?.trim(),
        fullName: formData.fullName?.trim(),
        licenseNumber: formData.licenseNumber?.trim(),
        profilePhoto: profilePhoto ? { name: profilePhoto.name, type: profilePhoto.type, size: profilePhoto.size } : null,
        licenseDocument: licenseDocument ? { name: licenseDocument.name, type: licenseDocument.type, size: licenseDocument.size } : null,
        idDocument: idDocument ? { name: idDocument.name, type: idDocument.type, size: idDocument.size } : null,
      });

      if (isReapply) {
        // Reapply path: update pending_doctor_requests and remove rejected_doctors
        const payload = {
          fullName: formData.fullName.trim(),
          email: formData.email.trim(),
          licenseNumber: formData.licenseNumber.trim(),
          specialization: formData.specialization,
          hospitalName: formData.hospitalName.trim(),
          location: formData.location.trim(),
          yearsOfExperience: String(formData.yearsOfExperience).trim(),
          phoneNumber: formData.phoneNumber.trim(),
          availability: formData.availability.trim(),
          bio: formData.bio.trim(),
          documents: {
            profilePhotoUrl: existingProfilePhotoUrl,
            licenseDocumentUrl: existingLicenseDocumentUrl,
            idDocumentUrl: existingIdDocumentUrl,
          },
        };

        await reapplyDoctorVerificationRequest(currentUser.uid, payload, {
          profilePhoto: profilePhoto || null,
          licenseDocument: licenseDocument || null,
          idDocument: idDocument || null,
        }, {
          onProgress: (p) => setUploadProgress(p),
        });

        // After successful reapplication, redirect back to status page
        navigate('/doctor-verification-status', { replace: true });
      } else {
        await submitDoctorVerificationRequest(
        {
          fullName: formData.fullName.trim(),
          email: formData.email.trim(),
          password: formData.password,
          licenseNumber: formData.licenseNumber.trim(),
          specialization: formData.specialization,
          hospitalName: formData.hospitalName.trim(),
          location: formData.location.trim(),
          yearsOfExperience: String(formData.yearsOfExperience).trim(),
          phoneNumber: formData.phoneNumber.trim(),
          availability: formData.availability.trim(),
          bio: formData.bio.trim(),
        },
        {
          profilePhoto,
          licenseDocument,
          idDocument,
        },
        {
          onProgress: (p) => {
            setUploadProgress(p);
          },
        }
      );
      }

      // Ensure session is signed out after creating the auth user to avoid accidental redirects
      try {
        if (typeof logout === 'function') {
          await logout();
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[DoctorSignup] logout after signup failed', e?.message || e);
      }

      // eslint-disable-next-line no-console
      console.info("[DoctorSignup] submitDoctorVerificationRequest resolved OK");

      setSuccessOpen(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[DoctorSignup] submitDoctorVerificationRequest failed", {
        code: err?.code,
        message: err?.message,
        name: err?.name,
      });
      setError(err.message || "Doctor verification request submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="doctor-signup-page">
      <div className="doctor-signup-bg orb-a" />
      <div className="doctor-signup-bg orb-b" />

      <div className="doctor-signup-shell">
        <header className="doctor-signup-top-banner" aria-label="IntelliHealth doctor portal">
          <div className="doctor-brand-section">
            <span className="doctor-brand-icon"><FaStethoscope /></span>
            <div>
              <h3>IntelliHealth</h3>
              <p>Doctor Portal</p>
            </div>
          </div>
          <div className="doctor-healthcare-pulse" aria-hidden="true">
            <FaHeartbeat className="doctor-pulse-icon" />
            <span className="doctor-pulse-line" />
            <span className="doctor-pulse-text">Specialist Network</span>
          </div>
        </header>

        <section className="doctor-signup-hero">
          <p className="doctor-signup-badge"><FaGraduationCap /> Doctor Registration</p>
          <h1>Create Your Professional Profile</h1>
          <p>
            Register as a verified specialist to receive AI-based patient recommendations and appointment requests.
          </p>
          <ul>
            <li>Connect with patients based on predicted conditions.</li>
            <li>Receive appointment requests directly in your dashboard.</li>
            <li>Keep your practice profile updated and accessible.</li>
          </ul>
        </section>

        <section className="doctor-signup-card">
          <div className="doctor-signup-header">
            <div>
              <span className="doctor-signup-kicker"><FaStethoscope /> Sign Up</span>
              <h2>Doctor Account</h2>
              <p>Fill in your professional and contact details.</p>
            </div>
            <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
              <button type="button" className="back-btn" onClick={() => navigate('/login', { state: { selectedRole: 'doctor' } })} aria-label="Back to login">
                ← Back
              </button>
              <button className="dark-toggle" onClick={toggleDarkMode} aria-label="Toggle dark mode" title="Toggle dark mode">
                {isDark ? <FaSun /> : <FaMoon />}
              </button>
            </div>
          </div>

          <div className="doctor-stepper" aria-label="Doctor onboarding progress">
            <div className={`doctor-step ${step === 1 ? "active" : step > 1 ? "done" : ""}`}>1<span>Account</span></div>
            <div className={`doctor-step ${step === 2 ? "active" : step > 2 ? "done" : ""}`}>2<span>Professional</span></div>
            <div className={`doctor-step ${step === 3 ? "active" : ""}`}>3<span>Verification</span></div>
          </div>

          <form onSubmit={handleSubmit} className="doctor-signup-form">
            {isReapply && (
              <div className="doctor-reapply-banner" style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: '#fff6f6', border: '1px solid #ffdede' }}>
                <strong>Your previous application was rejected.</strong>
                <div>Please review and update your details before resubmitting.</div>
              </div>
            )}
            {step === 1 && (
              <>
                <div className="doctor-form-grid two-cols">
                  <div className="doctor-form-group">
                    <label htmlFor="fullName"><FaUser /> Full Name</label>
                    <input id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Dr. John Doe" required />
                  </div>
                  <div className="doctor-form-group">
                    <label htmlFor="email"><FaEnvelope /> Email Address</label>
                    <input id="email" type="email" name="email" value={formData.email} onChange={handleChange} placeholder="doctor@example.com" required readOnly={isReapply} />
                  </div>
                </div>

                <div className="doctor-form-grid two-cols">
                  <div className="doctor-form-group">
                    <label htmlFor="password"><FaLock /> Password</label>
                    <div className="doctor-password-field">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        className="doctor-password-toggle"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                    <div className="doctor-password-strength" aria-label="Password strength">
                      <div className={`bar s-${passwordStrength.score}`} />
                      <span>{passwordStrength.label}</span>
                    </div>
                  </div>

                  <div className="doctor-form-group">
                    <label htmlFor="confirmPassword"><FaLock /> Confirm Password</label>
                    <div className="doctor-password-field">
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        className="doctor-password-toggle"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="doctor-form-grid two-cols">
                  <div className="doctor-form-group">
                    <label htmlFor="licenseNumber">Medical License / Registration Number</label>
                    <input id="licenseNumber" name="licenseNumber" value={formData.licenseNumber} onChange={handleChange} placeholder="License #12345" required />
                  </div>
                  <div className="doctor-form-group">
                    <label htmlFor="specialization">Specialization</label>
                    <select id="specialization" name="specialization" value={formData.specialization} onChange={handleChange}>
                      {specializationOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="doctor-form-grid two-cols">
                  <div className="doctor-form-group">
                    <label htmlFor="hospitalName">Hospital / Clinic Name</label>
                    <input id="hospitalName" name="hospitalName" value={formData.hospitalName} onChange={handleChange} placeholder="Medical Center" required />
                  </div>
                  <div className="doctor-form-group">
                    <label htmlFor="location">Location / City</label>
                    <input id="location" name="location" value={formData.location} onChange={handleChange} placeholder="City, Country" required />
                  </div>
                </div>

                <div className="doctor-form-grid two-cols">
                  <div className="doctor-form-group">
                    <label htmlFor="yearsOfExperience">Years of Experience</label>
                    <div className="doctor-exp-row">
                      <input
                        id="yearsOfExperience"
                        type="range"
                        min="0"
                        max="40"
                        name="yearsOfExperience"
                        value={Number(formData.yearsOfExperience || 0)}
                        onChange={handleChange}
                      />
                      <span className="doctor-exp-pill">{Number(formData.yearsOfExperience || 0)} yrs</span>
                    </div>
                  </div>
                  <div className="doctor-form-group">
                    <label htmlFor="phoneNumber"><FaPhone /> Phone Number</label>
                    <input id="phoneNumber" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} placeholder="+1 (555) 123-4567" required />
                  </div>
                </div>

                <div className="doctor-form-group full-width">
                  <label>Availability Schedule Picker</label>
                  <div className="doctor-availability">
                    <div className="doctor-availability-days">
                      {Object.keys(availabilityDays).map((day) => (
                        <label key={day} className={`day-chip ${availabilityDays[day] ? "on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={availabilityDays[day]}
                            onChange={(e) => {
                              const next = { ...availabilityDays, [day]: e.target.checked };
                              setAvailabilityDays(next);
                              syncAvailabilityText(next, availabilityStart, availabilityEnd);
                            }}
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                    <div className="doctor-availability-time">
                      <div className="time-field">
                        <span>From</span>
                        <input
                          type="time"
                          value={availabilityStart}
                          onChange={(e) => {
                            const next = e.target.value;
                            setAvailabilityStart(next);
                            syncAvailabilityText(availabilityDays, next, availabilityEnd);
                          }}
                        />
                      </div>
                      <div className="time-field">
                        <span>To</span>
                        <input
                          type="time"
                          value={availabilityEnd}
                          onChange={(e) => {
                            const next = e.target.value;
                            setAvailabilityEnd(next);
                            syncAvailabilityText(availabilityDays, availabilityStart, next);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="doctor-form-group full-width">
                  <label htmlFor="availability">Available Days & Time (auto-filled)</label>
                  <input id="availability" name="availability" placeholder="Mon-Fri, 10:00 - 16:00" value={formData.availability} onChange={handleChange} required />
                </div>

                <div className="doctor-form-group full-width">
                  <label htmlFor="bio">Short Bio / Description</label>
                  <textarea id="bio" name="bio" rows="4" value={formData.bio} onChange={handleChange} placeholder="Tell patients about your expertise and experience." />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="doctor-upload-grid">
                  <div className="doctor-upload-item">
                    <label className="doctor-upload-label">
                      <FaFileUpload /> Upload Medical License Document
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          const err = validateFile(f, "doc");
                          if (err) {
                            setLicenseDocument(null);
                            setError(err);
                            return;
                          }
                          setError("");
                          setLicenseDocument(f);
                        }}
                        required={!isReapply}
                      />
                    </label>
                    <p className="doctor-upload-hint">
                      {licenseDocument
                        ? licenseDocument.name
                        : existingLicenseDocumentUrl
                        ? getNameFromUrl(existingLicenseDocumentUrl)
                        : "PDF/JPG/PNG"}
                    </p>
                  </div>
                  <div className="doctor-upload-item">
                    <label className="doctor-upload-label">
                      <FaIdCard /> Upload Doctor ID / Certificate
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          const err = validateFile(f, "doc");
                          if (err) {
                            setIdDocument(null);
                            setError(err);
                            return;
                          }
                          setError("");
                          setIdDocument(f);
                        }}
                        required={!isReapply}
                      />
                    </label>
                    <p className="doctor-upload-hint">
                      {idDocument ? idDocument.name : existingIdDocumentUrl ? getNameFromUrl(existingIdDocumentUrl) : "PDF/JPG/PNG"}
                    </p>
                  </div>
                </div>

                <div className="doctor-form-group full-width">
                  <label className="doctor-upload-label inline">
                    <FaUser /> Profile Photo (optional)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        const err = validateFile(f, "photo");
                        if (err) {
                          setProfilePhoto(null);
                          setError(err);
                          return;
                        }
                        setError("");
                        setProfilePhoto(f);
                      }}
                    />
                  </label>
                  <p className="doctor-upload-hint">{profilePhoto ? profilePhoto.name : "JPG/PNG"}</p>
                  {existingProfilePhotoUrl && !profilePhoto ? (
                    <p className="doctor-upload-hint">Existing: {getNameFromUrl(existingProfilePhotoUrl)}</p>
                  ) : null}
                </div>

                <label className="doctor-terms">
                  <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
                  <span>
                    I agree to the terms and confirm all submitted credentials are accurate.
                    <em><FaShieldAlt /> Medical compliance applies</em>
                  </span>
                </label>
              </>
            )}

            {error && <div className="doctor-form-error">{error}</div>}

            {loading && uploadProgress ? (
              <div className="doctor-upload-hint" style={{ marginTop: 8 }}>
                {uploadProgress?.message || "Uploading..."}
                {typeof uploadProgress?.percent === 'number' ? ` (${uploadProgress.percent}%)` : ''}
              </div>
            ) : null}

            <div className="doctor-step-actions">
              {step > 1 ? (
                <button type="button" className="doctor-step-btn secondary" onClick={handleBackStep} disabled={loading}>
                  Back
                </button>
              ) : (
                <span />
              )}

              {step < 3 ? (
                <button type="button" className="doctor-step-btn" onClick={handleNext} disabled={loading}>
                  Next
                </button>
              ) : (
                    <button className="doctor-signup-submit" type="submit" disabled={loading}>
                      {loading ? (
                        <><FaSpinner className="spinner" /> Submitting...</>
                      ) : isReapply ? (
                        <><FaCheckCircle /> Reapply for Verification</>
                      ) : (
                        <><FaCheckCircle /> Submit Verification Request</>
                      )}
                    </button>
              )}
            </div>
          </form>

          <p className="doctor-signup-footer">
            Already have an account? <Link to="/login" state={{ selectedRole: location.state?.selectedRole || "doctor" }}>Login here</Link>
          </p>
        </section>
      </div>

      {successOpen && (
        <div className="doctor-success-overlay" role="dialog" aria-modal="true" aria-label="Verification request submitted">
          <div className="doctor-success-modal">
            <div className="doctor-success-icon"><FaCheckCircle /></div>
            <h3>Verification Request Submitted</h3>
            <p>Your verification request has been submitted successfully. Please wait for admin approval.</p>
            <button
              type="button"
              className="doctor-success-btn"
              onClick={() => {
                setSuccessOpen(false);
                navigate("/login", {
                  replace: true,
                  state: {
                    selectedRole: "doctor",
                    successMessage: "Your verification request has been submitted successfully. Please wait for admin approval.",
                  },
                });
              }}
            >
              Continue to Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
