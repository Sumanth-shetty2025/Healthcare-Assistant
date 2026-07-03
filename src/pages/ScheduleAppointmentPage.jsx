import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { get, ref } from "firebase/database";
import {
  FaArrowLeft,
  FaBriefcaseMedical,
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaHospital,
  FaMapMarkerAlt,
  FaStethoscope,
  FaUser,
  FaUserMd,
} from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import { database } from "../firebase";
import { createAppointment } from "../utils/appointmentService";
import { loadStoredPrediction } from "../utils/predictionUtils";
import "../styles/scheduleAppointment.css";

const slotGroups = [
  {
    label: "Morning",
    icon: FaClock,
    slots: ["09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM"],
  },
  {
    label: "Afternoon",
    icon: FaClock,
    slots: ["12:00 PM", "12:30 PM", "01:00 PM", "02:00 PM", "02:30 PM", "03:00 PM"],
  },
  {
    label: "Evening",
    icon: FaClock,
    slots: ["04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM"],
  },
];

const formatDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildNextSevenDays = () => {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    return {
      value: formatDateValue(date),
      day: date.toLocaleDateString(undefined, { weekday: "short" }),
      date: date.toLocaleDateString(undefined, { day: "2-digit" }),
      month: date.toLocaleDateString(undefined, { month: "short" }),
      label: date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
    };
  });
};

const getDoctorName = (doctor) => doctor?.fullName || doctor?.doctorName || doctor?.name || "Doctor";
const getDoctorPhoto = (doctor) =>
  doctor?.profilePhotoUrl || doctor?.profileImage || doctor?.photoURL || doctor?.imageUrl || doctor?.avatar || "";
const getDoctorExperience = (doctor) => doctor?.yearsOfExperience || doctor?.experience || "Experience not specified";
const getHospitalName = (doctor) => doctor?.hospitalName || doctor?.hospital || "Clinic not specified";

