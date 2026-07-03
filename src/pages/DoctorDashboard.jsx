import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  equalTo,
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref,
  update,
} from "firebase/database";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  FaBars,
  FaBell,
  FaBriefcaseMedical,
  FaCalendarAlt,
  FaCheckCircle,
  FaChevronLeft,
  FaChevronRight,
  FaClipboardList,
  FaClock,
  FaFileMedical,
  FaFolderOpen,
  FaHome,
  FaMapMarkerAlt,
  FaRobot,
  FaSignOutAlt,
  FaTimes,
  FaTimesCircle,
  FaUserCircle,
  FaUserInjured,
} from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import { database } from "../firebase";
import {
  buildAppointmentStatusPayload,
  formatAppointmentDateLabel,
  formatAppointmentTimeLabel,
  parseAppointmentDateTime,
} from "../utils/appointmentService";
import "../styles/premiumDoctorDashboard.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

const SECTION_IDS = [
  "overview",
  "requests",
  "upcoming",
  "accepted",
  "reports",
  "ai",
  "notifications",
  "profile",
];

const NAV_ITEMS = [
  { id: "overview", label: "Dashboard Overview", icon: FaHome },
  { id: "requests", label: "Pending Requests", icon: FaClipboardList },
  { id: "upcoming", label: "Upcoming Appointments", icon: FaCalendarAlt },
  { id: "accepted", label: "Accepted Appointments", icon: FaCheckCircle },
  { id: "reports", label: "Patient Reports", icon: FaFileMedical },
  { id: "ai", label: "AI Predictions", icon: FaRobot },
  { id: "notifications", label: "Notifications", icon: FaBell },
  { id: "profile", label: "Profile Settings", icon: FaUserCircle },
];

const CHART_COLORS = {
  blue: "#0d6efd",
  teal: "#0fa3b1",
  green: "#14b86a",
  orange: "#f59f00",
  red: "#ef4444",
  slate: "#64748b",
  navy: "#0f2747",
};

const normalizeStatus = (value) => String(value || "pending").toLowerCase();

const toMillis = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const safeDateLabel = (value) => {
  const millis = toMillis(value);
  if (!millis) return "-";
  return new Date(millis).toLocaleString();
};

const getDiseaseLabel = (appointment) => {
  return (
    appointment?.disease ||
    appointment?.diseaseName ||
    appointment?.symptoms ||
    appointment?.symptomsText ||
    appointment?.symptomText ||
    "Not provided"
  );
};

const getAppointmentContactLabel = (appointment) =>
  appointment?.phone || appointment?.contactNumber || appointment?.phoneNumber || "-";

const getDoctorAvatar = (doctorProfile) =>
  doctorProfile?.profilePhotoUrl ||
  doctorProfile?.profileImage ||
  doctorProfile?.photoURL ||
  doctorProfile?.imageUrl ||
  doctorProfile?.avatar ||
  "";

const getPatientAvatar = (appointment) =>
  appointment?.patientPhotoUrl ||
  appointment?.patientProfileImage ||
  appointment?.patientAvatar ||
  appointment?.avatar ||
  "";

const getImageSource = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image") || raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/")) {
    return raw;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 100) {
    return `data:image/png;base64,${raw.replace(/\s+/g, "")}`;
  }
  return raw;
};

const getPrimaryMedicalImage = (appointment) =>
  getImageSource(
    appointment?.xrayImageUrl ||
      appointment?.scanImageUrl ||
      appointment?.uploadedImageUrl ||
      appointment?.imageUrl ||
      appointment?.xrayUrl ||
      appointment?.scanUrl ||
      appointment?.image
  );

const getGradCamImage = (appointment) =>
  getImageSource(
    appointment?.gradcam ||
      appointment?.gradCam ||
      appointment?.gradcamUrl ||
      appointment?.gradCamUrl ||
      appointment?.heatmapUrl ||
      appointment?.camImage
  );

const getReportUrl = (appointment) =>
  appointment?.scanningReportUrl ||
  appointment?.retinaReportUrl ||
  appointment?.medicalReportUrl ||
  appointment?.reportUrl ||
  "";

const getInitials = (name) => {
  const parts = String(name || "DR")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "DR";
};

const buildChartLabelStyle = (overrides = {}) => ({
  color: "#64748b",
  font: {
    family: "Plus Jakarta Sans",
    size: 12,
    weight: "600",
  },
  ...overrides,
});

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: "index",
    intersect: false,
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: "rgba(15, 39, 71, 0.95)",
      titleFont: {
        family: "Plus Jakarta Sans",
        weight: "700",
      },
      bodyFont: {
        family: "Plus Jakarta Sans",
      },
      padding: 12,
      cornerRadius: 12,
      displayColors: false,
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: buildChartLabelStyle(),
    },
    y: {
      beginAtZero: true,
      grid: {
        color: "rgba(15, 39, 71, 0.08)",
      },
      ticks: buildChartLabelStyle({ precision: 0 }),
    },
  },
};

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: "rgba(15, 39, 71, 0.95)",
      titleFont: {
        family: "Plus Jakarta Sans",
        weight: "700",
      },
      bodyFont: {
        family: "Plus Jakarta Sans",
      },
      padding: 12,
      cornerRadius: 12,
      displayColors: false,
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: buildChartLabelStyle(),
    },
    y: {
      beginAtZero: true,
      grid: {
        color: "rgba(15, 39, 71, 0.08)",
      },
      ticks: buildChartLabelStyle({ precision: 0 }),
    },
  },
};

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "70%",
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 12,
        boxHeight: 12,
        usePointStyle: true,
        pointStyle: "circle",
        ...buildChartLabelStyle(),
      },
    },
    tooltip: {
      backgroundColor: "rgba(15, 39, 71, 0.95)",
      titleFont: {
        family: "Plus Jakarta Sans",
        weight: "700",
      },
      bodyFont: {
        family: "Plus Jakarta Sans",
      },
      padding: 12,
      cornerRadius: 12,
    },
  },
};

