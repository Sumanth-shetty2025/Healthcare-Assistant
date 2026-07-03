// Disease information service for frontend RAG integration

// Configuration
const API_BASE_URL = "http://localhost:5000";
const DISEASE_INFO_ENDPOINT = `${API_BASE_URL}/api/disease-info`;
const LIST_DISEASES_ENDPOINT = `${API_BASE_URL}/api/diseases`;
const SECTION_DETAIL_ENDPOINT = `${API_BASE_URL}/api/disease-section-detail`;

/**
 * Fetch disease information from RAG backend endpoint.
 * 
 * @param {string} diseaseName - Disease name to retrieve information for
 * @param {string} modality - "xray" (optional, for context)
 * @returns {Promise<Object|null>} Disease information or null if fetch fails
 */
export async function fetchDiseaseInfoFromRAG(diseaseName, modality = "xray") {
  try {
    const response = await fetch(DISEASE_INFO_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        disease: diseaseName,
        modality: modality,
      }),
    });

    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    if (data.success && data.information) {
      console.log(`✓ Retrieved disease info for: ${diseaseName}`);
      return data.information;
    } else {
      console.warn(`Failed to retrieve info: ${data.error || "Unknown error"}`);
      return null;
    }
  } catch (error) {
    console.error(`RAG fetch error: ${error.message}`);
    // Return null and let the component fallback to static info
    return null;
  }
}

/**
 * Fetch list of all available diseases in RAG knowledge base.
 * 
 * @returns {Promise<Array>} Array of disease names, or empty array if fetch fails
 */
export async function listAvailableDiseases() {
  try {
    const response = await fetch(LIST_DISEASES_ENDPOINT);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.diseases || [];
  } catch (error) {
    console.error(`Error fetching disease list: ${error.message}`);
    return [];
  }
}

/**
 * Fetch detailed section content for a scanning report card.
 *
 * @param {string} diseaseName - Disease name to retrieve details for
 * @param {string} section - UI section title (e.g. "Symptoms")
 * @param {string} modality - "xray" (optional)
 * @returns {Promise<Object|null>} Detail payload or null if fetch fails
 */
export async function fetchDiseaseSectionDetail(diseaseName, section, modality = "xray") {
  try {
    const response = await fetch(SECTION_DETAIL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        disease: diseaseName,
        section,
        modality,
      }),
    });

    if (!response.ok) {
      console.error(`Section detail API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data.success && data.detail) {
      return data.detail;
    }

    return null;
  } catch (error) {
    console.error(`Section detail fetch error: ${error.message}`);
    return null;
  }
}
