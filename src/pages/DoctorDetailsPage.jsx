import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ref, get } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { loadStoredPrediction } from "../utils/predictionUtils";
import { createAppointment } from "../utils/appointmentService";
import "../styles/appointmentCard.css";

const normalize = (value) => String(value || "").toLowerCase().trim();

const isEyeSpecialist = (doctor) => {
  const specialization = normalize(doctor.specialization);
  return specialization.includes("retina") || specialization.includes("ophthalm");
};

const isChestSpecialist = (doctor) => {
  const specialization = normalize(doctor.specialization);
  return (
    specialization.includes("pulmon") ||
    specialization.includes("chest") ||
    specialization.includes("respiratory")
  );
};

const getRecommendedDoctors = (diseaseName, modality, doctorDirectory) => {
  const normalizedDisease = normalize(diseaseName);
  const normalizedModality = normalize(modality);

  const modalityFilteredDirectory = doctorDirectory.filter((doctor) => {
    if (normalizedModality === "retina") {
      return isEyeSpecialist(doctor);
    }
    if (normalizedModality === "xray") {
      return isChestSpecialist(doctor);
    }
    return true;
  });

  if (!normalizedDisease) {
    return modalityFilteredDirectory;
  }

  const scored = modalityFilteredDirectory
    .map((doctor) => {
      const score = (doctor.tags || []).reduce((count, tag) => {
        return normalizedDisease.includes(tag) ? count + 1 : count;
      }, 0);

      return { ...doctor, score };
    })
    .sort((a, b) => b.score - a.score);

  const matched = scored.filter((doctor) => doctor.score > 0);
  if (matched.length >= 10) {
    return matched;
  }

  if (matched.length > 0) {
    const matchedNames = new Set(matched.map((doctor) => doctor.doctorName));
    const remaining = scored.filter((doctor) => !matchedNames.has(doctor.doctorName));
    return [...matched, ...remaining];
  }

  return scored;
};

const isApprovedDoctor = (doctor) => {
  const status = normalize(doctor.status || doctor.verificationStatus);
  return status === "approved";
};

const getDoctorKey = (doctor) => String(doctor?.id || doctor?.uid || doctor?.doctorId || "").trim();

const normalizeDoctorProfile = (doctor) => {
  const doctorId = doctor?.id || doctor?.uid || doctor?.doctorId || "";

  return {
    ...(doctor || {}),
    doctorId,
    uid: doctorId,
    doctorName: doctor?.doctorName || doctor?.fullName || doctor?.name || "",
    hospital: doctor?.hospital || doctor?.hospitalName || "",
    contact: doctor?.contact || doctor?.phoneNumber || "",
    experience: doctor?.experience || doctor?.yearsOfExperience || "",
    profileImage: doctor?.profileImage || doctor?.profilePhotoUrl || "",
  };
};

const mergeUniqueDoctors = (primary = [], secondary = []) => {
  const merged = [];
  const seen = new Set();

  const add = (doctor) => {
    const key = getDoctorKey(doctor) || doctor?.doctorName;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(doctor);
  };

  primary.forEach(add);
  secondary.forEach(add);
  return merged;
};

