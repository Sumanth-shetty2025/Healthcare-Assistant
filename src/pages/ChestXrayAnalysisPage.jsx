import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { extractSymptomTextFromFile, predictHybridDisease } from "../utils/symptomAnalysisService";
import { persistPrediction } from "../utils/predictionUtils";
import "../styles/ChestXrayAnalysisPage.css";

const helperList = [
  "For X-ray analysis: Use a properly exposed PA/AP chest radiograph whenever possible.",
  "For symptom analysis: Provide detailed, specific symptom descriptions for better accuracy.",
  "For both: Confirm no personal identifiers are embedded in any uploaded files.",
  "Ensure adequate clinical information is provided for accurate predictions.",
];

export default function ChestXrayAnalysisPage() {
  const navigate = useNavigate();
  const imageInputRef = useRef(null);
  const symptomInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState("");
  const [symptomText, setSymptomText] = useState("");
  const [symptomFile, setSymptomFile] = useState(null);
  const [symptomFileName, setSymptomFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "info" });

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const payload = reader.result?.toString() || "";
      setPreviewSrc(payload);
    };
    reader.readAsDataURL(file);
  };

  const handleSymptomFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSymptomFile(file);
    setSymptomFileName(file.name);

    if (/\.(pdf|txt)$/i.test(file.name)) {
      extractSymptomTextFromFile(file)
        .then(({ text }) => {
          if (text) {
            setSymptomText(text);
            setMessage({ text: "Symptom report text extracted. You can edit it before prediction.", type: "info" });
          }
        })
        .catch(() => {
          setMessage({ text: "Unable to extract text from the uploaded report. You can still type symptoms manually.", type: "warning" });
        });
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewSrc("");
    setSymptomText("");
    setSymptomFile(null);
    setSymptomFileName("");
    setMessage({ text: "", type: "info" });
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    if (symptomInputRef.current) {
      symptomInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Validate: at least one of image or symptoms is required
    if (!selectedFile && !symptomText.trim()) {
      setMessage({ 
        text: "Please provide either a chest X-ray image OR symptom information before starting analysis.", 
        type: "warning" 
      });
      return;
    }

    try {
      setLoading(true);
      
      const analysisType = selectedFile && symptomText.trim() 
        ? "hybrid" 
        : selectedFile 
          ? "X-ray image" 
          : "symptom analysis";
      
      setMessage({ 
        text: `Running ${analysisType} analysis. Please wait...`, 
        type: "info" 
      });
      
      // DEBUG: Log what we're sending
      console.log("DEBUG ChestXrayAnalysisPage.handleSubmit:", {
        symptomsText: symptomText,
        symptomTextLength: symptomText?.length || 0,
        hasSymptomsFile: !!symptomFile,
        hasImageFile: !!selectedFile,
        analysisType,
      });
      
      const data = await predictHybridDisease({
        imageFile: selectedFile,
        symptomsText: symptomText,
        symptomFile,
      });

      const payload = {
        prediction: data?.final_prediction || data?.xray?.prediction || "Unknown Condition",
        confidence: Number.parseFloat(data?.final_confidence ?? data?.xray?.confidence ?? 0) || 0,
        topPredictions: Array.isArray(data?.xray?.top_predictions) ? data.xray.top_predictions : [],
        gradcam: data?.xray?.gradcam || "",
        modality: data?.modality || "hybrid",
        xrayPrediction: data?.xray?.prediction || "",
        symptomPrediction: data?.symptoms?.prediction || "",
        symptomText: data?.symptoms?.text || symptomText,
        generatedReport: data?.generated_report || "",
        timestamp: new Date().toISOString(),
      };

      persistPrediction(payload);
      sessionStorage.setItem("uploadedImage", previewSrc);
      setMessage({ text: "Hybrid analysis complete. Redirecting to results...", type: "success" });
      navigate("/result", { state: { uploadedImage: previewSrc } });
    } catch (error) {
      const networkError = error instanceof TypeError && error.message === "Failed to fetch";
      const errorText = networkError
        ? "Cannot reach the prediction server. Start the backend Flask server and try again."
        : error.message || "Analysis failed. Please try again later.";
      setMessage({ text: errorText, type: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const previewClasses = ["preview-shell", !previewSrc ? "placeholder" : ""].filter(Boolean).join(" ");

  const handleCardMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    event.currentTarget.style.setProperty("--cursor-x", `${x.toFixed(2)}%`);
    event.currentTarget.style.setProperty("--cursor-y", `${y.toFixed(2)}%`);
  };

  const resetCardCursor = (event) => {
    event.currentTarget.style.setProperty("--cursor-x", "50%");
    event.currentTarget.style.setProperty("--cursor-y", "50%");
  };

  return (
    <main className="pt-5 pb-5 analysis-detail-page">
      <div className="container">
        <div className="analysis-detail-head d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <div>
            <span className="eyebrow">Radiology Workflow</span>
            <h1 className="mb-2">Chest X-ray Analysis</h1>
            <p className="text-muted mb-0">
              Upload a chest radiograph for AI-assisted interpretation support. Outputs should be validated alongside clinical context and radiologist review.
            </p>
          </div>
          <Link className="btn analysis-back-btn" to="/upload">
            <i className="fa-solid fa-arrow-left me-2" />
            Back to Upload Chest X-ray Image
          </Link>
        </div>

        <div className="analysis-hero-card mb-4" onMouseMove={handleCardMouseMove} onMouseLeave={resetCardCursor}>
          <div className="row g-4 align-items-center">
            <div className="col-lg-6">
              <h2 className="analysis-hero-title mb-3">AI-powered disease prediction: flexible input analysis</h2>
              <p className="analysis-hero-copy mb-0">
                Analyze diseases using X-ray images, symptom descriptions, or both. The system will adapt the analysis based on your input—providing either image-based predictions, text-based symptom analysis, or a hybrid combination for enhanced accuracy.
              </p>
            </div>
            <div className="col-lg-6">
              <div className="analysis-hero-visual">
                <img src="/assets/samples/X_Ray%20image.jpg" alt="Sample chest X-ray" />
              </div>
            </div>
          </div>
        </div>

        <div className="upload-card" onMouseMove={handleCardMouseMove} onMouseLeave={resetCardCursor}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0">Analysis Input</h5>
            <span className="badge bg-primary-subtle text-primary">
              <i className="fa-solid fa-lock me-2" />
              Secure Channel
            </span>
          </div>
          <p className="text-muted mb-3"><em>Provide at least one input: a chest X-ray image, symptom descriptions, or both for hybrid analysis.</em></p>

          <form className="needs-validation" onSubmit={handleSubmit} onReset={handleReset} noValidate>
            <div className="row g-4 mb-4">
              <div className="col-lg-6">
                <div className="hybrid-input-panel p-3 rounded-4 h-100">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="mb-0">Symptoms Input</h6>
                    <span className="badge bg-info-subtle text-info">Optional</span>
                  </div>
                  <p className="small text-muted mb-3">Type symptoms manually or upload a PDF/TXT medical report. The extracted text can be edited before prediction.</p>
                  <textarea
                    className="form-control analysis-textarea"
                    rows="8"
                    value={symptomText}
                    onChange={(event) => setSymptomText(event.target.value)}
                    placeholder="Example: fever, cough, chest pain, shortness of breath, fatigue..."
                  />
                  <div className="mt-3">
                    <label className="form-label fw-semibold analysis-upload-label" htmlFor="symptomUpload">
                      Upload symptom / report file
                    </label>
                    <input
                      ref={symptomInputRef}
                      className="form-control analysis-file-input"
                      type="file"
                      id="symptomUpload"
                      accept=".pdf,.txt"
                      onChange={handleSymptomFileChange}
                    />
                    <div className="form-text analysis-help-text">Accepted: TXT or PDF symptom report. Extracted text will appear above.</div>
                    {symptomFileName && <div className="small mt-2 text-primary">Selected file: {symptomFileName}</div>}
                  </div>
                </div>
              </div>

              <div className="col-lg-6">
                <div className="hybrid-input-panel p-3 rounded-4 h-100">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="mb-0">Chest X-ray Upload</h6>
                    <span className="badge bg-success-subtle text-success">Optional</span>
                  </div>
                  <p className="small text-muted mb-3">Upload a chest X-ray image and preview it before analysis.</p>
                  <label className="form-label fw-semibold analysis-upload-label" htmlFor="xrayUpload">
                    Select chest X-ray image
                  </label>
                  <input
                    ref={imageInputRef}
                    className="form-control analysis-file-input"
                    type="file"
                    id="xrayUpload"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <div className="form-text analysis-help-text">Accepted: chest X-ray image (PNG, JPG, JPEG, TIFF; max 25MB).</div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div id="previewWrapper" className={`${previewClasses} mb-4`}>
                {previewSrc && <img id="imagePreview" src={previewSrc} alt="Chest X-ray preview" />}
                {!previewSrc && (
                  <div className="placeholder-copy">
                    <i className="fa-solid fa-images" />
                    <p className="mb-0">Chest X-ray preview will appear here after selection</p>
                  </div>
                )}
              </div>
            </div>

            <div className="d-flex flex-wrap gap-3">
              <button className="btn btn-primary" type="submit" disabled={loading}>
                <i className="fa-solid fa-lungs me-2" />
                Analyze
              </button>
              <button className="btn btn-outline-secondary" type="reset" disabled={loading}>
                <i className="fa-solid fa-rotate-left me-2" />
                Reset Form
              </button>
            </div>

            {loading && (
              <div id="loadingIndicator" className="loading-indicator" aria-live="polite">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mb-0">Analyzing chest radiograph patterns. This may take a few seconds</p>
              </div>
            )}

            {message.text && (
              <div id="formMessage" className={`alert mt-3 alert-${message.type}`} role="alert">
                {message.text}
              </div>
            )}
          </form>

          <div className="border-top pt-3 mt-4">
            <p className="fw-semibold mb-2">Analysis input checklist</p>
            <ul className="list-unstyled small mb-0">
              {helperList.map((item) => (
                <li key={item}>
                  <i className="fa-solid fa-circle-dot me-2 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
