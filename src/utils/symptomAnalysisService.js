const API_BASE_URL = "http://localhost:5000";

export async function extractSymptomTextFromFile(file) {
  if (!file) {
    return { text: "", filename: "" };
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/extract-symptom-text`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to extract text from file");
  }

  const data = await response.json();
  return {
    text: data.text || "",
    filename: data.filename || file.name || "",
  };
}

export async function predictHybridDisease({ imageFile, symptomsText, symptomFile }) {
  const trimmedSymptomsText = symptomsText?.trim() || "";

  if (!imageFile && !trimmedSymptomsText && !symptomFile) {
    throw new Error("Please provide either symptoms, an image, or both before starting analysis.");
  }

  const formData = new FormData();
  if (imageFile) {
    formData.append("image", imageFile);
  }
  
  // DEBUG: Log what's being added to FormData
  const debugInfo = {
    hasImage: !!imageFile,
    symptomsText,
    symptomTextLength: trimmedSymptomsText.length,
    hasSymptomsFile: !!symptomFile,
  };
  console.log("DEBUG predictHybridDisease.formData:", debugInfo);
  
  if (trimmedSymptomsText) {
    formData.append("symptoms_text", trimmedSymptomsText);
    console.log("DEBUG: Appended symptoms_text to FormData:", trimmedSymptomsText);
  } else {
    console.log("DEBUG: symptoms_text is empty or falsy. Not appending.", { symptomsText });
  }
  
  if (symptomFile) {
    formData.append("symptom_file", symptomFile);
  }

  const response = await fetch(`${API_BASE_URL}/predict_hybrid`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Prediction failed with status ${response.status}`);
  }

  return response.json();
}