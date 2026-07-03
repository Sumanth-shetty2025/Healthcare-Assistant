import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { formatConfidence, loadStoredPrediction } from "../utils/predictionUtils";
import "../styles/ResultPage.css";

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [prediction, setPrediction] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    setPrediction(loadStoredPrediction());
  }, []);

  const handleClear = () => {
    localStorage.removeItem("predictionResult");
    sessionStorage.removeItem("scanningReportGenerated");
    setPrediction(null);
    navigate("/result", { replace: true, state: {} });
  };

  const handleReportClick = (event) => {
    if (!prediction) {
      event.preventDefault();
      window.alert("Please upload the medical image and click the scanning report button.");
    }
  };

  const handleDoctorClick = (event) => {
    if (!prediction) {
      event.preventDefault();
      window.alert("Upload the medical image and generate the scanning report then only it generates the doctor details.");
      return;
    }

    if (sessionStorage.getItem("scanningReportGenerated") !== "true") {
      event.preventDefault();
      window.alert("Upload the medical image and generate the scanning report then only it generates the doctor details.");
    }
  };

  const confidence = formatConfidence(prediction?.confidence ?? 0);
  const diseaseName = prediction?.prediction || "No prediction yet";
  
  // Get modality and format display name
  const modality = prediction?.modality || "unknown";
  const getModalityDisplay = (mod) => {
    switch(mod) {
      case "xray": return "X-ray Image";
      case "symptom": return "Symptom Analysis";
      case "hybrid": return "Hybrid (Image + Symptoms)";
      default: return "AI Model";
    }
  };
  const modalityName = getModalityDisplay(modality);
  
  const timestamp = prediction?.timestamp ? new Date(prediction.timestamp) : null;
  const topPredictions = Array.isArray(prediction?.topPredictions) ? prediction.topPredictions : [];
  const uploadedImage = location.state?.uploadedImage || "";
  const gradcamRaw = prediction?.gradcam || "";
  const gradcamSrc = gradcamRaw.startsWith("data:image")
    ? gradcamRaw
    : gradcamRaw
      ? `data:image/png;base64,${gradcamRaw}`
      : "";

  return (
    <main className="section-padding bg-soft">
      <div className="container">
        <div className="section-heading text-center">
          <span className="eyebrow">Prediction Overview</span>
          <h1 className="mb-3">Automated disease prediction summary</h1>
          <p className="text-muted">
            Results generated from the most recent upload. All insights remain stored locally in your browser until cleared.
          </p>
        </div>

        <div className="row g-4 mb-4">
          <div className="col-lg-6">
            <div className="result-card" id="predictionSummary">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <p className="text-muted mb-0">Predicted disease</p>
                <div className="d-flex gap-2">
                  {prediction && <span className="badge bg-info-subtle text-info">{modalityName} model</span>}
                  <span className="badge bg-primary-subtle text-primary" id="timestampBadge">
                    {timestamp ? `Updated ${timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting data"}
                  </span>
                </div>
              </div>
              <h2 className="fw-bold mb-3" id="predictedDisease">{diseaseName}</h2>
              <div className="confidence-wrap">
                <div className="d-flex justify-content-between mb-1">
                  <p className="text-muted mb-0">Confidence</p>
                  <p className="fw-semibold mb-0" id="confidenceValue">
                    {confidence.toFixed(2)}%
                  </p>
                </div>
                <div className="progress" aria-label="Model confidence" aria-valuemin="0" aria-valuemax="100">
                  <div className="progress-bar" id="confidenceBar" style={{ width: `${confidence}%` }} />
                </div>
              </div>
              {!!topPredictions.length && (
                <div className="mt-3">
                  <p className="text-muted small mb-1">Top class probabilities</p>
                  <ul className="list-unstyled small mb-0">
                    {topPredictions.map((item) => (
                      <li key={item.label} className="d-flex justify-content-between">
                        <span>{item.label}</span>
                        <span>{formatConfidence(item.confidence).toFixed(2)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 d-flex flex-wrap gap-3">
                <Link className="btn btn-primary" to="/upload">
                  <i className="fa-solid fa-arrow-rotate-right me-2" />
                  Start New Prediction
                </Link>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="result-card">
              <h5 className="mb-3">Clinical summary</h5>
              <p className="text-muted" id="clinicalSummary">
                {prediction
                  ? modality === "xray"
                    ? `${diseaseName} detected via X-ray analysis with ${confidence.toFixed(2)}% confidence. Review the Grad-CAM heatmap below to understand which regions influenced the prediction.`
                    : modality === "symptom"
                    ? `Based on provided symptoms, ${diseaseName} is predicted with ${confidence.toFixed(2)}% confidence. Consider confirming with medical imaging for complete clinical assessment.`
                    : `Hybrid analysis predicts ${diseaseName} with ${confidence.toFixed(2)}% confidence, combining both X-ray imaging and symptom analysis.`
                  : "Provide either a chest X-ray image or symptom information to view automated disease prediction, model confidence, and explainability details."}
              </p>
              <ul className="list-unstyled small mb-0" id="insightList">
                {prediction ? (
                  modality === "xray" ? (
                    <>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Grad-CAM highlights the dominant regions contributing to the {diseaseName} prediction.
                      </li>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Confidence reflects probability calibration against validation cohorts.
                      </li>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Share this summary with specialists for rapid second opinions.
                      </li>
                    </>
                  ) : modality === "symptom" ? (
                    <>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Prediction based on natural language processing of provided symptoms.
                      </li>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Medical imaging (X-ray) is recommended for clinical confirmation.
                      </li>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Consult with healthcare professionals for definitive diagnosis.
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Analysis combines X-ray imaging and symptom analysis for enhanced accuracy.
                      </li>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Grad-CAM visualization highlights key imaging regions.
                      </li>
                      <li>
                        <i className="fa-solid fa-circle-dot me-2 text-primary" />
                        Multiple data sources provide comprehensive clinical support.
                      </li>
                    </>
                  )
                ) : (
                  <>
                    <li>
                      <i className="fa-solid fa-circle-dot me-2 text-primary" />
                      Upload a chest X-ray or enter symptom descriptions to begin analysis.
                    </li>
                    <li>
                      <i className="fa-solid fa-circle-dot me-2 text-primary" />
                      Results will be displayed with confidence scores and explainability information.
                    </li>
                    <li>
                      <i className="fa-solid fa-circle-dot me-2 text-primary" />
                      All predictions should be validated by qualified medical professionals.
                    </li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="row g-4 mb-5">
          {(modality === "xray" || modality === "hybrid") && (
            <>
              <div className="col-lg-6">
                <div className="image-card">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="mb-0">Uploaded Image</h6>
                    <span className="badge bg-light text-dark">Original View</span>
                  </div>
                  <div className={`image-frame ${uploadedImage ? "has-image" : ""}`}>
                    {uploadedImage ? (
                      <img id="uploadedImagePreview" src={uploadedImage} alt="Uploaded medical study preview" />
                    ) : (
                      <p className="placeholder-text">Upload an image to view it here.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="image-card">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="mb-0">Grad-CAM Heatmap</h6>
                    <span className="badge bg-warning-subtle text-warning">Explainability</span>
                  </div>
                  <div className={`image-frame ${gradcamSrc ? "has-image" : ""}`}>
                    {gradcamSrc ? (
                      <img id="gradcamPreview" src={gradcamSrc} alt="Grad-CAM heatmap preview" />
                    ) : (
                      <p className="placeholder-text">Grad-CAM visualization will appear if provided by the API.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          {(modality === "symptom" || modality === "hybrid") && (
            <div className={modality === "symptom" ? "col-lg-12" : "col-lg-6"}>
              <div className="image-card">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="mb-0">Symptom Analysis</h6>
                  <span className="badge bg-info-subtle text-info">Clinical Input</span>
                </div>
                <div className="symptom-info">
                  <p className="text-muted mb-2">
                    <strong>Symptoms provided:</strong>
                  </p>
                  <p className="mb-0" style={{ 
                    padding: "12px", 
                    backgroundColor: "rgba(0, 123, 255, 0.05)", 
                    borderRadius: "4px",
                    fontStyle: "italic",
                    color: "#333"
                  }}>
                    {prediction?.symptomText || "No symptom text recorded"}
                  </p>
                  {prediction?.symptomPrediction && (
                    <div className="mt-3">
                      <p className="text-muted small mb-1">
                        <strong>Symptom Model Prediction:</strong>
                      </p>
                      <p className="mb-0 fw-semibold">
                        {prediction.symptomPrediction}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="text-center">
          <div className="d-flex flex-wrap justify-content-center gap-3">
            <Link className="btn btn-success btn-lg" to="/scanning-report" onClick={handleReportClick}>
              <i className="fa-solid fa-file-medical me-2" />
              Scanning Report
            </Link>
            <Link
              className="btn btn-outline-secondary btn-lg result-find-doctor-btn"
              to="/doctor-details"
              state={{ prediction }}
              onClick={handleDoctorClick}
            >
              <i className="fa-solid fa-user-doctor me-2" />
              Find Doctor
            </Link>
          </div>
          <div className="mt-3">
            <button className="btn btn-outline-danger btn-lg result-reset-footer-btn" type="button" onClick={handleClear}>
              <i className="fa-solid fa-arrows-rotate me-2" />
              Reset Prediction, Report and Doctors
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
