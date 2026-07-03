import { Link } from "react-router-dom";
import "../styles/uploadPage.css";

export default function UploadPage() {
  return (
    <main className="pt-5 pb-5 analysis-hub-page">
      <div className="container analysis-hub-content">
        <div className="analysis-hub-head text-center mx-auto">
          <h1 className="mb-3">Upload Chest X-ray Image</h1>
          <p className="text-muted mb-0">
            Continue to the chest X-ray workflow for upload validation, disease prediction, Grad-CAM visualization, and report generation.
          </p>
        </div>

        <div className="row g-4 mt-2 justify-content-center">
          <div className="col-lg-8">
            <Link className="analysis-option-card chest" to="/upload/chest">
              <div className="analysis-option-icon">
                <i className="fa-solid fa-lungs" />
              </div>
              <div>
                <p className="analysis-option-kicker mb-2">Pulmonology</p>
                <h3 className="analysis-option-title mb-2">Chest X-ray Analysis</h3>
                <p className="analysis-option-copy mb-0">
                  Upload a chest radiograph to identify Pneumonia, Tuberculosis, or Normal findings with AI-assisted review.
                </p>
              </div>
              <span className="analysis-option-cta">
                Open Workflow
                <i className="fa-solid fa-arrow-right" />
              </span>
            </Link>
          </div>
        </div>
      </div>
      <footer className="upload-footer">
        © 2026 Intelligent Healthcare Assistant. Designed for responsible AI diagnostics.
      </footer>
    </main>
  );
}
