const CHEST_SPECIALIZATIONS = [
  "pulmonologist",
  "chest physician",
  "respiratory medicine",
  "internal medicine",
  "infectious disease specialist",
  "general physician",
];

const CHEST_KEYWORDS = [
  "pneumonia",
  "tuberculosis",
  "tb",
  "lung",
  "respiratory",
  "chest",
  "x-ray",
  "copd",
  "infection",
];

const normalize = (value) => String(value || "").toLowerCase().trim();

export function getRecommendedSpecializations(prediction = {}) {
  const diseaseName = normalize(prediction.prediction);

  if (normalize(prediction.modality) === "xray" || normalize(prediction.modality) === "x-ray") {
    return CHEST_SPECIALIZATIONS;
  }

  if (CHEST_KEYWORDS.some((keyword) => diseaseName.includes(keyword))) {
    return CHEST_SPECIALIZATIONS;
  }

  return CHEST_SPECIALIZATIONS;
}

export function doctorMatchesPrediction(doctor = {}, prediction = {}) {
  const recommendedSpecializations = getRecommendedSpecializations(prediction);
  const specialization = normalize(doctor.specialization);
  const bio = normalize(doctor.bio);
  const hospital = normalize(doctor.hospitalName || doctor.hospital);
  const availability = normalize(doctor.availability);
  const searchText = `${specialization} ${bio} ${hospital} ${availability}`;

  return recommendedSpecializations.some((target) => searchText.includes(normalize(target)));
}

export function scoreDoctorMatch(doctor = {}, prediction = {}) {
  const diseaseName = normalize(prediction.prediction);
  const specialization = normalize(doctor.specialization);
  const bio = normalize(doctor.bio);
  const combinedText = `${specialization} ${bio}`;

  let score = 0;
  getRecommendedSpecializations(prediction).forEach((target) => {
    if (combinedText.includes(normalize(target))) {
      score += 3;
    }
  });

  CHEST_KEYWORDS.forEach((keyword) => {
    if (diseaseName.includes(keyword) && combinedText.includes(keyword)) {
      score += 1;
    }
  });

  return score;
}
