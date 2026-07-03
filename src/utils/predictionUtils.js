export function formatConfidence(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  let numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return 0;
  }
  if (numericValue <= 1) {
    numericValue *= 100;
  }
  const bounded = Math.min(100, Math.max(0, numericValue));
  return Number.parseFloat(bounded.toFixed(2));
}

export function buildDiseaseInsights(name) {
  const diseaseName = name && name !== "Unknown Condition" ? name : "the detected condition";
  return {
    characteristics: `${diseaseName} commonly manifests with unique imaging signatures surfaced through Grad-CAM overlays for rapid validation.`,
    symptoms: `Clinical presentations linked to ${diseaseName} often include respiratory stress, inflammatory markers, or localized discomfort depending on patient history.`,
    treatment: `Discuss pharmacological therapy, supportive care, and potential interventions for ${diseaseName} with the attending physician before acting.`,
    prevention: `Reinforce lifestyle guidance, vaccination schedules, and screening cadence that reduce the likelihood of ${diseaseName} recurrence.`,
    advice: `Escalate complex cases to specialists, capture follow-up imaging, and document how ${diseaseName} progresses across care milestones.`,
  };
}

export function loadStoredPrediction() {
  const stored = localStorage.getItem("predictionResult");
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.error("Unable to parse stored prediction", error);
    return null;
  }
}

export function persistPrediction(payload) {
  const safePayload = { ...(payload || {}) };
  delete safePayload.uploadedImage;

  sessionStorage.removeItem("scanningReportGenerated");

  try {
    localStorage.setItem("predictionResult", JSON.stringify(safePayload));
  } catch (error) {
    const minimalPayload = {
      prediction: safePayload.prediction || "Unknown Condition",
      confidence: safePayload.confidence || 0,
      modality: safePayload.modality || "xray",
      timestamp: safePayload.timestamp || new Date().toISOString(),
    };
    localStorage.setItem("predictionResult", JSON.stringify(minimalPayload));
  }
}
