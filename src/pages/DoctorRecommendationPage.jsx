import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { get, ref } from "firebase/database";
import { useAuth } from "../contexts/AuthContext";
import { auth, database } from "../firebase";
import { createAppointment } from "../utils/appointmentService";
import { loadStoredPrediction, formatConfidence } from "../utils/predictionUtils";
import { doctorMatchesPrediction, getRecommendedSpecializations, scoreDoctorMatch } from "../utils/doctorRecommendationUtils";
import "../styles/doctorRecommendation.css";

export default function DoctorRecommendationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const routedPrediction = useMemo(() => location.state?.prediction || null, [location.state]);
  const storedPrediction = useMemo(() => loadStoredPrediction(), []);
  const cachedPrediction = useMemo(() => {
    const cached = sessionStorage.getItem("doctorRecommendationPrediction");
    if (!cached) {
      return null;
    }
    try {
      return JSON.parse(cached);
    } catch (error) {
      return null;
    }
  }, []);
  const prediction = useMemo(() => {
    return routedPrediction || storedPrediction || cachedPrediction || null;
  }, [routedPrediction, storedPrediction, cachedPrediction]);
  const predictionKey = useMemo(() => {
    return `${prediction?.prediction || ""}|${prediction?.modality || ""}`;
  }, [prediction]);

  const [doctors, setDoctors] = useState([]);
  const [allDoctors, setAllDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [patientProfile, setPatientProfile] = useState(null);
  const [appointmentForm, setAppointmentForm] = useState({
    patientName: user?.displayName || user?.email?.split("@")[0] || "",
    age: "",
    gender: "Male",
    contactNumber: "",
    disease: prediction?.prediction || "",
  });
  const [filters, setFilters] = useState({
    specialization: "all",
    experience: "all",
    availability: "all",
    location: "all",
  });

  useEffect(() => {
    if (prediction) {
      sessionStorage.setItem("doctorRecommendationPrediction", JSON.stringify(prediction));
    }
  }, [prediction]);

  useEffect(() => {
    let active = true;

    const fetchDoctors = async () => {
      setLoading(true);
      setError("");

      try {
        // Patient-facing doctor lists must use only admin-approved doctors.
        const verifiedDoctorsRef = ref(database, "verified_doctors");

        const verifiedSnap = await get(verifiedDoctorsRef);

        const normalizeDoctorProfile = (doctor = {}) => ({
          ...doctor,
          doctorId: doctor.id || doctor.uid || doctor.doctorId || "",
          uid: doctor.id || doctor.uid || doctor.doctorId || "",
          doctorName: doctor.doctorName || doctor.fullName || doctor.name || "",
          fullName: doctor.fullName || doctor.doctorName || doctor.name || "",
          hospital: doctor.hospital || doctor.hospitalName || "",
          hospitalName: doctor.hospitalName || doctor.hospital || "",
          yearsOfExperience: doctor.yearsOfExperience || doctor.experience || "",
          experience: doctor.experience || doctor.yearsOfExperience || "",
        });

        const mergeById = (arr) => {
          const byKey = new Map();
          arr.forEach((d) => {
            const key = String(d?.id || d?.uid || d?.doctorId || "");
            if (!key) return;
            byKey.set(key, normalizeDoctorProfile(d));
          });
          return Array.from(byKey.values());
        };

        const fromVerified = [];
        if (verifiedSnap?.exists()) {
          const verifiedData = verifiedSnap.val() || {};
          Object.entries(verifiedData).forEach(([doctorId, doctorData]) => {
            fromVerified.push({ ...(doctorData || {}), id: doctorId, uid: doctorData?.uid || doctorId });
          });
        }

        const mergedAll = mergeById(fromVerified);

        const normalize = (value) => String(value || "").toLowerCase().trim();
        const isApprovedDoctor = (doctor) => {
          const status = normalize(doctor.status || doctor.verificationStatus);
          return status === "approved";
        };

        // Only show admin-approved doctors in the list/fallback.
        const approvedAll = mergedAll.filter(isApprovedDoctor);

        const recommended = prediction
          ? approvedAll.filter((doctor) => doctorMatchesPrediction(doctor, prediction))
          : [];

        recommended.sort((left, right) => {
          return scoreDoctorMatch(right, prediction || {}) - scoreDoctorMatch(left, prediction || {});
        });

        if (active) {
          setDoctors(recommended);
          setAllDoctors(approvedAll);
          sessionStorage.setItem("cachedRecommendedDoctors", JSON.stringify(recommended));
          sessionStorage.setItem("cachedAllDoctors", JSON.stringify(approvedAll));
        }
      } catch (fetchError) {
        if (active) {
          const permissionDenied =
            fetchError?.code === "PERMISSION_DENIED" ||
            String(fetchError?.message || "").toLowerCase().includes("permission");
          setError(
            permissionDenied
              ? "Permission denied: patients cannot read verified_doctors. Update Firebase Realtime Database rules to allow authenticated reads for verified_doctors."
              : fetchError?.message || "Unable to load doctor recommendations. Please try again."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchDoctors();

    return () => {
      active = false;
    };
  }, [prediction, predictionKey]);

  useEffect(() => {
    setAppointmentForm((prev) => ({
      ...prev,
      patientName: patientProfile?.fullName || patientProfile?.patientName || user?.displayName || user?.email?.split("@")[0] || prev.patientName,
      age: patientProfile?.age || prev.age,
      gender: patientProfile?.gender || prev.gender,
      contactNumber: patientProfile?.phoneNumber || patientProfile?.contactNumber || patientProfile?.phone || prev.contactNumber,
    }));
  }, [patientProfile, user]);

  useEffect(() => {
    if (!user?.uid) {
      setPatientProfile(null);
      return undefined;
    }

    let active = true;
    const loadPatientProfile = async () => {
      try {
        const [patientSnap, userSnap] = await Promise.all([
          get(ref(database, `patients/${user.uid}`)),
          get(ref(database, `users/${user.uid}`)),
        ]);
        if (!active) return;

        const patientData = patientSnap.exists() ? patientSnap.val() || {} : {};
        const userData = userSnap.exists() ? userSnap.val() || {} : {};
        setPatientProfile({ ...userData, ...patientData });
      } catch (profileError) {
        console.error("Failed to load patient profile:", profileError);
      }
    };

    loadPatientProfile();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const recommendedSpecializations = useMemo(() => {
    return getRecommendedSpecializations(prediction || {});
  }, [prediction]);

  const showingDoctors = doctors.length > 0 ? doctors : allDoctors;
  const isFallbackList = doctors.length === 0 && allDoctors.length > 0;
  const uniqueValues = useCallback((keyFn) => {
    return Array.from(new Set(showingDoctors.map(keyFn).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [showingDoctors]);
  const specializationOptions = useMemo(() => uniqueValues((doctor) => doctor.specialization), [uniqueValues]);
  const locationOptions = useMemo(() => uniqueValues((doctor) => doctor.location), [uniqueValues]);
  const availabilityOptions = useMemo(() => uniqueValues((doctor) => doctor.availability), [uniqueValues]);
  const filteredDoctors = useMemo(() => {
    return showingDoctors.filter((doctor) => {
      const experienceValue = Number.parseInt(doctor.yearsOfExperience || doctor.experience || "0", 10) || 0;
      const experienceMatch =
        filters.experience === "all" ||
        (filters.experience === "0-5" && experienceValue <= 5) ||
        (filters.experience === "6-10" && experienceValue >= 6 && experienceValue <= 10) ||
        (filters.experience === "10+" && experienceValue > 10);

      return (
        (filters.specialization === "all" || doctor.specialization === filters.specialization) &&
        (filters.availability === "all" || doctor.availability === filters.availability) &&
        (filters.location === "all" || doctor.location === filters.location) &&
        experienceMatch
      );
    });
  }, [showingDoctors, filters]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setFilters({
      specialization: "all",
      experience: "all",
      availability: "all",
      location: "all",
    });
  };

  const getDoctorName = (doctor) => doctor.fullName || doctor.doctorName || "Doctor";
  const getInitials = (name) => {
    const parts = String(name || "DR").trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "DR";
  };
  const getDoctorPhoto = (doctor) =>
    doctor.profilePhotoUrl || doctor.profileImage || doctor.photoURL || doctor.imageUrl || doctor.avatar || "";

  const handleOpenModal = (doctor) => {
    navigate("/schedule-appointment", {
      state: {
        doctor,
        prediction,
        returnTo: location.pathname,
      },
    });
  };

  const handleCloseModal = () => {
    setSelectedDoctor(null);
  };

  const handleAppointmentChange = (event) => {
    const { name, value } = event.target;
    setAppointmentForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAppointmentSubmit = async (event) => {
    event.preventDefault();

    if (!selectedDoctor) {
      return;
    }

    if (
      !appointmentForm.patientName ||
      !appointmentForm.age ||
      !appointmentForm.contactNumber ||
      !appointmentForm.disease
    ) {
      setError("Please complete all appointment details.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const authUser = auth.currentUser || user;
      const patientUid = authUser?.uid || "";
      const patientEmail = authUser?.email || "";

      if (!patientUid) {
        setError("Unable to identify your account. Please log in again and retry.");
        setSubmitting(false);
        return;
      }

      try {
        const now = Date.now();
        const resolvedDoctorId = selectedDoctor.uid || "";

        if (!resolvedDoctorId) {
          setError("Unable to identify the selected doctor. Please refresh and try again.");
          setSubmitting(false);
          return;
        }
        
        const appointmentData = {
          doctorId: resolvedDoctorId,
          doctorUid: resolvedDoctorId,
          doctorName: selectedDoctor.fullName || selectedDoctor.doctorName || "Doctor",
          doctorEmail: selectedDoctor.email || "",
          doctorSpecialization: selectedDoctor.specialization || "",
          hospital: selectedDoctor.hospital || selectedDoctor.hospitalName || "",
          hospitalName: selectedDoctor.hospitalName || selectedDoctor.hospital || "",
          location: selectedDoctor.location || "",
          patientId: patientUid,
          patientUid,
          userId: patientUid,
          uid: patientUid,
          patientEmail,
          email: patientEmail,
          patientName: appointmentForm.patientName,
          age: appointmentForm.age,
          gender: appointmentForm.gender,
          phone: appointmentForm.contactNumber,
          contactNumber: appointmentForm.contactNumber,
          disease: appointmentForm.disease,
          diseaseName: appointmentForm.disease,
          modality: prediction?.modality || "xray",
          scanningReportUrl: "",
          status: "pending",
          requestTime: now,
          createdAt: now,
        };
        
        console.log("Saving appointment to database...");
        console.log("Saved doctorId:", resolvedDoctorId);
        await createAppointment(database, appointmentData);
        console.log("Appointment saved successfully");
        
        // Success - reset form and close modal
        setSelectedDoctor(null);
        setAppointmentForm({
          patientName: patientProfile?.fullName || patientProfile?.patientName || user?.displayName || user?.email?.split("@")[0] || "",
          age: patientProfile?.age || "",
          gender: patientProfile?.gender || "Male",
          contactNumber: patientProfile?.phoneNumber || patientProfile?.contactNumber || patientProfile?.phone || "",
          disease: prediction?.prediction || "",
        });
        
        setSubmitting(false);
        alert("Appointment request submitted successfully!");
        
      } catch (dbError) {
        console.error("Database save error:", dbError);
        setError(`Failed to save appointment: ${dbError.message}. Please try again.`);
        setSubmitting(false);
      }
    } catch (submitError) {
      console.error("Submission error:", submitError);
      setError("Unable to submit appointment request. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <main className="doctor-recommendation-page">
      <div className="doctor-recommendation-hero">
        <div className="doctor-page-container">
          <div className="doctor-hero-card">
            <div className="doctor-hero-copy">
              <span className="doctor-eyebrow">{prediction ? "Doctor Recommendation" : "Approved Doctors"}</span>
              <h1>Recommended Specialists</h1>
              <p>
                {prediction
                  ? "AI matched doctors based on your scan results and symptoms."
                  : "Browse all admin-approved doctors and request appointments directly from your dashboard."}
              </p>
            </div>
            <div className="doctor-hero-summary">
              <div className="summary-tile">
                <i className="fa-solid fa-notes-medical"></i>
                <span>Predicted Condition</span>
                <strong>{prediction?.prediction || "Browse all"}</strong>
              </div>
              <div className="summary-tile">
                <i className="fa-solid fa-chart-line"></i>
                <span>Confidence</span>
                <strong>{prediction ? `${formatConfidence(prediction.confidence).toFixed(2)}%` : "Not required"}</strong>
              </div>
              <div className="summary-tile">
                <i className="fa-solid fa-user-doctor"></i>
                <span>Recommended Specializations</span>
                <strong>{prediction ? recommendedSpecializations.slice(0, 3).join(", ") : "All approved doctors"}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="doctor-page-container doctor-content-shell">
        <aside className="doctor-filter-panel" aria-label="Doctor filters">
          <div className="filter-panel-header">
            <span>Filters</span>
            <button type="button" onClick={resetFilters}>Reset</button>
          </div>

          <label>
            <span>Specialization</span>
            <select name="specialization" value={filters.specialization} onChange={handleFilterChange}>
              <option value="all">All specializations</option>
              {specializationOptions.map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Experience</span>
            <select name="experience" value={filters.experience} onChange={handleFilterChange}>
              <option value="all">Any experience</option>
              <option value="0-5">0-5 years</option>
              <option value="6-10">6-10 years</option>
              <option value="10+">10+ years</option>
            </select>
          </label>

          <label>
            <span>Availability</span>
            <select name="availability" value={filters.availability} onChange={handleFilterChange}>
              <option value="all">Any availability</option>
              {availabilityOptions.map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Location</span>
            <select name="location" value={filters.location} onChange={handleFilterChange}>
              <option value="all">All locations</option>
              {locationOptions.map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
            </select>
          </label>

          <div className="filter-trust-card">
            <i className="fa-solid fa-shield-heart"></i>
            <strong>Admin approved</strong>
            <p>Every listed doctor has completed verification before appearing here.</p>
          </div>
        </aside>

        <section className="doctor-results-panel">
          <div className="doctor-results-toolbar">
            <div>
              <span className="doctor-count-pill">
                <i className="fa-solid fa-check-circle"></i>
                {prediction && doctors.length > 0
                  ? `${filteredDoctors.length} matching doctors`
                  : `${filteredDoctors.length} approved doctors`}
              </span>
              {isFallbackList && (
                <p className="doctor-results-note">No exact specialization match. Showing all approved doctors.</p>
              )}
            </div>
            <Link className="doctor-back-link" to="/result">
              <i className="fa-solid fa-arrow-left"></i>
              Back to Results
            </Link>
          </div>

          {loading ? (
            <div className="doctor-empty-state">
              <div className="empty-icon"><i className="fa-solid fa-spinner fa-spin"></i></div>
              <h2>Finding Your Specialists</h2>
              <p>Loading recommended doctors based on your medical prediction.</p>
            </div>
          ) : error ? (
            <div className="doctor-empty-state error-state">
              <div className="empty-icon"><i className="fa-solid fa-circle-exclamation"></i></div>
              <h2>Unable to Load Doctors</h2>
              <p>{error}</p>
              <button className="doctor-secondary-btn" onClick={() => navigate(-1)}>Go Back</button>
            </div>
          ) : showingDoctors.length === 0 ? (
            <div className="doctor-empty-state">
              <div className="empty-illustration">
                <i className="fa-solid fa-user-doctor"></i>
                <i className="fa-solid fa-heart-pulse"></i>
              </div>
              <h2>No Doctors Found</h2>
              <p>Ask an admin to approve doctor profiles so they appear here for patients.</p>
              <button className="doctor-secondary-btn" onClick={() => navigate(-1)}>Go Back</button>
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="doctor-empty-state">
              <div className="empty-icon"><i className="fa-solid fa-filter-circle-xmark"></i></div>
              <h2>No Doctors Match These Filters</h2>
              <p>Adjust your filters to see more approved specialists.</p>
              <button className="doctor-secondary-btn" onClick={resetFilters}>Clear Filters</button>
            </div>
          ) : (
            <div className="doctor-card-grid">
              {filteredDoctors.map((doctor) => {
                const doctorName = getDoctorName(doctor);
                const photo = getDoctorPhoto(doctor);
                const experience = doctor.yearsOfExperience || doctor.experience || "0";
                return (
                  <article className="doctor-recommendation-card" key={doctor.id || doctor.doctorId || doctorName}>
                    <div className="doctor-card-topline">
                      <span className="doctor-card-tag">{prediction && doctors.length > 0 ? "Best match" : "Approved"}</span>
                      <span className="doctor-rating"><i className="fa-solid fa-star"></i> {doctor.rating || "4.8"}</span>
                    </div>

                    <div className="doctor-card-header">
                      <div className="doctor-avatar">
                        {photo ? <img src={photo} alt={doctorName} /> : <span>{getInitials(doctorName)}</span>}
                      </div>
                      <div className="doctor-card-title">
                        <h3>{doctorName}</h3>
                        <p>{doctor.specialization || "General Physician"}</p>
                      </div>
                    </div>

                    <div className="doctor-card-body">
                      <div className="doctor-detail-row">
                        <i className="fa-solid fa-hospital"></i>
                        <span>{doctor.hospitalName || doctor.hospital || "Clinic not specified"}</span>
                      </div>
                      <div className="doctor-detail-row">
                        <i className="fa-solid fa-location-dot"></i>
                        <span>{doctor.location || "Location not specified"}</span>
                      </div>
                      <div className="doctor-detail-row">
                        <i className="fa-solid fa-briefcase-medical"></i>
                        <span>{experience} years experience</span>
                      </div>
                      <div className="doctor-detail-row">
                        <i className="fa-solid fa-calendar-check"></i>
                        <span>{doctor.availability || "Availability not updated"}</span>
                      </div>
                    </div>

                    <div className="doctor-card-footer">
                      <div className="doctor-fee">
                        <span>Consultation</span>
                        <strong>{doctor.consultationFee || doctor.fee || "On request"}</strong>
                      </div>
                      <button className="doctor-book-btn" onClick={() => handleOpenModal(doctor)}>
                        <i className="fa-solid fa-calendar-plus"></i>
                        Book Appointment
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedDoctor && (
        <div className="appointment-modal-overlay" onClick={handleCloseModal}>
          <div className="appointment-modal-content appointment-modal-wide" onClick={(event) => event.stopPropagation()}>
            <div className="appointment-modal-header">
              <div className="appointment-doctor-info">
                <h3 className="appointment-doctor-name">
                  {selectedDoctor.fullName || selectedDoctor.doctorName}
                </h3>
                <p className="appointment-doctor-specialty mb-1">{selectedDoctor.specialization}</p>
                <p className="appointment-doctor-hospital mb-0">{selectedDoctor.hospitalName || selectedDoctor.hospital}</p>
              </div>
              <button className="appointment-modal-close" type="button" onClick={handleCloseModal} aria-label="Close appointment form">
                ×
              </button>
            </div>

            <form className="appointment-form" onSubmit={handleAppointmentSubmit}>
              <div className="appointment-form-row">
                <div className="appointment-form-group">
                  <label className="appointment-form-label" htmlFor="patientName">Patient Name</label>
                  <input className="appointment-form-input" id="patientName" name="patientName" value={appointmentForm.patientName} onChange={handleAppointmentChange} required />
                </div>
                <div className="appointment-form-group">
                  <label className="appointment-form-label" htmlFor="age">Age</label>
                  <input className="appointment-form-input" id="age" name="age" type="number" min="1" max="120" value={appointmentForm.age} onChange={handleAppointmentChange} required />
                </div>
              </div>

              <div className="appointment-form-row">
                <div className="appointment-form-group">
                  <label className="appointment-form-label" htmlFor="gender">Gender</label>
                  <select className="appointment-form-input" id="gender" name="gender" value={appointmentForm.gender} onChange={handleAppointmentChange} required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="appointment-form-group">
                  <label className="appointment-form-label" htmlFor="contactNumber">Contact Number</label>
                  <input className="appointment-form-input" id="contactNumber" name="contactNumber" value={appointmentForm.contactNumber} onChange={handleAppointmentChange} required />
                </div>
              </div>

              <div className="appointment-form-group">
                <label className="appointment-form-label" htmlFor="disease">Disease / Prediction Result</label>
                <input className="appointment-form-input" id="disease" name="disease" value={appointmentForm.disease} readOnly />
              </div>

              {error && <div className="appointment-form-error">{error}</div>}

              <div className="appointment-form-actions">
                <button type="button" className="btn appointment-btn-cancel" onClick={handleCloseModal} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn appointment-btn-submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Appointment Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