export default function ScheduleAppointmentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const doctor = location.state?.doctor || null;
  const prediction = location.state?.prediction || loadStoredPrediction();
  const returnTo = location.state?.returnTo || "/doctor-details";
  const days = useMemo(() => buildNextSevenDays(), []);

  const [selectedDate, setSelectedDate] = useState(days[0]?.value || "");
  const [selectedTime, setSelectedTime] = useState("");
  const [patientProfile, setPatientProfile] = useState(null);
  const [formData, setFormData] = useState({
    patientName: user?.displayName || user?.email?.split("@")[0] || "",
    age: "",
    gender: "Male",
    contactNumber: "",
    disease: prediction?.prediction || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!doctor) {
      navigate("/doctor-details", { replace: true });
    }
  }, [doctor, navigate]);

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
        const profile = { ...userData, ...patientData };
        setPatientProfile(profile);
        setFormData((prev) => ({
          ...prev,
          patientName: profile.fullName || profile.patientName || user.displayName || user.email?.split("@")[0] || prev.patientName,
          age: profile.age || prev.age,
          gender: profile.gender || prev.gender,
          contactNumber: profile.phoneNumber || profile.contactNumber || profile.phone || prev.contactNumber,
        }));
      } catch (profileError) {
        console.error("Failed to load patient profile:", profileError);
      }
    };

    loadPatientProfile();
    return () => {
      active = false;
    };
  }, [user]);

  const selectedDateLabel = days.find((day) => day.value === selectedDate)?.label || "Select date";
  const doctorName = getDoctorName(doctor);
  const doctorPhoto = getDoctorPhoto(doctor);
  const doctorId = doctor?.uid || doctor?.doctorId || doctor?.id || "";

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleConfirm = async (event) => {
    event.preventDefault();

    if (!doctorId) {
      setError("Unable to identify the selected doctor. Please go back and choose the doctor again.");
      return;
    }

    if (!selectedDate || !selectedTime) {
      setError("Please select appointment date and time.");
      return;
    }

    if (!formData.patientName || !formData.age || !formData.contactNumber || !formData.disease) {
      setError("Please complete all patient details.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const now = Date.now();
      const patientUid = user?.uid || "";
      const patientEmail = user?.email || patientProfile?.email || "";

      const appointmentData = {
        doctorId,
        doctorUid: doctorId,
        doctorName,
        doctorEmail: doctor?.email || "",
        doctorSpecialization: doctor?.specialization || "",
        hospital: doctor?.hospital || doctor?.hospitalName || "",
        hospitalName: doctor?.hospitalName || doctor?.hospital || "",
        location: doctor?.location || "",
        patientUid,
        patientId: patientUid,
        userId: patientUid,
        uid: patientUid,
        patientName: formData.patientName,
        patientEmail,
        email: patientEmail,
        age: formData.age,
        gender: formData.gender,
        phone: formData.contactNumber,
        contactNumber: formData.contactNumber,
        appointmentDate: selectedDate,
        appointmentTime: selectedTime,
        disease: formData.disease,
        diseaseName: formData.disease,
        modality: prediction?.modality || "xray",
        scanningReportUrl: "",
        status: "pending",
        requestTime: now,
        createdAt: now,
      };

      console.log("Saved doctorId:", doctorId);
      await createAppointment(database, appointmentData);
      alert("Appointment request submitted successfully!");
      navigate("/my-appointments");
    } catch (saveError) {
      console.error("Failed to save appointment:", saveError);
      setError(saveError?.message || "Unable to save appointment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!doctor) {
    return null;
  }

  return (
    <main className="schedule-page">
      <div className="schedule-shell">
        <button type="button" className="schedule-back-btn" onClick={() => navigate(returnTo)}>
          <FaArrowLeft /> Back
        </button>

        <section className="schedule-doctor-panel">
          <div className="schedule-doctor-photo">
            {doctorPhoto ? <img src={doctorPhoto} alt={doctorName} /> : <FaUserMd />}
          </div>
          <div className="schedule-doctor-copy">
            <span className="schedule-kicker"><FaStethoscope /> Schedule Appointment</span>
            <h1>{doctorName}</h1>
            <div className="schedule-doctor-meta">
              <span><FaBriefcaseMedical /> {doctor?.specialization || "General Physician"}</span>
              <span><FaHospital /> {getHospitalName(doctor)}</span>
              <span><FaCalendarAlt /> {getDoctorExperience(doctor)}</span>
              {doctor?.location ? <span><FaMapMarkerAlt /> {doctor.location}</span> : null}
            </div>
          </div>
        </section>

        <form className="schedule-layout" onSubmit={handleConfirm}>
          <div className="schedule-main">
            <section className="schedule-card">
              <div className="schedule-section-title">
                <FaCalendarAlt />
                <div>
                  <h2>Choose Date</h2>
                  <p>Available slots for the next 7 days</p>
                </div>
              </div>

              <div className="schedule-date-row">
                {days.map((day) => (
                  <button
                    type="button"
                    key={day.value}
                    className={`schedule-date-card ${selectedDate === day.value ? "active" : ""}`}
                    onClick={() => setSelectedDate(day.value)}
                  >
                    <span>{day.day}</span>
                    <strong>{day.date}</strong>
                    <small>{day.month}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="schedule-card">
              <div className="schedule-section-title">
                <FaClock />
                <div>
                  <h2>Select Time Slot</h2>
                  <p>Pick one convenient consultation slot</p>
                </div>
              </div>

              <div className="slot-groups">
                {slotGroups.map((group) => {
                  const Icon = group.icon;
                  return (
                    <div className="slot-group" key={group.label}>
                      <h3><Icon /> {group.label}</h3>
                      <div className="slot-grid">
                        {group.slots.map((slot) => (
                          <button
                            type="button"
                            key={slot}
                            className={`slot-button ${selectedTime === slot ? "active" : ""}`}
                            onClick={() => setSelectedTime(slot)}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="schedule-card">
              <div className="schedule-section-title">
                <FaUser />
                <div>
                  <h2>Patient Details</h2>
                  <p>Confirm the details for this appointment request</p>
                </div>
              </div>

              <div className="schedule-form-grid">
                <label>
                  <span>Patient Name</span>
                  <input name="patientName" value={formData.patientName} onChange={handleFieldChange} required />
                </label>
                <label>
                  <span>Age</span>
                  <input name="age" type="number" min="1" max="120" value={formData.age} onChange={handleFieldChange} required />
                </label>
                <label>
                  <span>Gender</span>
                  <select name="gender" value={formData.gender} onChange={handleFieldChange} required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label>
                  <span>Contact Number</span>
                  <input name="contactNumber" value={formData.contactNumber} onChange={handleFieldChange} required />
                </label>
                <label className="wide">
                  <span>Disease / Prediction Result</span>
                  <input name="disease" value={formData.disease} onChange={handleFieldChange} required />
                </label>
              </div>
            </section>
          </div>

          <aside className="summary-card">
            <div className="summary-icon"><FaCheckCircle /></div>
            <h2>Appointment Summary</h2>
            <div className="summary-list">
              <div><span>Doctor</span><strong>{doctorName}</strong></div>
              <div><span>Date</span><strong>{selectedDateLabel}</strong></div>
              <div><span>Time</span><strong>{selectedTime || "Select time"}</strong></div>
              <div><span>Disease</span><strong>{formData.disease || "Not specified"}</strong></div>
              <div><span>Status</span><strong className="pending">Pending</strong></div>
            </div>

            {error ? <div className="schedule-error">{error}</div> : null}

            <button type="submit" className="confirm-appointment-btn" disabled={saving}>
              {saving ? "Confirming..." : "Confirm Appointment"}
            </button>

            <p className="summary-note">
              Your request will be sent to the doctor for approval using the selected date and time slot.
            </p>
          </aside>
        </form>
      </div>
    </main>
  );
}
