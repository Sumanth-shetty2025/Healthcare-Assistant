import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import Navigation from "./components/Navigation";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DoctorSignupPage from "./pages/DoctorSignupPage";
import DoctorReapplicationReviewPage from "./pages/DoctorReapplicationReviewPage";
import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import ChestXrayAnalysisPage from "./pages/ChestXrayAnalysisPage";
import ResultPage from "./pages/ResultPage";
import ScanningReportPage from "./pages/ScanningReportPage";
import DoctorRecommendationPage from "./pages/DoctorRecommendationPage";
import ScheduleAppointmentPage from "./pages/ScheduleAppointmentPage";
import DoctorAppointmentReviewPage from "./pages/DoctorAppointmentReviewPage";
import DoctorDashboard from "./pages/DoctorDashboard";
import DoctorVerificationStatusPage from "./pages/DoctorVerificationStatusPage";
import PatientAppointmentsPage from "./pages/PatientAppointmentsPage";
import AboutPage from "./pages/AboutPage";
import AdminDashboard from "./pages/AdminDashboard";
import UnauthorizedPage from "./pages/UnauthorizedPage";

export default function App() {
  const location = useLocation();
  const { user, loading, userRole } = useAuth();

  useEffect(() => {
    const path = location.pathname.replace("/", "") || "home";
    document.body.dataset.page = path;
    return () => {
      delete document.body.dataset.page;
    };
  }, [location.pathname]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/doctor-signup" element={<DoctorSignupPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!userRole) {
    return <UnauthorizedPage />;
  }

  if (userRole === "admin") {
    return (
      <Routes>
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<Navigate to="/admin-dashboard" replace />} />
      </Routes>
    );
  }

  if (userRole === "doctor") {
    return (
      <Routes>
        <Route
          path="/doctor-dashboard"
          element={
            <ProtectedRoute requiredRole="doctor">
              <DoctorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor-dashboard/appointment/:appointmentId"
          element={
            <ProtectedRoute requiredRole="doctor">
              <DoctorAppointmentReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor-verification-status"
          element={
            <ProtectedRoute requiredRole="doctor">
              <Navigate to="/doctor-dashboard" replace />
            </ProtectedRoute>
          }
        />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<Navigate to="/doctor-dashboard" replace />} />
      </Routes>
    );
  }

  if (userRole === "doctor_pending" || userRole === "doctor_rejected") {
    return (
      <Routes>
        <Route
          path="/doctor-verification-status"
          element={
            <ProtectedRoute requiredRole={["doctor_pending", "doctor_rejected"]}>
              <DoctorVerificationStatusPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor-signup"
          element={
            <ProtectedRoute requiredRole={["doctor_pending", "doctor_rejected"]}>
              <DoctorSignupPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor-reapply"
          element={
            <ProtectedRoute requiredRole={["doctor_pending", "doctor_rejected"]}>
              <DoctorReapplicationReviewPage />
            </ProtectedRoute>
          }
        />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<Navigate to="/doctor-verification-status" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <Navigation />
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute requiredRole="patient">
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute requiredRole="patient">
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute requiredRole="patient">
              <UploadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload/chest"
          element={
            <ProtectedRoute requiredRole="patient">
              <ChestXrayAnalysisPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/result"
          element={
            <ProtectedRoute requiredRole="patient">
              <ResultPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scanning-report"
          element={
            <ProtectedRoute requiredRole="patient">
              <ScanningReportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor-details"
          element={
            <ProtectedRoute requiredRole="patient">
              <DoctorRecommendationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute requiredRole="patient">
              <AboutPage />
            </ProtectedRoute>
          }
        />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route
          path="/doctors"
          element={
            <ProtectedRoute requiredRole="patient">
              <DoctorRecommendationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-appointments"
          element={
            <ProtectedRoute requiredRole="patient">
              <PatientAppointmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule-appointment"
          element={
            <ProtectedRoute requiredRole="patient">
              <ScheduleAppointmentPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
      <Footer />
    </div>
  );
}