export default function DoctorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const currentUserUid = user?.uid || "";
  const doctorUid = currentUserUid;

  const [doctorProfile, setDoctorProfile] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [isSidebarNavOpen, setIsSidebarNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 980 : false
  );
  const [activeSection, setActiveSection] = useState("overview");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  useEffect(() => {
    if (!doctorUid) return undefined;

    let doctorProfileData = {};
    let verifiedProfileData = {};

    const applyDoctorProfile = () => {
      const mergedProfile = { ...doctorProfileData, ...verifiedProfileData };
      setDoctorProfile(Object.keys(mergedProfile).length ? { id: doctorUid, ...mergedProfile } : null);
    };

    const profileRef = ref(database, `doctors/${doctorUid}`);
    const unsubProfile = onValue(profileRef, (snapshot) => {
      doctorProfileData = snapshot.exists() ? snapshot.val() || {} : {};
      applyDoctorProfile();
    });

    const verifiedProfileRef = ref(database, `verified_doctors/${doctorUid}`);
    const unsubVerifiedProfile = onValue(verifiedProfileRef, (snapshot) => {
      verifiedProfileData = snapshot.exists() ? snapshot.val() || {} : {};
      applyDoctorProfile();
    });

    const appointmentsQuery = query(
      ref(database, "appointments"),
      orderByChild("doctorId"),
      equalTo(doctorUid)
    );

    const unsubAppointments = onValue(
      appointmentsQuery,
      (snapshot) => {
        const allAppointments = snapshot.exists() ? snapshot.val() : {};
        const items = Object.entries(allAppointments)
          .map(([id, appointment]) => ({ id, ...(appointment || {}) }))
          .sort((left, right) => {
            return toMillis(right.createdAt) - toMillis(left.createdAt);
          });

        setAppointments(items);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load doctor appointments", error);
        setAppointments([]);
        setLoading(false);
      }
    );

    const notifQuery = query(
      ref(database, `doctor_notifications/${doctorUid}/items`),
      orderByChild("createdAt"),
      limitToLast(20)
    );

    const unsubNotifs = onValue(notifQuery, (snapshot) => {
      const value = snapshot.val() || {};
      const items = Object.entries(value)
        .map(([id, data]) => ({ id, ...(data || {}) }))
        .sort((left, right) => toMillis(right.createdAt) - toMillis(left.createdAt));
      setNotifications(items);
    });

    return () => {
      unsubProfile();
      unsubVerifiedProfile();
      unsubAppointments();
      unsubNotifs();
    };
  }, [doctorUid]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobileLayout = window.innerWidth <= 980;
      setIsMobileLayout(nextIsMobileLayout);

      if (!nextIsMobileLayout) {
        setIsSidebarNavOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const sectionElements = SECTION_IDS
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (!sectionElements.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry?.target?.id) {
          setActiveSection(visibleEntry.target.id);
        }
      },
      {
        threshold: [0.2, 0.35, 0.5],
        rootMargin: "-18% 0px -55% 0px",
      }
    );

    sectionElements.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedAppointment?.id) return;

    const freshAppointment = appointments.find((item) => item.id === selectedAppointment.id);
    if (freshAppointment) {
      setSelectedAppointment(freshAppointment);
    }
  }, [appointments, selectedAppointment?.id]);

  const derived = useMemo(() => {
    const pendingRequests = appointments.filter((item) => normalizeStatus(item.status) === "pending");
    const acceptedAppointments = appointments.filter((item) => normalizeStatus(item.status) === "accepted");
    const completedAppointments = appointments.filter((item) => normalizeStatus(item.status) === "completed");
    const rejectedAppointments = appointments.filter((item) => normalizeStatus(item.status) === "rejected");

    const uniquePatients = new Set(
      appointments
        .map((item) => item.patientId || item.patientUid || item.uid)
        .filter(Boolean)
    );

    const today = new Date();
    const isSameDay = (value) => {
      const parsed = value instanceof Date ? value : value ? new Date(value) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) return false;
      return (
        parsed.getFullYear() === today.getFullYear() &&
        parsed.getMonth() === today.getMonth() &&
        parsed.getDate() === today.getDate()
      );
    };

    const todayAppointments = acceptedAppointments.filter((item) => isSameDay(parseAppointmentDateTime(item)));

    const now = Date.now();
    const upcomingAppointments = acceptedAppointments
      .filter((item) => {
        const parsed = parseAppointmentDateTime(item);
        return parsed ? parsed.getTime() > now : false;
      })
      .sort((left, right) => {
        const leftTime = parseAppointmentDateTime(left);
        const rightTime = parseAppointmentDateTime(right);
        return (leftTime ? leftTime.getTime() : 0) - (rightTime ? rightTime.getTime() : 0);
      });

    const reports = appointments
      .filter((item) => Boolean(getReportUrl(item) || getPrimaryMedicalImage(item) || getGradCamImage(item)))
      .slice(0, 20);

    const recentActivity = appointments.slice(0, 8).map((item) => {
      const status = normalizeStatus(item.status);
      const title =
        status === "pending"
          ? "New patient request"
          : status === "accepted"
            ? "Appointment accepted"
            : status === "rejected"
              ? "Appointment rejected"
              : status === "completed"
                ? "Consultation completed"
                : "Appointment updated";

      return {
        id: `activity_${item.id}`,
        title,
        message: `${item.patientName || "Patient"} - ${getDiseaseLabel(item)}`,
        createdAt: item.requestTime || item.createdAt || item.respondedAt || null,
        appointmentId: item.id,
        status,
      };
    });

    const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return {
        key: date.toLocaleDateString("en-CA"),
        label: date.toLocaleDateString(undefined, { weekday: "short" }),
        count: 0,
      };
    });

    const weeklyLookup = new Map(lastSevenDays.map((item) => [item.key, item]));
    appointments.forEach((item) => {
      const millis = toMillis(item.requestTime || item.createdAt);
      if (!millis) return;
      const key = new Date(millis).toLocaleDateString("en-CA");
      const bucket = weeklyLookup.get(key);
      if (bucket) {
        bucket.count += 1;
      }
    });

    const diseaseMap = new Map();
    appointments.forEach((item) => {
      const diseaseName = getDiseaseLabel(item);
      diseaseMap.set(diseaseName, (diseaseMap.get(diseaseName) || 0) + 1);
    });
    const topDiseases = Array.from(diseaseMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5);

    const lastSixMonths = Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date();
      monthDate.setDate(1);
      monthDate.setMonth(monthDate.getMonth() - (5 - index));
      return {
        key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
        label: monthDate.toLocaleDateString(undefined, { month: "short" }),
        total: 0,
        completed: 0,
      };
    });

    const monthLookup = new Map(lastSixMonths.map((item) => [item.key, item]));
    appointments.forEach((item) => {
      const requestMillis = toMillis(item.requestTime || item.createdAt);
      if (requestMillis) {
        const requestDate = new Date(requestMillis);
        const requestKey = `${requestDate.getFullYear()}-${requestDate.getMonth()}`;
        const bucket = monthLookup.get(requestKey);
        if (bucket) {
          bucket.total += 1;
        }
      }

      const completedMillis = toMillis(item.respondedAt || item.acceptedAt || item.createdAt);
      if (normalizeStatus(item.status) === "completed" && completedMillis) {
        const completedDate = new Date(completedMillis);
        const completedKey = `${completedDate.getFullYear()}-${completedDate.getMonth()}`;
        const bucket = monthLookup.get(completedKey);
        if (bucket) {
          bucket.completed += 1;
        }
      }
    });

    return {
      pendingRequests,
      acceptedAppointments,
      completedAppointments,
      rejectedAppointments,
      uniquePatientCount: uniquePatients.size,
      todayAppointmentCount: todayAppointments.length,
      upcomingAppointments,
      reports,
      recentActivity,
      weeklyCounts: lastSevenDays,
      topDiseases,
      monthlyTrends: lastSixMonths,
    };
  }, [appointments]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);

  const chartData = useMemo(() => {
    return {
      weeklyAppointments: {
        labels: derived.weeklyCounts.map((item) => item.label),
        datasets: [
          {
            label: "Appointments",
            data: derived.weeklyCounts.map((item) => item.count),
            borderColor: CHART_COLORS.blue,
            backgroundColor: "rgba(13, 110, 253, 0.16)",
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: "#ffffff",
            pointBorderColor: CHART_COLORS.blue,
          },
        ],
      },
      patientStatus: {
        labels: ["Pending", "Accepted", "Completed", "Rejected"],
        datasets: [
          {
            data: [
              derived.pendingRequests.length,
              derived.acceptedAppointments.length,
              derived.completedAppointments.length,
              derived.rejectedAppointments.length,
            ],
            backgroundColor: [
              CHART_COLORS.orange,
              CHART_COLORS.green,
              CHART_COLORS.teal,
              CHART_COLORS.red,
            ],
            borderWidth: 0,
            hoverOffset: 8,
          },
        ],
      },
      diseaseDistribution: {
        labels: derived.topDiseases.length ? derived.topDiseases.map(([label]) => label) : ["No cases"],
        datasets: [
          {
            label: "Patients",
            data: derived.topDiseases.length ? derived.topDiseases.map(([, count]) => count) : [0],
            backgroundColor: [
              CHART_COLORS.blue,
              CHART_COLORS.teal,
              CHART_COLORS.green,
              CHART_COLORS.orange,
              CHART_COLORS.red,
            ],
            borderRadius: 10,
            borderSkipped: false,
          },
        ],
      },
      monthlyTrends: {
        labels: derived.monthlyTrends.map((item) => item.label),
        datasets: [
          {
            label: "Requests",
            data: derived.monthlyTrends.map((item) => item.total),
            borderColor: CHART_COLORS.navy,
            backgroundColor: "rgba(15, 39, 71, 0.12)",
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            pointRadius: 3,
          },
          {
            label: "Completed",
            data: derived.monthlyTrends.map((item) => item.completed),
            borderColor: CHART_COLORS.green,
            backgroundColor: "rgba(20, 184, 106, 0.12)",
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            pointRadius: 3,
          },
        ],
      },
    };
  }, [derived]);

  const clinicName = doctorProfile?.hospitalName || doctorProfile?.hospital || "Not updated";
  const specialization = doctorProfile?.specialization || "General Physician";
  const experienceValue = doctorProfile?.yearsOfExperience || doctorProfile?.experience || "0";
  const experienceLabel = /year/i.test(String(experienceValue)) ? String(experienceValue) : `${experienceValue} years`;
  const displayName =
    doctorProfile?.fullName ||
    user?.displayName ||
    (user?.email ? user.email.split("@")[0] : "Doctor");
  const doctorAvatar = getDoctorAvatar(doctorProfile);
  const successRate = appointments.length
    ? Math.round(((derived.acceptedAppointments.length + derived.completedAppointments.length) / appointments.length) * 100)
    : 0;

  const currentDateLabel = currentTime.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const currentTimeLabel = currentTime.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const stats = [
    {
      id: "total-patients",
      label: "Total Patients",
      value: derived.uniquePatientCount,
      description: "Unique patients under your care",
      icon: FaUserInjured,
      tone: "blue",
    },
    {
      id: "today-appointments",
      label: "Today's Appointments",
      value: derived.todayAppointmentCount,
      description: "Accepted appointments scheduled today",
      icon: FaCalendarAlt,
      tone: "teal",
    },
    {
      id: "pending-requests",
      label: "Pending Requests",
      value: derived.pendingRequests.length,
      description: "Patient requests waiting for review",
      icon: FaClock,
      tone: "orange",
    },
    {
      id: "accepted-appointments",
      label: "Accepted Appointments",
      value: derived.acceptedAppointments.length,
      description: "Confirmed consultations in progress",
      icon: FaCheckCircle,
      tone: "green",
    },
    {
      id: "completed-consultations",
      label: "Completed Consultations",
      value: derived.completedAppointments.length,
      description: "Consultations completed successfully",
      icon: FaBriefcaseMedical,
      tone: "red",
    },
  ];

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      navigate("/login", { replace: true });
      try {
        if (user?.uid) localStorage.removeItem(`role_${user.uid}`);
      } catch (error) {
        // Ignore localStorage cleanup errors.
      }
    }
  };

  const handleUpdateAppointmentStatus = async (appointment, nextStatus) => {
    if (!appointment?.id) return;

    try {
      setActionLoadingId(appointment.id);
      await update(
        ref(database, `appointments/${appointment.id}`),
        buildAppointmentStatusPayload(appointment, nextStatus)
      );
    } catch (error) {
      console.error("Failed to update appointment status", error);
      alert("Unable to update appointment status.");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleAcceptAppointment = async (appointment) => {
    await handleUpdateAppointmentStatus(appointment, "accepted");
  };

  const handleRejectAppointment = async (appointment) => {
    await handleUpdateAppointmentStatus(appointment, "rejected");
  };

  const handleMarkAllRead = async () => {
    if (!user?.uid) return;
    const unread = notifications.filter((item) => !item.read);
    if (!unread.length) return;

    const updates = {};
    unread.forEach((item) => {
      updates[`doctor_notifications/${user.uid}/items/${item.id}/read`] = true;
    });

    await update(ref(database), updates);
  };

  const getStatusClass = (status) => {
    const normalized = normalizeStatus(status);
    if (normalized === "accepted") return "accepted";
    if (normalized === "rejected") return "rejected";
    if (normalized === "completed") return "completed";
    return "pending";
  };

  const handleSidebarToggle = () => {
    if (isMobileLayout) {
      setIsSidebarNavOpen((currentValue) => !currentValue);
      return;
    }

    setIsSidebarCollapsed((currentValue) => !currentValue);
  };

  const scrollToSection = (sectionId) => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(sectionId);
    }
    setIsSidebarNavOpen(false);
    setIsProfileMenuOpen(false);
  };

  const openAppointmentModal = (appointment) => {
    setSelectedAppointment(appointment);
    setIsProfileMenuOpen(false);
  };

  const closeAppointmentModal = () => {
    setSelectedAppointment(null);
  };

  const modalPrimaryImage = getPrimaryMedicalImage(selectedAppointment);
  const modalGradCamImage = getGradCamImage(selectedAppointment);
  const modalReportUrl = getReportUrl(selectedAppointment);
  const modalPatientAvatar = getPatientAvatar(selectedAppointment);

  return (
    <div className="modern-doctor-dashboard doctor-portal-page">
      <button
        type="button"
        className={`doctor-sidebar-overlay ${isSidebarNavOpen ? "is-visible" : ""}`}
        aria-hidden={!isSidebarNavOpen}
        onClick={() => setIsSidebarNavOpen(false)}
      />

      <div className={`doctor-portal-layout ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <aside
          className={`glass-panel doctor-portal-sidebar ${isSidebarNavOpen ? "is-mobile-open" : ""} ${
            isSidebarCollapsed ? "is-collapsed" : ""
          }`}
        >
          <div className="doctor-sidebar-brand">
            <div className="doctor-sidebar-brand-main">
              <div className="doctor-sidebar-avatar">
                {doctorAvatar ? <img src={doctorAvatar} alt={`Dr. ${displayName}`} /> : <span>{getInitials(displayName)}</span>}
              </div>
              <div className="doctor-sidebar-copy">
                <h3 className="doctor-sidebar-name">Dr. {displayName}</h3>
                <p className="doctor-sidebar-sub">{specialization}</p>
              </div>
            </div>

            <button
              type="button"
              className="doctor-sidebar-toggle"
              aria-label="Toggle dashboard sidebar"
              aria-expanded={isSidebarNavOpen || !isSidebarCollapsed}
              onClick={handleSidebarToggle}
            >
              {isMobileLayout ? (
                isSidebarNavOpen ? <FaTimes /> : <FaBars />
              ) : isSidebarCollapsed ? (
                <FaChevronRight />
              ) : (
                <FaChevronLeft />
              )}
            </button>
          </div>

          <div className="doctor-sidebar-meta">
            <span className="doctor-meta-pill">
              <FaBriefcaseMedical />
              {experienceLabel}
            </span>
            <span className="doctor-meta-pill">
              <FaMapMarkerAlt />
              {clinicName}
            </span>
          </div>

          <nav className="doctor-sidebar-nav" aria-label="Doctor dashboard navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`doctor-nav-item ${isActive ? "is-active" : ""}`}
                  onClick={() => scrollToSection(item.id)}
                >
                  <Icon />
                  <span>{item.label}</span>
                  {item.id === "notifications" && unreadCount > 0 ? <em className="doctor-nav-pill">{unreadCount}</em> : null}
                </button>
              );
            })}
          </nav>

          <div className="doctor-sidebar-footer">
            <button type="button" className="modern-logout-btn doctor-sidebar-logout" onClick={handleLogout}>
              <FaSignOutAlt />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        <main className="doctor-portal-main">
          <header className="glass-panel doctor-portal-topbar">
            <div className="doctor-header-copy">
              <span className="doctor-eyebrow">Healthcare Operations Dashboard</span>
              <h1>Welcome, Dr. {displayName}</h1>
              <p>Monitor patient flow, manage appointment approvals, and stay ahead of your daily consultations.</p>
            </div>

            <div className="doctor-header-tools">
              <div className="doctor-time-card">
                <span>{currentDateLabel}</span>
                <strong>{currentTimeLabel}</strong>
              </div>

              <button type="button" className="doctor-header-bell" onClick={() => scrollToSection("notifications")}>
                <FaBell />
                {unreadCount > 0 ? <span className="doctor-header-bell-count">{unreadCount}</span> : null}
              </button>

              <div className={`doctor-profile-menu ${isProfileMenuOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="doctor-profile-trigger"
                  onClick={() => setIsProfileMenuOpen((currentValue) => !currentValue)}
                >
                  <div className="doctor-profile-trigger-avatar">
                    {doctorAvatar ? <img src={doctorAvatar} alt={`Dr. ${displayName}`} /> : <span>{getInitials(displayName)}</span>}
                  </div>
                  <div className="doctor-profile-trigger-copy">
                    <strong>Dr. {displayName}</strong>
                    <span>{specialization}</span>
                  </div>
                </button>

                {isProfileMenuOpen ? (
                  <div className="doctor-profile-dropdown">
                    <button type="button" onClick={() => scrollToSection("profile")}>
                      <FaUserCircle />
                      Profile Settings
                    </button>
                    <button type="button" onClick={() => scrollToSection("notifications")}>
                      <FaBell />
                      Notification Center
                    </button>
                    <button type="button" onClick={handleLogout}>
                      <FaSignOutAlt />
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <section id="overview" data-dashboard-section className="doctor-portal-section">
            <div className="glass-panel doctor-overview-hero">
              <div className="doctor-overview-copy">
                <span className="doctor-eyebrow">Professional Summary</span>
                <h2>{specialization}</h2>
                <p>
                  {clinicName} is operating with {derived.pendingRequests.length} pending approvals,{" "}
                  {derived.upcomingAppointments.length} upcoming consultations, and a {successRate}% positive response rate.
                </p>

                <div className="doctor-overview-chip-row">
                  <span className="doctor-overview-chip">
                    <FaBriefcaseMedical />
                    {experienceLabel}
                  </span>
                  <span className="doctor-overview-chip">
                    <FaMapMarkerAlt />
                    {doctorProfile?.location || "Location not updated"}
                  </span>
                  <span className="doctor-overview-chip">
                    <FaCalendarAlt />
                    {doctorProfile?.availability || "Availability not updated"}
                  </span>
                </div>
              </div>

              <div className="doctor-overview-highlights">
                <div className="overview-highlight-card">
                  <span>Unread Alerts</span>
                  <strong>{unreadCount}</strong>
                  <small>Notification center updates</small>
                </div>
                <div className="overview-highlight-card">
                  <span>Reports Ready</span>
                  <strong>{derived.reports.length}</strong>
                  <small>Patient scans and documents</small>
                </div>
                <div className="overview-highlight-card">
                  <span>Weekly Requests</span>
                  <strong>{derived.weeklyCounts.reduce((sum, item) => sum + item.count, 0)}</strong>
                  <small>Incoming requests this week</small>
                </div>
              </div>
            </div>

            <div className="stats-grid-modern">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <article key={stat.id} className={`stat-card-modern stat-${stat.tone}`}>
                    <div className="stat-card-glow" />
                    <div className="stat-icon-wrapper">
                      <Icon />
                    </div>
                    <div className="stat-content">
                      <p className="stat-label">{stat.label}</p>
                      <p className="stat-value">{stat.value}</p>
                      <p className="stat-description">{stat.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="analytics-grid">
              <article className="glass-panel analytics-card analytics-card-wide">
                <div className="analytics-card-header">
                  <div>
                    <span className="doctor-eyebrow">Weekly Overview</span>
                    <h3>Weekly Appointments</h3>
                  </div>
                  <p>Track request volume over the last seven days.</p>
                </div>
                <div className="analytics-canvas">
                  <Line data={chartData.weeklyAppointments} options={lineChartOptions} />
                </div>
              </article>

              <article className="glass-panel analytics-card">
                <div className="analytics-card-header">
                  <div>
                    <span className="doctor-eyebrow">Patient Status</span>
                    <h3>Patient Statistics</h3>
                  </div>
                  <p>Current appointment distribution by status.</p>
                </div>
                <div className="analytics-canvas analytics-canvas-doughnut">
                  <Doughnut data={chartData.patientStatus} options={doughnutChartOptions} />
                </div>
              </article>

              <article className="glass-panel analytics-card">
                <div className="analytics-card-header">
                  <div>
                    <span className="doctor-eyebrow">Case Mix</span>
                    <h3>Disease Distribution</h3>
                  </div>
                  <p>Most frequent prediction categories in your queue.</p>
                </div>
                <div className="analytics-canvas">
                  <Bar data={chartData.diseaseDistribution} options={barChartOptions} />
                </div>
              </article>

              <article className="glass-panel analytics-card analytics-card-wide">
                <div className="analytics-card-header">
                  <div>
                    <span className="doctor-eyebrow">Longitudinal Trends</span>
                    <h3>Monthly Consultation Trends</h3>
                  </div>
                  <p>Requests versus completed consultations across the last six months.</p>
                </div>
                <div className="analytics-canvas">
                  <Line data={chartData.monthlyTrends} options={lineChartOptions} />
                </div>
              </article>
            </div>
          </section>

          <section id="requests" data-dashboard-section className="glass-panel doctor-portal-section">
            <div className="doctor-section-header">
              <div>
                <span className="doctor-eyebrow">Action Required</span>
                <h2 className="section-title">
                  <FaFolderOpen />
                  Pending Patient Requests
                </h2>
                <p className="doctor-section-sub">Review patient requests and respond directly from your command center.</p>
              </div>
              <div className="doctor-section-badge">{derived.pendingRequests.length} pending</div>
            </div>

            {loading ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaClock />
                </div>
                <h3>Loading patient requests</h3>
                <p>Your latest pending consultations are being prepared.</p>
              </div>
            ) : derived.pendingRequests.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaFolderOpen />
                </div>
                <h3>No pending requests</h3>
                <p>New patient requests will appear here automatically.</p>
              </div>
            ) : (
              <div className="advanced-cards-grid">
                {derived.pendingRequests.slice(0, 12).map((appointment) => {
                  const patientAvatar = getPatientAvatar(appointment);
                  return (
                    <article className="premium-appointment-card" key={appointment.id}>
                      <div className="card-top-accent" />

                      <div className="card-header-area">
                        <div className="patient-avatar-shell">
                          {patientAvatar ? (
                            <img src={patientAvatar} alt={appointment.patientName || "Patient"} />
                          ) : (
                            <span>{getInitials(appointment.patientName || "Patient")}</span>
                          )}
                        </div>

                        <div className="patient-titles">
                          <h3>{appointment.patientName || "Anonymous Patient"}</h3>
                          <p>{appointment.patientEmail || "Email not available"}</p>
                          <div className="patient-inline-meta">
                            <span>Age: {appointment.age || "N/A"}</span>
                            <span>Gender: {appointment.gender || "N/A"}</span>
                          </div>
                        </div>

                        <span className={`badge ${getStatusClass(appointment.status)}`}>{normalizeStatus(appointment.status)}</span>
                      </div>

                      <div className="card-details-grid">
                        <div className="card-detail-item">
                          <FaClipboardList className="cd-icon" />
                          <div>
                            <span>Disease / Prediction</span>
                            <strong>{getDiseaseLabel(appointment)}</strong>
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

                        <div className="card-detail-item">
                          <FaUserInjured className="cd-icon" />
                          <div>
                            <span>Contact Number</span>
                            <strong>{getAppointmentContactLabel(appointment)}</strong>
                          </div>
                        </div>

                        <div className="card-detail-item card-detail-item-full">
                          <FaFileMedical className="cd-icon" />
                          <div>
                            <span>Uploaded Report</span>
                            <strong>{getReportUrl(appointment) ? "Report available" : "No uploaded report"}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="card-meta-footer">
                        <span>Requested {safeDateLabel(appointment.requestTime || appointment.createdAt)}</span>
                      </div>

                      <div className="card-action-area">
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
                          onClick={() => handleRejectAppointment(appointment)}
                          disabled={actionLoadingId === appointment.id}
                        >
                          Reject
                        </button>
                        <button className="btn-gradient-blue" type="button" onClick={() => openAppointmentModal(appointment)}>
                          View Details
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section id="upcoming" data-dashboard-section className="glass-panel doctor-portal-section">
            <div className="doctor-section-header">
              <div>
                <span className="doctor-eyebrow">Hospital Schedule</span>
                <h2 className="section-title">
                  <FaCalendarAlt />
                  Upcoming Appointments
                </h2>
                <p className="doctor-section-sub">Accepted appointments scheduled for the future.</p>
              </div>
              <div className="doctor-section-badge">{derived.upcomingAppointments.length} upcoming</div>
            </div>

            {loading ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaClock />
                </div>
                <h3>Loading upcoming appointments</h3>
                <p>Your upcoming consultations are being prepared.</p>
              </div>
            ) : derived.upcomingAppointments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaCalendarAlt />
                </div>
                <h3>No upcoming appointments</h3>
                <p>Accepted appointments with future patient-selected slots appear here.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Disease</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Contact Number</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.upcomingAppointments.slice(0, 8).map((appointment) => (
                      <tr key={appointment.id}>
                        <td>
                          <div className="patient-info">
                            <div className="patient-avatar-mini">
                              {getInitials(appointment.patientName || "Patient")}
                            </div>
                            <div>
                              <strong>{appointment.patientName || "Anonymous Patient"}</strong>
                              <small>{appointment.gender || "N/A"}</small>
                            </div>
                          </div>
                        </td>
                        <td>{getDiseaseLabel(appointment)}</td>
                        <td>{formatAppointmentDateLabel(appointment)}</td>
                        <td>{formatAppointmentTimeLabel(appointment)}</td>
                        <td>{getAppointmentContactLabel(appointment)}</td>
                        <td>
                          <span className={`badge ${getStatusClass(appointment.status)}`}>{normalizeStatus(appointment.status)}</span>
                        </td>
                        <td>
                          <button className="action-btn-outline" type="button" onClick={() => openAppointmentModal(appointment)}>
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="accepted" data-dashboard-section className="glass-panel doctor-portal-section">
            <div className="doctor-section-header">
              <div>
                <span className="doctor-eyebrow">Confirmed Caseload</span>
                <h2 className="section-title">
                  <FaCheckCircle />
                  Accepted Appointments
                </h2>
                <p className="doctor-section-sub">Your active accepted consultations and patient commitments.</p>
              </div>
              <div className="doctor-section-badge">{derived.acceptedAppointments.length} accepted</div>
            </div>

            {loading ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaClock />
                </div>
                <h3>Loading accepted appointments</h3>
                <p>Confirmed appointment records are being prepared.</p>
              </div>
            ) : derived.acceptedAppointments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaCheckCircle />
                </div>
                <h3>No accepted appointments</h3>
                <p>Accept a request to move it into your active schedule.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Disease</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Contact Number</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.acceptedAppointments.slice(0, 12).map((appointment) => (
                      <tr key={appointment.id}>
                        <td>
                          <div className="patient-info">
                            <div className="patient-avatar-mini">
                              {getInitials(appointment.patientName || "Patient")}
                            </div>
                            <div>
                              <strong>{appointment.patientName || "Anonymous Patient"}</strong>
                              <small>{appointment.patientEmail || "Email not available"}</small>
                            </div>
                          </div>
                        </td>
                        <td>{getDiseaseLabel(appointment)}</td>
                        <td>{formatAppointmentDateLabel(appointment)}</td>
                        <td>{formatAppointmentTimeLabel(appointment)}</td>
                        <td>{getAppointmentContactLabel(appointment)}</td>
                        <td>
                          <span className={`badge ${getStatusClass(appointment.status)}`}>{normalizeStatus(appointment.status)}</span>
                        </td>
                        <td>
                          <button className="action-btn-outline" type="button" onClick={() => openAppointmentModal(appointment)}>
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="reports" data-dashboard-section className="glass-panel doctor-portal-section">
            <div className="doctor-section-header">
              <div>
                <span className="doctor-eyebrow">Radiology and Reports</span>
                <h2 className="section-title">
                  <FaFileMedical />
                  Patient Reports
                </h2>
                <p className="doctor-section-sub">Access uploaded scans, images, and supporting medical documents.</p>
              </div>
              <div className="doctor-section-badge">{derived.reports.length} files ready</div>
            </div>

            {loading ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaClock />
                </div>
                <h3>Loading reports</h3>
                <p>Report assets are being prepared.</p>
              </div>
            ) : derived.reports.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaFileMedical />
                </div>
                <h3>No reports available</h3>
                <p>Reports will appear when patients upload them with their requests.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Prediction</th>
                      <th>Requested</th>
                      <th>Report</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.reports.map((appointment) => (
                      <tr key={appointment.id}>
                        <td>
                          <div className="patient-info">
                            <div className="patient-avatar-mini">
                              {getInitials(appointment.patientName || "Patient")}
                            </div>
                            <div>
                              <strong>{appointment.patientName || "Anonymous Patient"}</strong>
                              <small>{appointment.modality || "General"}</small>
                            </div>
                          </div>
                        </td>
                        <td>{getDiseaseLabel(appointment)}</td>
                        <td>{safeDateLabel(appointment.requestTime || appointment.createdAt)}</td>
                        <td>
                          {getReportUrl(appointment) ? (
                            <a href={getReportUrl(appointment)} target="_blank" rel="noreferrer" className="inline-link">
                              Open Report
                            </a>
                          ) : (
                            "Not uploaded"
                          )}
                        </td>
                        <td>
                          <button className="action-btn-outline" type="button" onClick={() => openAppointmentModal(appointment)}>
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="ai" data-dashboard-section className="glass-panel doctor-portal-section">
            <div className="doctor-section-header">
              <div>
                <span className="doctor-eyebrow">Clinical Intelligence</span>
                <h2 className="section-title">
                  <FaRobot />
                  AI Predictions
                </h2>
                <p className="doctor-section-sub">A focused view of AI-assisted prediction outcomes for your current queue.</p>
              </div>
              <div className="doctor-section-badge">{appointments.length} cases tracked</div>
            </div>

            {loading ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaClock />
                </div>
                <h3>Loading AI predictions</h3>
                <p>Prediction records are being prepared.</p>
              </div>
            ) : appointments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FaRobot />
                </div>
                <h3>No AI results to display</h3>
                <p>Appointment requests linked to scans will show predictions here.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Prediction</th>
                      <th>Modality</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.slice(0, 12).map((appointment) => (
                      <tr key={appointment.id}>
                        <td>
                          <div className="patient-info">
                            <div className="patient-avatar-mini">
                              {getInitials(appointment.patientName || "Patient")}
                            </div>
                            <div>
                              <strong>{appointment.patientName || "Anonymous Patient"}</strong>
                              <small>{appointment.patientEmail || "Email not available"}</small>
                            </div>
                          </div>
                        </td>
                        <td>{getDiseaseLabel(appointment)}</td>
                        <td>{appointment.modality || "-"}</td>
                        <td>
                          <span className={`badge ${getStatusClass(appointment.status)}`}>{normalizeStatus(appointment.status)}</span>
                        </td>
                        <td>
                          <button className="action-btn-outline" type="button" onClick={() => openAppointmentModal(appointment)}>
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="notifications" data-dashboard-section className="glass-panel doctor-portal-section">
            <div className="doctor-section-header doctor-section-header-row">
              <div>
                <span className="doctor-eyebrow">Communication Hub</span>
                <h2 className="section-title">
                  <FaBell />
                  Notification Center
                </h2>
                <p className="doctor-section-sub">Appointment updates, patient requests, and system alerts in one place.</p>
              </div>
              <button className="doctor-notif-mark" type="button" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
                Mark all as read
              </button>
            </div>

            <div className="doctor-notifications-layout">
              <div className="doctor-notifications-column">
                <h3 className="doctor-subsection-title">
                  <FaFolderOpen />
                  Recent Activity
                </h3>

                {derived.recentActivity.length === 0 ? (
                  <div className="empty-state compact-empty-state">
                    <div className="empty-icon">
                      <FaFolderOpen />
                    </div>
                    <h3>No recent activity</h3>
                    <p>Patient request activity will appear here.</p>
                  </div>
                ) : (
                  <div className="doctor-notifications-list">
                    {derived.recentActivity.map((item) => (
                      <article key={item.id} className="doctor-notification-item unread">
                        <div className="doctor-notification-icon">
                          <FaFolderOpen />
                        </div>
                        <div className="doctor-notification-body">
                          <div className="doctor-notification-title-row">
                            <strong>{item.title}</strong>
                            <span className="doctor-notification-time">{safeDateLabel(item.createdAt)}</span>
                          </div>
                          <p>{item.message}</p>
                          <button
                            type="button"
                            className="action-btn-outline compact-outline-btn"
                            onClick={() => {
                              const appointment = appointments.find((entry) => entry.id === item.appointmentId);
                              if (appointment) {
                                openAppointmentModal(appointment);
                              }
                            }}
                          >
                            View Details
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="doctor-notifications-column">
                <h3 className="doctor-subsection-title">
                  <FaBell />
                  System Alerts
                </h3>

                {notifications.length === 0 ? (
                  <div className="empty-state compact-empty-state">
                    <div className="empty-icon">
                      <FaBell />
                    </div>
                    <h3>No notifications</h3>
                    <p>Updates will appear here as you receive requests and admin messages.</p>
                  </div>
                ) : (
                  <div className="doctor-notifications-list">
                    {notifications.map((item) => (
                      <article key={item.id} className={`doctor-notification-item ${item.read ? "read" : "unread"}`}>
                        <div className="doctor-notification-icon">
                          <FaBell />
                        </div>
                        <div className="doctor-notification-body">
                          <div className="doctor-notification-title-row">
                            <strong>{item.title || item.type || "Notification"}</strong>
                            <span className="doctor-notification-time">{safeDateLabel(item.createdAt)}</span>
                          </div>
                          <p>{item.message || item.body || "-"}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="profile" data-dashboard-section className="doctor-portal-section">
            <div className="doctor-profile-layout">
              <aside className="glass-panel profile-card">
                <div className="profile-header">
                  <div className="profile-avatar-wrapper">
                    <div className="profile-avatar">
                      {doctorAvatar ? <img src={doctorAvatar} alt={`Dr. ${displayName}`} /> : <span>{getInitials(displayName)}</span>}
                    </div>
                  </div>
                </div>

                <div className="profile-body">
                  <h3>Dr. {displayName}</h3>
                  <p className="email">{user?.email || "Email not available"}</p>
                  <div className="doctor-profile-status-row">
                    <span className="doctor-profile-chip">{specialization}</span>
                    <span className="doctor-profile-chip">{clinicName}</span>
                  </div>
                </div>
              </aside>

              <section className="glass-panel doctor-profile-details-card">
                <div className="doctor-section-header">
                  <div>
                    <span className="doctor-eyebrow">Profile Settings</span>
                    <h2 className="section-title">
                      <FaUserCircle />
                      Professional Details
                    </h2>
                    <p className="doctor-section-sub">Your current visible profile and practice information.</p>
                  </div>
                </div>

                <div className="info-grid">
                  <div className="info-item">
                    <div className="item-icon">
                      <FaBriefcaseMedical />
                    </div>
                    <h4>Experience</h4>
                    <p>{experienceLabel}</p>
                  </div>
                  <div className="info-item">
                    <div className="item-icon">
                      <FaCalendarAlt />
                    </div>
                    <h4>Availability</h4>
                    <p>{doctorProfile?.availability || "Not updated"}</p>
                  </div>
                  <div className="info-item">
                    <div className="item-icon">
                      <FaMapMarkerAlt />
                    </div>
                    <h4>Clinic</h4>
                    <p>{clinicName}</p>
                  </div>
                  <div className="info-item">
                    <div className="item-icon">
                      <FaMapMarkerAlt />
                    </div>
                    <h4>Location</h4>
                    <p>{doctorProfile?.location || "Not updated"}</p>
                  </div>
                </div>
              </section>
            </div>
          </section>

          {derived.rejectedAppointments.length > 0 ? (
            <section className="glass-panel doctor-portal-section rejected-appointments-section">
              <div className="doctor-section-header">
                <div>
                  <span className="doctor-eyebrow">Reference Archive</span>
                  <h2 className="section-title">
                    <FaTimesCircle />
                    Rejected Appointments
                  </h2>
                  <p className="doctor-section-sub">Historical list of rejected requests for quick reference.</p>
                </div>
                <div className="doctor-section-badge">{derived.rejectedAppointments.length} rejected</div>
              </div>

              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Disease</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Contact Number</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.rejectedAppointments.slice(0, 8).map((appointment) => (
                      <tr key={appointment.id}>
                        <td>
                          <div className="patient-info">
                            <div className="patient-avatar-mini">
                              {getInitials(appointment.patientName || "Patient")}
                            </div>
                            <div>
                              <strong>{appointment.patientName || "Anonymous Patient"}</strong>
                              <small>{appointment.patientEmail || "Email not available"}</small>
                            </div>
                          </div>
                        </td>
                        <td>{getDiseaseLabel(appointment)}</td>
                        <td>{formatAppointmentDateLabel(appointment)}</td>
                        <td>{formatAppointmentTimeLabel(appointment)}</td>
                        <td>{getAppointmentContactLabel(appointment)}</td>
                        <td>
                          <span className={`badge ${getStatusClass(appointment.status)}`}>{normalizeStatus(appointment.status)}</span>
                        </td>
                        <td>
                          <button className="action-btn-outline" type="button" onClick={() => openAppointmentModal(appointment)}>
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </main>
      </div>

      {selectedAppointment ? (
        <div className="doctor-modal-backdrop" role="presentation" onClick={closeAppointmentModal}>
          <div
            className="doctor-modal-shell glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doctor-appointment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="doctor-modal-header">
              <div>
                <span className="doctor-eyebrow">Patient Details</span>
                <h2 id="doctor-appointment-modal-title">{selectedAppointment.patientName || "Anonymous Patient"}</h2>
                <p>Review the full patient snapshot, uploaded assets, and appointment information.</p>
              </div>
              <button type="button" className="doctor-modal-close" onClick={closeAppointmentModal} aria-label="Close appointment details">
                <FaTimes />
              </button>
            </div>

            <div className="doctor-modal-hero">
              <div className="doctor-modal-patient">
                <div className="doctor-modal-avatar">
                  {modalPatientAvatar ? (
                    <img src={modalPatientAvatar} alt={selectedAppointment.patientName || "Patient"} />
                  ) : (
                    <span>{getInitials(selectedAppointment.patientName || "Patient")}</span>
                  )}
                </div>
                <div>
                  <h3>{selectedAppointment.patientName || "Anonymous Patient"}</h3>
                  <p>{selectedAppointment.patientEmail || "Email not available"}</p>
                  <div className="doctor-modal-chip-row">
                    <span className="doctor-profile-chip">Age: {selectedAppointment.age || "N/A"}</span>
                    <span className="doctor-profile-chip">Gender: {selectedAppointment.gender || "N/A"}</span>
                    <span className={`badge ${getStatusClass(selectedAppointment.status)}`}>{normalizeStatus(selectedAppointment.status)}</span>
                  </div>
                </div>
              </div>

              <div className="doctor-modal-summary">
                <div className="doctor-modal-summary-item">
                  <span>Appointment Date</span>
                  <strong>{formatAppointmentDateLabel(selectedAppointment)}</strong>
                </div>
                <div className="doctor-modal-summary-item">
                  <span>Appointment Time</span>
                  <strong>{formatAppointmentTimeLabel(selectedAppointment)}</strong>
                </div>
                <div className="doctor-modal-summary-item">
                  <span>Contact Number</span>
                  <strong>{getAppointmentContactLabel(selectedAppointment)}</strong>
                </div>
              </div>
            </div>

            <div className="doctor-modal-grid">
              <section className="doctor-modal-card">
                <h3>Patient Information</h3>
                <div className="doctor-modal-info-list">
                  <div><span>Disease / Prediction</span><strong>{getDiseaseLabel(selectedAppointment)}</strong></div>
                  <div><span>Modality</span><strong>{selectedAppointment.modality || "-"}</strong></div>
                  <div><span>Request Time</span><strong>{safeDateLabel(selectedAppointment.requestTime || selectedAppointment.createdAt)}</strong></div>
                  <div><span>Doctor Message</span><strong>{selectedAppointment.doctorMessage || selectedAppointment.patientNotification || "No message added"}</strong></div>
                </div>
              </section>

              <section className="doctor-modal-card">
                <h3>Appointment Details</h3>
                <div className="doctor-modal-info-list">
                  <div><span>Status</span><strong>{normalizeStatus(selectedAppointment.status)}</strong></div>
                  <div><span>Contact</span><strong>{getAppointmentContactLabel(selectedAppointment)}</strong></div>
                  <div><span>Hospital</span><strong>{selectedAppointment.hospitalName || selectedAppointment.hospital || clinicName}</strong></div>
                  <div><span>Doctor</span><strong>{selectedAppointment.doctorName || `Dr. ${displayName}`}</strong></div>
                </div>
              </section>

              <section className="doctor-modal-card doctor-modal-card-wide">
                <h3>Clinical Assets</h3>
                <div className="doctor-modal-media-grid">
                  <article className="doctor-modal-media">
                    <header>
                      <strong>Uploaded X-ray / Scan Image</strong>
                      <span>Original patient imaging</span>
                    </header>
                    {modalPrimaryImage ? (
                      <img src={modalPrimaryImage} alt="Uploaded patient scan" />
                    ) : (
                      <div className="doctor-modal-media-placeholder">No scan image available</div>
                    )}
                  </article>

                  <article className="doctor-modal-media">
                    <header>
                      <strong>Grad-CAM Image</strong>
                      <span>AI visual explanation layer</span>
                    </header>
                    {modalGradCamImage ? (
                      <img src={modalGradCamImage} alt="Grad-CAM visual" />
                    ) : (
                      <div className="doctor-modal-media-placeholder">No Grad-CAM image available</div>
                    )}
                  </article>

                  <article className="doctor-modal-media">
                    <header>
                      <strong>Medical Report</strong>
                      <span>Uploaded report or exported document</span>
                    </header>
                    {modalReportUrl ? (
                      <div className="doctor-modal-report-link-wrap">
                        <a href={modalReportUrl} target="_blank" rel="noreferrer" className="doctor-modal-report-link">
                          Open Medical Report
                        </a>
                      </div>
                    ) : (
                      <div className="doctor-modal-media-placeholder">No report document available</div>
                    )}
                  </article>
                </div>
              </section>
            </div>

            <div className="doctor-modal-footer">
              <button type="button" className="action-btn-outline" onClick={() => navigate(`/doctor-dashboard/appointment/${selectedAppointment.id}`)}>
                Open Review Page
              </button>

              <div className="doctor-modal-footer-actions">
                <button type="button" className="action-btn-outline" onClick={closeAppointmentModal}>
                  Close
                </button>
                {normalizeStatus(selectedAppointment.status) === "pending" ? (
                  <>
                    <button
                      type="button"
                      className="btn-gradient-red"
                      disabled={actionLoadingId === selectedAppointment.id}
                      onClick={async () => {
                        await handleRejectAppointment(selectedAppointment);
                        closeAppointmentModal();
                      }}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="btn-gradient-green"
                      disabled={actionLoadingId === selectedAppointment.id}
                      onClick={async () => {
                        await handleAcceptAppointment(selectedAppointment);
                        closeAppointmentModal();
                      }}
                    >
                      Accept
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
