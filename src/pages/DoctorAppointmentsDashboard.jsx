import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { equalTo, onValue, orderByChild, query, ref, update } from "firebase/database";
import { useAuth } from "../contexts/AuthContext";
import { database } from "../firebase";
import {
  buildAppointmentStatusPayload,
  formatAppointmentDateLabel,
  formatAppointmentTimeLabel,
} from "../utils/appointmentService";
import { FaUserMd, FaClock, FaCheckCircle, FaTimesCircle, FaUserCircle, FaMapMarkerAlt, FaBriefcaseMedical, FaCalendarAlt, FaSignOutAlt, FaFolderOpen, FaNotesMedical, FaPhoneAlt, FaVial } from 'react-icons/fa';
import "../styles/premiumDoctorDashboard.css";

export default function DoctorAppointmentsDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const doctorUid = user?.uid || "";
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");

  useEffect(() => {
    if (!doctorUid) {
      return undefined;
    }

    let doctorProfileData = {};
    let verifiedProfileData = {};
    const applyDoctorProfile = () => {
      const mergedProfile = { ...doctorProfileData, ...verifiedProfileData };
      setDoctorProfile(Object.keys(mergedProfile).length ? { id: doctorUid, ...mergedProfile } : null);
    };

    const profileRef = ref(database, `doctors/${doctorUid}`);
    const unsubscribeProfile = onValue(profileRef, (snapshot) => {
      doctorProfileData = snapshot.exists() ? snapshot.val() || {} : {};
      applyDoctorProfile();
    });

    const verifiedProfileRef = ref(database, `verified_doctors/${doctorUid}`);
    const unsubscribeVerifiedProfile = onValue(verifiedProfileRef, (snapshot) => {
      verifiedProfileData = snapshot.exists() ? snapshot.val() || {} : {};
      applyDoctorProfile();
    });

    const applyAppointmentsSnapshot = (snapshot) => {
      const allAppointments = snapshot.exists() ? snapshot.val() : {};
      const items = Object.entries(allAppointments)
        .map(([id, appointment]) => ({ id, ...(appointment || {}) }));

      items.sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      });

      setAppointments(items);
      setLoading(false);
    };

    console.log("Logged-in Doctor UID:", doctorUid);
    const appointmentsQuery = query(
      ref(database, "appointments"),
      orderByChild("doctorId"),
      equalTo(doctorUid)
    );
    const unsubscribeAppointments = onValue(appointmentsQuery, (snapshot) => {
      applyAppointmentsSnapshot(snapshot);
      snapshot.forEach((childSnapshot) => {
        const appointment = childSnapshot.val() || {};
        console.log("Appointment doctorId:", appointment.doctorId);
      });
    }, (error) => {
      console.error("Failed to load doctor appointments", error);
      setAppointments([]);
      setLoading(false);
    });

    return () => {
      unsubscribeProfile();
      unsubscribeVerifiedProfile();
      unsubscribeAppointments();
    };
  }, [doctorUid]);

  const stats = useMemo(() => {
    return {
      total: appointments.length,
      pending: appointments.filter((item) => item.status === "pending").length,
      accepted: appointments.filter((item) => item.status === "accepted").length,
      rejected: appointments.filter((item) => item.status === "rejected").length,
    };
  }, [appointments]);

  const clinicName = doctorProfile?.hospitalName || doctorProfile?.hospital || "Not updated";
  const experienceValue =
    doctorProfile?.yearsOfExperience || doctorProfile?.experience || "0";
  const experienceLabel = /year/i.test(String(experienceValue))
    ? String(experienceValue)
    : `${experienceValue} years`;

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleOpenDetailsPage = (appointmentId) => {
    navigate(`/doctor-dashboard/appointment/${appointmentId}`);
  };

  const handleAcceptAppointment = async (appointment) => {
    if (!appointment?.id) return;

    try {
      setActionLoadingId(appointment.id);
      await update(
        ref(database, `appointments/${appointment.id}`),
        buildAppointmentStatusPayload(appointment, "accepted")
      );
    } catch (error) {
      console.error("Failed to accept appointment", error);
      alert("Unable to accept appointment.");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleRejectAppointment = async (appointmentId) => {
    try {
      setActionLoadingId(appointmentId);
      await update(ref(database, `appointments/${appointmentId}`), {
        status: "rejected",
        patientNotification: "Your appointment request was rejected by doctor.",
        patientNotificationSeen: false,
        respondedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to update appointment status", error);
      alert("Unable to update appointment status.");
    } finally {
      setActionLoadingId("");
    }
  };

  const getStatusClass = (status) => {
    if (status === 'accepted') return 'accepted';
    if (status === 'rejected') return 'rejected';
    return 'pending';
  };

  return (
    <div className="modern-doctor-dashboard">
      <header className="glass-panel modern-header">
        <div className="welcome-text">
          <h1>Welcome, Dr. {doctorProfile?.fullName || user?.displayName || user?.email?.split("@")[0]}</h1>
          <p>{doctorProfile?.specialization || "Manage your appointments and intelligent patient requests."}</p>
        </div>
        <div className="header-actions">
          <button onClick={handleLogout} className="modern-logout-btn">
            <FaSignOutAlt /> Logout
          </button>
        </div>
      </header>

      <div className="stats-grid-modern">
        <div className="stat-card-modern total-requests">
          <div className="stat-icon-wrapper"><FaUserMd /></div>
          <div className="stat-content">
            <p className="stat-label">Total Requests</p>
            <p className="stat-value">{stats.total}</p>
          </div>
        </div>
        <div className="stat-card-modern pending-requests">
          <div className="stat-icon-wrapper"><FaClock /></div>
          <div className="stat-content">
            <p className="stat-label">Pending</p>
            <p className="stat-value">{stats.pending}</p>
          </div>
        </div>
        <div className="stat-card-modern accepted-requests">
          <div className="stat-icon-wrapper"><FaCheckCircle /></div>
          <div className="stat-content">
            <p className="stat-label">Accepted</p>
            <p className="stat-value">{stats.accepted}</p>
          </div>
        </div>
        <div className="stat-card-modern rejected-requests">
          <div className="stat-icon-wrapper"><FaTimesCircle /></div>
          <div className="stat-content">
            <p className="stat-label">Rejected</p>
            <p className="stat-value">{stats.rejected}</p>
          </div>
        </div>
      </div>

      <div className="dashboard-main-modern">
        <section className="glass-panel appointments-section" style={{ padding: '0', background: 'transparent', boxShadow: 'none', border: 'none', backdropFilter: 'none' }}>
          <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
            <div className="section-header">
              <h2 className="section-title"><FaFolderOpen /> Appointment Requests</h2>
              <p style={{ color: 'var(--text-gray)', margin: 0 }}>Review appointment requests sent by matched patients.</p>
            </div>

            {loading ? (
              <div className="empty-state">
                <div className="empty-icon"><FaClock style={{animation: 'spin 2s linear infinite'}}/></div>
                <p>Loading intelligent operations...</p>
              </div>
            ) : appointments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><FaFolderOpen /></div>
                <h3>No Requests Found</h3>
                <p>You have zero pending intelligent operations today.</p>
              </div>
            ) : (
              <div className="advanced-cards-grid">
                {appointments.map((appointment) => (
                  <article className="premium-appointment-card" key={appointment.id}>
                    <div className="card-top-accent"></div>
                    <div className="card-header-area">
                      <div className="patient-avatar-mini" style={{ width: '50px', height: '50px', fontSize: '1.5rem' }}>
                        <FaUserCircle />
                      </div>
                      <div className="patient-titles">
                        <h3>{appointment.patientName}</h3>
                        <p>{appointment.patientEmail}</p>
                      </div>
                      <span className={`badge ${getStatusClass(appointment.status)}`} style={{ marginLeft: 'auto' }}>
                        {appointment.status || "pending"}
                      </span>
                    </div>

                    <div className="card-details-grid">
                      <div className="card-detail-item">
                        <FaNotesMedical className="cd-icon" />
                        <div>
                          <span>Disease</span>
                          <strong>{appointment.disease || appointment.diseaseName || "Not specified"}</strong>
                        </div>
                      </div>
                      <div className="card-detail-item">
                        <FaPhoneAlt className="cd-icon" />
                        <div>
                          <span>Phone</span>
                          <strong>{appointment.phone || appointment.phoneNumber || appointment.contactNumber || "Not specified"}</strong>
                        </div>
                      </div>
                      <div className="card-detail-item">
                        <FaUserCircle className="cd-icon" />
                        <div>
                          <span>Patient Info</span>
                          <strong>Age: {appointment.age || "N/A"} • {appointment.gender || "N/A"}</strong>
                        </div>
                      </div>
                      <div className="card-detail-item">
                        <FaVial className="cd-icon" />
                        <div>
                          <span>Scanning Report</span>
                          <strong>
                            {appointment.scanningReportUrl ? (
                              <a href={appointment.scanningReportUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--secondary-color)', textDecoration: 'none' }}>View Report</a>
                            ) : "Not uploaded"}
                          </strong>
                        </div>
                      </div>
                      <div className="card-detail-item">
                        <FaCalendarAlt className="cd-icon" />
                        <div>
                          <span>Appointment Date</span>
                          <strong>{formatAppointmentDateLabel(appointment)}</strong>
                        </div>
                      </div>
                      <div className="card-detail-item">
                        <FaClock className="cd-icon" />
                        <div>
                          <span>Appointment Time</span>
                          <strong>{formatAppointmentTimeLabel(appointment)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="card-action-area">
                      {appointment.status === "pending" ? (
                        <>
                          <button
                            className="btn-gradient-green"
                            type="button"
                            onClick={() => handleAcceptAppointment(appointment)}
                            disabled={actionLoadingId === appointment.id}
                          >
                            Accept
                          </button>
                          <button
                            className="btn-gradient-red"
                            type="button"
                            onClick={() => handleRejectAppointment(appointment.id)}
                            disabled={actionLoadingId === appointment.id}
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn-gradient-blue full-width"
                          type="button"
                          onClick={() => handleOpenDetailsPage(appointment.id)}
                        >
                          View Session Details
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="glass-panel profile-card h-fit-content">
          <div className="profile-header">
            <div className="profile-avatar-wrapper">
              <div className="profile-avatar">
                <FaUserMd />
              </div>
            </div>
          </div>
          
          <div className="profile-body">
            <h3>Dr. {doctorProfile?.fullName || user?.displayName || 'Physician'}</h3>
            <p className="email">{user?.email}</p>

            <div className="info-grid">
              <div className="info-item">
                <div className="item-icon"><FaBriefcaseMedical /></div>
                <h4>Experience</h4>
                <p>{experienceLabel}</p>
              </div>
              <div className="info-item">
                <div className="item-icon"><FaCalendarAlt /></div>
                <h4>Availability</h4>
                <p>{doctorProfile?.availability || "Not updated"}</p>
              </div>
              <div className="info-item">
                <div className="item-icon"><FaMapMarkerAlt /></div>
                <h4>Clinic</h4>
                <p>{clinicName}</p>
              </div>
              <div className="info-item">
                <div className="item-icon"><FaMapMarkerAlt /></div>
                <h4>Location</h4>
                <p>{doctorProfile?.location || "Not updated"}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
