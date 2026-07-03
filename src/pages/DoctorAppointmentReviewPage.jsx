import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { onValue, ref, update } from "firebase/database";
import { useAuth } from "../contexts/AuthContext";
import { database } from "../firebase";
import {
  buildAppointmentStatusPayload,
  formatAppointmentDateLabel,
  formatAppointmentTimeLabel,
} from "../utils/appointmentService";
import "../styles/doctorAppointments.css";

export default function DoctorAppointmentReviewPage() {
  const { appointmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [appointment, setAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [doctorMessage, setDoctorMessage] = useState("");

  useEffect(() => {
    if (!user?.uid || !appointmentId) {
      setLoading(false);
      return undefined;
    }

    const appointmentRef = ref(database, `appointments/${appointmentId}`);
    const unsubscribe = onValue(
      appointmentRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setAppointment(null);
          setLoading(false);
          return;
        }

        const item = { id: snapshot.key, ...snapshot.val() };
        const assignedDoctorId = String(item.doctorId || item.doctorUid || "");

        if (assignedDoctorId !== user.uid) {
          setError("You are not authorized to access this appointment.");
          setLoading(false);
          return;
        }

        setAppointment(item);
        setDoctorMessage((currentValue) => currentValue || item.doctorMessage || "");
        setLoading(false);
      },
      () => {
        setError("Unable to load appointment details.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, appointmentId]);

  const handleStatusChange = async (nextStatus) => {
    if (!appointment) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      await update(
        ref(database, `appointments/${appointment.id}`),
        buildAppointmentStatusPayload(appointment, nextStatus, { doctorMessage })
      );

      navigate("/doctor-dashboard");
    } catch (saveError) {
      setError("Failed to update appointment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="doctor-appointments-page">
        <main className="doctor-appointments-container">
          <div className="doctor-empty-box">Loading appointment details...</div>
        </main>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="doctor-appointments-page">
        <main className="doctor-appointments-container">
          <div className="doctor-empty-box">
            Appointment not found. <Link to="/doctor-dashboard">Back to dashboard</Link>
          </div>
        </main>
      </div>
    );
  }

  const currentStatus = String(appointment.status || "pending").toLowerCase();
  const contactNumber =
    appointment.phone || appointment.contactNumber || appointment.phoneNumber || "Not specified";
  const reportUrl = appointment.scanningReportUrl || appointment.retinaReportUrl || "";

  return (
    <div className="doctor-appointments-page">
      <header className="doctor-appointments-header">
        <div className="doctor-appointments-header-inner">
          <div>
            <p className="doctor-dashboard-kicker">Appointment Review</p>
            <h1>Appointment Details</h1>
            <p>Review the patient request and respond without selecting the slot again.</p>
          </div>
          <Link className="doctor-logout-btn" to="/doctor-dashboard">Back</Link>
        </div>
      </header>

      <main className="doctor-appointments-container">
        <section className="doctor-profile-card doctor-review-card">
          <h2>Patient Details</h2>
          <div className="doctor-review-grid">
            <div><span>Patient Name</span><strong>{appointment.patientName || "Not specified"}</strong></div>
            <div><span>Patient Email</span><strong>{appointment.patientEmail || "Not specified"}</strong></div>
            <div><span>Age</span><strong>{appointment.age || "Not specified"}</strong></div>
            <div><span>Gender</span><strong>{appointment.gender || "Not specified"}</strong></div>
            <div><span>Contact Number</span><strong>{contactNumber}</strong></div>
            <div><span>Disease / Prediction</span><strong>{appointment.disease || appointment.diseaseName || "Not specified"}</strong></div>
            <div><span>Appointment Date</span><strong>{formatAppointmentDateLabel(appointment)}</strong></div>
            <div><span>Appointment Time</span><strong>{formatAppointmentTimeLabel(appointment)}</strong></div>
            <div><span>Current Status</span><strong>{currentStatus}</strong></div>
            <div><span>Request Time</span><strong>{appointment.requestTime ? new Date(appointment.requestTime).toLocaleString() : "Not available"}</strong></div>
            <div className="doctor-review-grid-full">
              <span>Scanning Report</span>
              <strong>
                {reportUrl ? (
                  <a href={reportUrl} target="_blank" rel="noreferrer">View Uploaded Report</a>
                ) : (
                  "Not uploaded"
                )}
              </strong>
            </div>
          </div>
        </section>

        <section className="doctor-appointments-list-card doctor-review-card">
          <h2>Doctor Response</h2>
          <div className="doctor-review-form">
            <div className="doctor-review-field">
              <label htmlFor="doctorMessage">Message to Patient (optional)</label>
              <textarea
                id="doctorMessage"
                rows="3"
                value={doctorMessage}
                onChange={(event) => setDoctorMessage(event.target.value)}
                placeholder="Example: Please arrive 15 minutes early with previous reports."
              />
            </div>

            {error && <p className="doctor-review-error">{error}</p>}

            <div className="doctor-review-actions">
              <button
                type="button"
                className="doctor-appointment-action reject"
                onClick={() => navigate("/doctor-dashboard")}
                disabled={saving}
              >
                Back to Dashboard
              </button>
              {currentStatus === "pending" ? (
                <>
                  <button
                    type="button"
                    className="doctor-appointment-action reject"
                    onClick={() => handleStatusChange("rejected")}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Reject"}
                  </button>
                  <button
                    type="button"
                    className="doctor-appointment-action accept"
                    onClick={() => handleStatusChange("accepted")}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Accept"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
