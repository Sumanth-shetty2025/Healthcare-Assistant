import { useState, useEffect } from "react";
import { equalTo, ref, onValue, orderByChild, query, update } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";

export default function PatientAppointmentsPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const appointmentsQuery = query(
      ref(database, "appointments"),
      orderByChild("patientUid"),
      equalTo(user.uid)
    );

    const unsubscribe = onValue(
      appointmentsQuery,
      (snapshot) => {
        const appointmentsData = [];
        const currentUid = String(user.uid || "");
        const currentEmail = String(user.email || "").toLowerCase();
        const currentDisplayName = String(user.displayName || "").trim().toLowerCase();
        const currentEmailLocalPart = currentEmail.includes("@") ? currentEmail.split("@")[0] : "";

        snapshot.forEach((childSnapshot) => {
          const item = {
            id: childSnapshot.key,
            ...childSnapshot.val(),
          };

          const candidateIds = [
            item.patientId,
            item.patientUid,
            item.userId,
            item.uid,
          ]
            .map((value) => String(value || ""))
            .filter(Boolean);

          const candidateEmails = [item.patientEmail, item.email]
            .map((value) => String(value || "").toLowerCase())
            .filter(Boolean);

          const candidateNames = [item.patientName, item.name]
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean);

          const matchesByPatientId = currentUid ? candidateIds.includes(currentUid) : false;
          const matchesByEmail = currentEmail ? candidateEmails.includes(currentEmail) : false;
          const matchesByName = Boolean(
            candidateNames.length > 0 &&
            (candidateNames.includes(currentDisplayName) || candidateNames.includes(currentEmailLocalPart))
          );

          if (matchesByPatientId || matchesByEmail || matchesByName) {
            appointmentsData.push(item);
          }
        });
        appointmentsData.sort((left, right) => {
          const leftTime = new Date(left.createdAt || left.requestTime || 0).getTime();
          const rightTime = new Date(right.createdAt || right.requestTime || 0).getTime();
          return rightTime - leftTime;
        });
        setAppointments(appointmentsData);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to fetch appointments:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const unreadNotifications = appointments.filter(
    (item) => item.patientNotification && item.patientNotificationSeen === false
  );

  const handleMarkAllAsRead = async () => {
    if (unreadNotifications.length === 0) {
      return;
    }

    try {
      setMarkingRead(true);
      await Promise.all(
        unreadNotifications.map((item) =>
          update(ref(database, `appointments/${item.id}`), {
            patientNotificationSeen: true,
            notificationReadAt: new Date().toISOString(),
          })
        )
      );
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
      alert("Unable to mark notifications as read. Please try again.");
    } finally {
      setMarkingRead(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="container text-center py-5">
          <h2>Loading Your Appointments...</h2>
        </div>
      </div>
    );
  }

  return (
    <main className="section-padding bg-soft">
      <div className="container">
        <div className="row">
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
                  <h1 className="h3 mb-0">
                    My Appointments{" "}
                    {unreadNotifications.length > 0 && (
                      <span className="badge bg-danger ms-2">
                        {unreadNotifications.length} New Update{unreadNotifications.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </h1>

                  {unreadNotifications.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={handleMarkAllAsRead}
                      disabled={markingRead}
                    >
                      {markingRead ? "Marking..." : "Mark all as read"}
                    </button>
                  )}
                </div>
                {appointments.length === 0 ? (
                  <div className="text-center py-5">
                    <p>You have no appointments scheduled.</p>
                    <Link to="/upload" className="btn btn-primary">
                      Book a New Appointment
                    </Link>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>Doctor</th>
                          <th>Age</th>
                          <th>Gender</th>
                          <th>Contact Number</th>
                          <th>Disease / Prediction Result</th>
                          <th>Scanning Report</th>
                          <th>Status</th>
                          <th>Checkup Date & Time</th>
                          <th>Doctor Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.map((apt) => (
                          <tr key={apt.id}>
                            <td>
                              {apt.patientName || user?.displayName || "-"}
                            </td>
                            <td>{apt.doctorName || apt.selectedDoctorName || apt.doctorEmail || "-"}</td>
                            <td>{apt.age || "-"}</td>
                            <td>{apt.gender || "-"}</td>
                            <td>{apt.phone || apt.contactNumber || "-"}</td>
                            <td>{apt.disease || apt.reason || "-"}</td>
                            <td>
                              {apt.scanningReportUrl ? (
                                <a href={apt.scanningReportUrl} target="_blank" rel="noreferrer">
                                  View Report
                                </a>
                              ) : (
                                "Not uploaded"
                              )}
                            </td>
                            <td style={{ textTransform: "capitalize" }}>
                              {apt.status || "pending"}
                            </td>
                            <td>
                              {apt.checkupDateTime
                                ? new Date(apt.checkupDateTime).toLocaleString()
                                : "Not scheduled yet"}
                            </td>
                            <td>
                              {apt.patientNotificationSeen === false && apt.patientNotification && (
                                <span className="badge bg-danger me-2">NEW</span>
                              )}
                              {apt.patientNotification ||
                                apt.doctorMessage ||
                                (apt.status === "accepted"
                                  ? "Doctor accepted your request."
                                  : apt.status === "rejected"
                                  ? "Doctor rejected your request."
                                  : "Waiting for doctor response")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
