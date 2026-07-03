import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { get, ref } from "firebase/database";
import { FaCheckCircle, FaClock, FaExclamationTriangle, FaFileMedicalAlt, FaRedo, FaSignOutAlt, FaStethoscope, FaUserMd } from "react-icons/fa";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import "../styles/doctorVerificationStatus.css";

const DECISION = {
  PENDING: "pending",
  REJECTED: "rejected",
  APPROVED: "approved",
};

const toMillis = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const pickRejectedReason = (record) => {
  const candidates = [
    record?.rejectionReason,
    record?.reason,
    record?.adminMessage,
    record?.message,
    record?.notes?.[0]?.note,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim()) || "Your submission did not meet the verification requirements.";
};

export default function DoctorVerificationStatusPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [decision, setDecision] = useState(DECISION.PENDING);
  const [requestDoc, setRequestDoc] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadStatus = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    const uid = user.uid;

    try {
      const [pendingSnap, verifiedSnap, rejectedSnap] = await Promise.all([
        get(ref(database, `pending_doctor_requests/${uid}`)),
        get(ref(database, `verified_doctors/${uid}`)),
        get(ref(database, `rejected_doctors/${uid}`)),
      ]);

      const verified = verifiedSnap.exists() ? verifiedSnap.val() || {} : null;
      const rejected = rejectedSnap.exists() ? rejectedSnap.val() || {} : null;
      const approvedTime = toMillis(verified?.approvedAt || verified?.updatedAt || verified?.createdAt);
      const rejectedTime = toMillis(rejected?.rejectedAt || rejected?.updatedAt || rejected?.createdAt);

      if (verified && (!rejected || approvedTime >= rejectedTime)) {
        navigate("/doctor-dashboard", { replace: true });
        return;
      }

      if (rejected) {
        setDecision(DECISION.REJECTED);
        setRequestDoc({ id: uid, ...rejected });
        setRejectionReason(pickRejectedReason(rejected));
        return;
      }

      if (pendingSnap.exists()) {
        setDecision(DECISION.PENDING);
        setRequestDoc({ id: uid, ...(pendingSnap.val() || {}) });
        setRejectionReason("");
        return;
      }

      setDecision(DECISION.PENDING);
      setRequestDoc(null);
      setRejectionReason("");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate, user?.uid]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStatus();
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const handleReapply = () => {
    // Navigate to the new reapplication review page with existing request data
    navigate("/doctor-reapply", { state: { record: requestDoc } });
  };

  const cardItems = useMemo(() => {
    if (decision === DECISION.REJECTED) {
      return [
        {
          icon: <FaExclamationTriangle />,
          label: "Verification Rejected",
          value: "Review the reason and reapply when ready.",
        },
        {
          icon: <FaUserMd />,
          label: "Account Status",
          value: requestDoc?.status || requestDoc?.verificationStatus || "rejected",
        },
        {
          icon: <FaFileMedicalAlt />,
          label: "Record",
          value: requestDoc?.licenseNumber || user?.email || "Available in your profile",
        },
      ];
    }

    return [
      {
        icon: <FaClock />,
        label: "Verification Pending",
        value: "Your application is currently under review.",
      },
      {
        icon: <FaStethoscope />,
        label: "Application Under Review",
        value: requestDoc?.specialization || requestDoc?.hospitalName || "Medical verification in progress",
      },
      {
        icon: <FaCheckCircle />,
        label: "Waiting for Admin Approval",
        value: requestDoc?.licenseNumber || user?.email || "You will be notified after the review",
      },
    ];
  }, [decision, requestDoc, user?.email]);

  const submittedAt = requestDoc?.createdAtIso || requestDoc?.createdAt || requestDoc?.updatedAt;
  const submittedLabel = submittedAt
    ? new Date(typeof submittedAt === "number" ? submittedAt : Date.parse(submittedAt)).toLocaleString()
    : "Not available";

  if (loading) {
    return (
      <div className="doctor-status-page">
        <div className="doctor-status-bg doctor-status-bg--one" />
        <div className="doctor-status-bg doctor-status-bg--two" />
        <div className="doctor-status-shell">
          <div className="doctor-status-card doctor-status-card--loading">
            <FaStethoscope className="doctor-status-spinner" />
            <h1>Checking verification status</h1>
            <p>Reviewing your doctor application against the latest admin decision.</p>
          </div>
        </div>
      </div>
    );
  }

  const isRejected = decision === DECISION.REJECTED;

  return (
    <div className="doctor-status-page">
      <div className="doctor-status-bg doctor-status-bg--one" />
      <div className="doctor-status-bg doctor-status-bg--two" />

      <div className="doctor-status-shell">
        <header className="doctor-status-hero">
          <div className="doctor-status-hero-copy">
            <span className={`doctor-status-pill ${isRejected ? "is-rejected" : "is-pending"}`}>
              <FaFileMedicalAlt /> Doctor Verification
            </span>
            <h1>{isRejected ? "Verification Rejected" : "Verification Pending"}</h1>
            <p>
              {isRejected
                ? "Your application needs attention before you can access the doctor dashboard."
                : "Your doctor profile is under review. Access will unlock automatically once approved."}
            </p>
          </div>

          <div className={`doctor-status-status ${isRejected ? "rejected" : "pending"}`}>
            <div className="doctor-status-status-icon">{isRejected ? <FaExclamationTriangle /> : <FaClock />}</div>
            <div>
              <span className="doctor-status-status-label">Current Status</span>
              <strong>{isRejected ? "Rejected" : "Pending Review"}</strong>
            </div>
          </div>
        </header>

        <section className="doctor-status-grid">
          {cardItems.map((item) => (
            <article key={item.label} className="doctor-status-card doctor-status-card--summary">
              <div className="doctor-status-card-icon">{item.icon}</div>
              <div>
                <h2>{item.label}</h2>
                <p>{item.value}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="doctor-status-card doctor-status-card--detail">
          {isRejected ? (
            <div className="doctor-status-panel doctor-status-panel--rejected">
              <div className="doctor-status-panel-title">
                <FaExclamationTriangle />
                <h2>Rejection Reason</h2>
              </div>
              <p>{rejectionReason}</p>
              <div className="doctor-status-meta">
                <div>
                  <span>Submitted</span>
                  <strong>{submittedLabel}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{user?.email || "Not available"}</strong>
                </div>
                <div>
                  <span>License</span>
                  <strong>{requestDoc?.licenseNumber || "Not available"}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="doctor-status-panel">
              <div className="doctor-status-panel-title">
                <FaUserMd />
                <h2>Application Under Review</h2>
              </div>
              <p>
                Verification is in progress. Please wait for the admin team to complete review of your
                doctor credentials and documents.
              </p>
              <div className="doctor-status-checklist">
                <div>
                  <FaCheckCircle /> Verification Pending
                </div>
                <div>
                  <FaCheckCircle /> Application Under Review
                </div>
                <div>
                  <FaCheckCircle /> Waiting for Admin Approval
                </div>
              </div>
              <div className="doctor-status-meta">
                <div>
                  <span>Submitted</span>
                  <strong>{submittedLabel}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{user?.email || "Not available"}</strong>
                </div>
                <div>
                  <span>Specialization</span>
                  <strong>{requestDoc?.specialization || "Not available"}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="doctor-status-actions">
            {isRejected ? (
              <button type="button" className="doctor-status-action doctor-status-action--primary" onClick={handleReapply}>
                Reapply
              </button>
            ) : (
              <button
                type="button"
                className="doctor-status-action doctor-status-action--primary"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <FaRedo className={refreshing ? "spin" : ""} />
                Refresh Status
              </button>
            )}

            <button type="button" className="doctor-status-action doctor-status-action--secondary" onClick={handleLogout}>
              <FaSignOutAlt /> Logout
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