export default function DoctorDetailsPage() {
  const navigate = useNavigate();
  const [doctorDirectory, setDoctorDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [formData, setFormData] = useState({
    patientName: "",
    age: "",
    gender: "Male",
    contactNumber: "",
    disease: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();

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
      } catch (error) {
        console.error("Failed to load patient profile:", error);
      }
    };

    loadPatientProfile();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const verifiedRef = ref(database, "verified_doctors");
        const verifiedSnap = await get(verifiedRef);

        const mergedMap = new Map();
        const addEntries = (snapshot) => {
          if (!snapshot?.exists()) return;
          const data = snapshot.val() || {};
          Object.entries(data).forEach(([id, doctor]) => {
            mergedMap.set(id, normalizeDoctorProfile({ id, ...(doctor || {}) }));
          });
        };

        addEntries(verifiedSnap);

        const mergedDoctors = Array.from(mergedMap.values());
        const approvedDoctors = mergedDoctors.filter(isApprovedDoctor);
        setDoctorDirectory(approvedDoctors);
      } catch (error) {
        console.error("Failed to fetch doctors:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDoctors();
  }, []);

  const location = useLocation();
  const routedPrediction = location.state?.prediction;
  const hasGeneratedReport = sessionStorage.getItem("scanningReportGenerated") === "true";
  const prediction = hasGeneratedReport ? routedPrediction || loadStoredPrediction() : null;
  const diseaseName = prediction?.prediction || "No prediction selected";
  const modality = prediction?.modality || "";
  const recommendedDoctors = prediction
    ? getRecommendedDoctors(diseaseName, modality, doctorDirectory)
    : [];
  const doctors = prediction
    ? mergeUniqueDoctors(recommendedDoctors, doctorDirectory)
    : doctorDirectory;
  const appointmentSubject = prediction
    ? encodeURIComponent(`Appointment request for ${diseaseName}`)
    : "";
  const appointmentBody = prediction
    ? encodeURIComponent(`Hello, I would like to request an appointment for ${diseaseName}. Please share available slots.`)
    : "";

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

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
    setShowModal(false);
    setSelectedDoctor(null);
  };

  const handleSubmitAppointment = async (e) => {
    e.preventDefault();

    if (!user?.uid) {
      alert("Please log in to submit an appointment request.");
      return;
    }

    if (
      !formData.patientName ||
      !formData.age ||
      !formData.contactNumber ||
      !formData.disease
    ) {
      alert("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      const resolvedDoctorId = selectedDoctor?.uid || "";

      if (!resolvedDoctorId) {
        alert("Unable to identify the selected doctor. Please refresh and try again.");
        return;
      }

      const appointmentData = {
        doctorId: resolvedDoctorId,
        doctorUid: resolvedDoctorId,
        doctorName: selectedDoctor.fullName || selectedDoctor.doctorName || "Doctor",
        doctorEmail: selectedDoctor.email || "",
        patientId: user.uid,
        patientUid: user.uid,
        patientName: formData.patientName,
        patientEmail: user.email || "",
        age: formData.age,
        gender: formData.gender,
        phone: formData.contactNumber,
        hospital: selectedDoctor.hospital,
        disease: formData.disease,
        scanningReportUrl: "",
        retinaReportUrl: "",
        status: "pending",
        createdAt: Date.now(),
      };

      console.log("Saved doctorId:", resolvedDoctorId);
      await createAppointment(database, appointmentData);

      alert(
        `Appointment request submitted! The doctor will contact you at ${formData.contactNumber}.`
      );
      handleCloseModal();
    } catch (error) {
      console.error("Failed to submit appointment request:", error);
      alert("Failed to submit appointment request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAppointmentClick = (doctor) => {
    handleOpenModal(doctor);
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="container">
          <h2>Loading Doctors...</h2>
        </div>
      </div>
    );
  }

  return (
    <main className="section-padding bg-soft doctor-page">
      <div className="container doctor-page-shell">
        <section className="doctor-hero card border-0 shadow-sm mb-4">
          <div className="card-body p-4 p-md-5">
            <div className="row align-items-center g-4">
              <div className="col-lg-8">
                <span className="eyebrow">Specialist Recommendations</span>
                <h1 className="doctor-hero-title mb-3">
                  {prediction ? `Top Doctors for ${diseaseName}` : "Approved Doctors"}
                </h1>
                <p className="doctor-hero-copy mb-0">
                  {prediction
                    ? "A ranked shortlist of specialists tailored to your scan result, with quick appointment actions and a responsive card layout."
                    : "Browse all admin-approved doctors and request appointments directly from this list."}
                </p>
              </div>
              <div className="col-lg-4">
                <div className="doctor-hero-panel">
                  <div className="doctor-hero-stat">
                    <span>{prediction ? "Recommended doctors" : "Approved doctors"}</span>
                    <strong>{doctors.length}</strong>
                  </div>
                  <div className="doctor-hero-stat">
                    <span>Condition</span>
                    <strong>{prediction ? diseaseName : "Browse all"}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {doctors.length ? (
          <div className="appointment-cards-container">
            {doctors.map((doctor, index) => (
              <article className="appointment-card" key={`${doctor.doctorName}-${doctor.location}`}>
                {/* Card Header with Avatar and Doctor Info */}
                <div className="appointment-card-header">
                  <div className="appointment-card-avatar">
                    {doctor.profileImage ? (
                      <img src={doctor.profileImage} alt={doctor.doctorName} className="appointment-card-avatar-img" />
                    ) : (
                      <i className="fa-solid fa-user-doctor" />
                    )}
                  </div>
                  <div className="appointment-card-info">
                    <h3 className="appointment-card-name">{doctor.doctorName}</h3>
                    <p className="appointment-card-specialty">{doctor.specialization}</p>
                    <p className="appointment-card-experience">{doctor.experience || doctor.yearsOfExperience || 'Experience not specified'}</p>
                  </div>
                </div>

                {/* Card Body - Details */}
                <div className="appointment-card-body">
                  <div className="appointment-card-details">
                    {/* Qualification */}
                    {doctor.qualification && (
                      <div className="appointment-card-detail-row">
                        <span className="label">Qualification:</span>
                        <span className="text">{doctor.qualification}</span>
                      </div>
                    )}

                    {/* Languages */}
                    {doctor.languages && (
                      <div className="appointment-card-detail-row">
                        <div className="icon"><i className="fa-solid fa-globe" /></div>
                        <span className="text">{doctor.languages}</span>
                      </div>
                    )}

                    {/* Consultation Hours */}
                    {doctor.consultationHours && (
                      <div className="appointment-card-detail-row">
                        <div className="icon"><i className="fa-solid fa-clock" /></div>
                        <span className="text">{doctor.consultationHours}</span>
                      </div>
                    )}

                    {/* Hospital */}
                    {doctor.hospital && (
                      <div className="appointment-card-hospital-badge">
                        <div className="icon"><i className="fa-solid fa-hospital" /></div>
                        <span>{doctor.hospital}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer - Action Buttons */}
                <div className="appointment-card-footer">
                  <button 
                    className="appointment-card-btn appointment-card-btn-primary" 
                    type="button" 
                    onClick={() => handleAppointmentClick(doctor)}
                  >
                    <i className="fa-solid fa-calendar-check" />
                    BOOK APPOINTMENT
                  </button>
                  {doctor.contact && (
                    <a 
                      href={`tel:${doctor.contact}`}
                      className="appointment-card-btn appointment-card-btn-secondary"
                    >
                      <i className="fa-solid fa-phone" />
                      CALL
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="result-card text-center py-5">
            <h5 className="mb-2">No approved doctors found</h5>
            <p className="text-muted mb-0">
              Ask an admin to approve doctor profiles so they appear here for patients.
            </p>
          </div>
        )}

        <div className="d-flex justify-content-center mt-4">
          <Link className="btn doctor-back-btn" to="/scanning-report">
            <i className="fa-solid fa-arrow-left me-2" />
            Back to Scanning Report
          </Link>
        </div>
      </div>

      {/* Appointment Modal */}
      {showModal && (
        <div className="appointment-modal-overlay" onClick={handleCloseModal}>
          <div
            className="appointment-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header with Doctor Info */}
            <div className="appointment-modal-header">
              <div className="appointment-doctor-info">
                <h3 className="appointment-doctor-name">
                  <i className="fa-solid fa-user-doctor me-2" />
                  {selectedDoctor?.doctorName}
                </h3>
                <p className="appointment-doctor-specialty mb-1">
                  <i className="fa-solid fa-stethoscope me-2" />
                  {selectedDoctor?.specialization}
                </p>
                <p className="appointment-doctor-hospital mb-0">
                  <i className="fa-solid fa-hospital me-2" />
                  {selectedDoctor?.hospital}
                </p>
              </div>
              <button
                className="appointment-modal-close"
                onClick={handleCloseModal}
                aria-label="Close appointment form"
              >
                <i className="fa-solid fa-times" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitAppointment} className="appointment-form">
              {/* Patient Name */}
              <div className="appointment-form-group">
                <label htmlFor="patientName" className="appointment-form-label">
                  <i className="fa-solid fa-user me-2" />
                  Patient Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  id="patientName"
                  name="patientName"
                  className="appointment-form-input"
                  placeholder="Enter your full name"
                  value={formData.patientName}
                  onChange={handleFormChange}
                  required
                />
              </div>

              {/* Age and Gender - Two Column Layout on Desktop */}
              <div className="appointment-form-row">
                <div className="appointment-form-group">
                  <label htmlFor="age" className="appointment-form-label">
                    <i className="fa-solid fa-calendar me-2" />
                    Age <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    id="age"
                    name="age"
                    className="appointment-form-input"
                    placeholder="Enter your age"
                    min="1"
                    max="120"
                    value={formData.age}
                    onChange={handleFormChange}
                    required
                  />
                </div>

                <div className="appointment-form-group">
                  <label htmlFor="gender" className="appointment-form-label">
                    <i className="fa-solid fa-person me-2" />
                    Gender <span className="text-danger">*</span>
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    className="appointment-form-input"
                    value={formData.gender}
                    onChange={handleFormChange}
                    required
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Contact Number */}
              <div className="appointment-form-group">
                <label htmlFor="contactNumber" className="appointment-form-label">
                  <i className="fa-solid fa-phone me-2" />
                  Contact Number <span className="text-danger">*</span>
                </label>
                <input
                  type="tel"
                  id="contactNumber"
                  name="contactNumber"
                  className="appointment-form-input"
                  placeholder="Enter your phone number"
                  value={formData.contactNumber}
                  onChange={handleFormChange}
                  required
                />
              </div>

              {/* Disease / Prediction Result */}
              <div className="appointment-form-group">
                <label htmlFor="disease" className="appointment-form-label">
                  <i className="fa-solid fa-bug me-2" />
                  Disease / Prediction Result
                </label>
                <input
                  type="text"
                  id="disease"
                  name="disease"
                  className="appointment-form-input"
                  value={formData.disease}
                  readOnly
                  style={{ backgroundColor: "#e9ecef", cursor: "not-allowed" }}
                />
              </div>

              {/* Submit Button */}
              <div className="appointment-form-actions">
                <button
                  type="submit"
                  className="btn btn-primary appointment-submit-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-paper-plane me-2" />
                      Submit Request
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary appointment-cancel-btn"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
