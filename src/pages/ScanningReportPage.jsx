import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { get, ref } from "firebase/database";
import { useAuth } from "../contexts/AuthContext";
import { database } from "../firebase";
import { loadStoredPrediction } from "../utils/predictionUtils";
import "../styles/scanReport.css";

export default function ScanningReportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const reportRef = useRef();
  const [prediction, setPrediction] = useState(null);
  const [patientDetails, setPatientDetails] = useState({
    name: "N/A",
    age: "N/A",
    gender: "N/A",
    email: "N/A",
  });
  const [uploadedImage, setUploadedImage] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const storedPrediction = loadStoredPrediction();
    setPrediction(storedPrediction);

    const imageFromSession = sessionStorage.getItem("uploadedImage");
    if (imageFromSession) {
      setUploadedImage(imageFromSession);
    }

    if (user?.uid) {
      let active = true;
      const loadPatientProfile = async () => {
        try {
          const [patientSnap, userSnap] = await Promise.all([
            get(ref(database, `patients/${user.uid}`)),
            get(ref(database, `users/${user.uid}`)),
          ]);
          if (!active) return;

          const patientProfile = patientSnap.exists() ? patientSnap.val() || {} : {};
          const userProfile = userSnap.exists() ? userSnap.val() || {} : {};
          const profile = { ...userProfile, ...patientProfile };

          setPatientDetails({
            name: profile.fullName || profile.patientName || profile.username || user.displayName || "N/A",
            age: profile.age || "N/A",
            gender: profile.gender || "N/A",
            email: profile.email || user.email || "N/A",
          });
        } catch (error) {
          console.error("Failed to load patient profile:", error);
          if (active) {
            setPatientDetails({
              name: user.displayName || "N/A",
              age: "N/A",
              gender: "N/A",
              email: user.email || "N/A",
            });
          }
        }
      };

      loadPatientProfile();
      return () => {
        active = false;
      };
    }
  }, [user]);

  const handleDownload = async () => {
    const input = reportRef.current;
    if (!input) return;

    const buttons = input.querySelector('.no-print');
    if (buttons) {
      buttons.style.display = 'none';
    }

    try {
      // Temporarily increase font size for PDF rendering
      input.style.fontSize = '16px'; // Adjust as needed

      const canvas = await html2canvas(input, {
        scale: 4, // Further increased scale for maximum resolution
        useCORS: true,
        allowTaint: true,
        scrollY: -window.scrollY,
        scrollX: 0,
        windowWidth: input.scrollWidth,
        windowHeight: input.scrollHeight,
      });

      // Revert font size change
      input.style.fontSize = '';

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const ratio = canvasWidth / canvasHeight;
      
      const imgWidth = pdfWidth;
      const imgHeight = imgWidth / ratio;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = -heightLeft;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`medical-report-${Date.now()}.pdf`);

    } catch (error) {
      console.error("Error generating PDF:", error);
      // Revert font size change in case of error
      input.style.fontSize = '';
    } finally {
      if (buttons) {
        buttons.style.display = 'flex';
      }
    }
  };

  const handleFindDoctor = () => {
    navigate("/doctors");
  };

  if (!prediction) {
    return (
      <main className="section-padding">
        <div className="container text-center">
          <h2>No Report Available</h2>
          <p>Please perform an analysis first to generate a report.</p>
        </div>
      </main>
    );
  }

  const {
    prediction: diseaseName,
    confidence,
    modality,
    symptomText,
    generatedReport,
    timestamp,
    gradcam,
  } = prediction;

  const gradcamSrc = gradcam?.startsWith("data:image")
    ? gradcam
    : gradcam
      ? `data:image/png;base64,${gradcam}`
      : "";

  return (
    <main className="section-padding report-page">
      <div id="report-content" ref={reportRef}>
        <div className="container">
          <div className="report-header">
            <h1>Medical Analysis Report</h1>
            <p>Generated on: {new Date(timestamp).toLocaleString()}</p>
          </div>

          <div className="report-card">
            <h2 className="report-section-title">Patient Information</h2>
            <div className="patient-info-grid">
              <div><strong>Patient Name:</strong> {patientDetails.name}</div>
              <div><strong>Age:</strong> {patientDetails.age}</div>
              <div><strong>Gender:</strong> {patientDetails.gender}</div>
              <div><strong>Email:</strong> {patientDetails.email}</div>
            </div>
          </div>

          <div className="report-card">
            <h2 className="report-section-title">Analysis Summary</h2>
            <div className="analysis-summary-grid">
              <div><strong>Predicted Condition:</strong> <span className="highlight">{diseaseName}</span></div>
              <div><strong>Confidence Score:</strong> <span className="highlight">{confidence.toFixed(2)}%</span></div>
              <div><strong>Analysis Modality:</strong> {modality}</div>
            </div>
          </div>

          {(modality === "xray" || modality === "hybrid") && (
            <div className="report-card">
              <h2 className="report-section-title">Imaging Analysis</h2>
              <div className="image-analysis-grid">
                <div className="image-container">
                  <h6>Original X-ray</h6>
                  {uploadedImage ? (
                    <img src={uploadedImage} alt="Uploaded X-ray" className="report-image" />
                  ) : (
                    <div className="image-placeholder">No image available</div>
                  )}
                </div>
                <div className="image-container">
                  <h6>Grad-CAM Heatmap</h6>
                  {gradcamSrc ? (
                    <img src={gradcamSrc} alt="Grad-CAM Heatmap" className="report-image" />
                  ) : (
                    <div className="image-placeholder">No heatmap available</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(modality === "symptom" || modality === "hybrid") && (
            <div className="report-card">
              <h2 className="report-section-title">Provided Symptoms</h2>
              <p className="symptoms-text">{symptomText || "No symptoms were provided."}</p>
            </div>
          )}

          <div className="report-card">
            <h2 className="report-section-title">Generated Report</h2>
            <pre className="generated-report-text">{generatedReport || "No detailed report was generated."}</pre>
          </div>

          <div className="text-center mt-5 d-flex justify-content-center gap-3 no-print">
            <button className="btn btn-primary" onClick={handleDownload}>
              <i className="fa-solid fa-download me-2" />
              Download
            </button>
            <button className="btn btn-secondary" onClick={handleFindDoctor}>
              <i className="fa-solid fa-user-doctor me-2" />
              Find a Doctor
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
