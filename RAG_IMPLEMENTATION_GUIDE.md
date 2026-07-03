# RAG Implementation Guide for Disease Information Fetching

## Overview
RAG (Retrieval-Augmented Generation) will fetch real disease information from a knowledge base and generate accurate content dynamically instead of using generic templates.

## Architecture

```
React Frontend (ScanningReportPage)
    ↓
Flask Backend (/api/disease-info or /api/generate-insights)
    ↓
Vector Database (ChromaDB) - stores embeddings of disease knowledge
    ↓
Embedding Model (HuggingFace/OpenAI) - converts disease name to vector
    ↓
Retrieved Documents + Disease Name
    ↓
LLM (LLaMA/GPT-3.5) - generates comprehensive insights
    ↓
Return formatted response to Frontend
```

## Step 1: Add RAG Dependencies

Update `backend/requirements.txt`:

```txt
flask>=3.0.0
flask-cors>=4.0.0
tensorflow>=2.15.0
pillow>=10.0.0
numpy>=1.26.0
chromadb>=0.5.0
langchain>=0.1.0
langchain-community>=0.1.0
langchain-huggingface>=0.0.0
sentence-transformers>=2.2.0
```

Install:
```bash
cd backend
pip install -r requirements.txt
```

## Step 2: Create Knowledge Base File

Create `backend/knowledge_base/disease_database.json`:

```json
{
  "tuberculosis": {
    "characteristics": "Mycobacterium tuberculosis infection causing pulmonary inflammation with characteristic cavitary lesions visible on chest X-ray. Affects upper lobes predominantly.",
    "symptoms": "Chronic cough (>3 weeks), hemoptysis, night sweats, fever, weight loss, chest pain. Progressive dyspnea in advanced stages.",
    "treatment": "Standard 6-month RIPE regimen (Rifampicin, Isoniazid, Pyrazinamide, Ethambutol) with directly observed therapy. Drug susceptibility testing essential.",
    "prevention": "PPD skin testing, prophylactic INH for contacts, BCG vaccination, airborne isolation during infectious period.",
    "advice": "Refer to TB specialist. Ensure treatment adherence. Monitor for drug side effects (hepatotoxicity, neuropathy). Repeat CXR at 2-3 months."
  },
  "pneumonia": {
    "characteristics": "Lobar consolidation with air bronchograms visible on chest X-ray. Community-acquired or hospital-acquired based on onset timing.",
    "symptoms": "Cough with purulent sputum, pleuritic chest pain, dyspnea, fever. May progress to respiratory failure.",
    "treatment": "Empiric antibiotics (beta-lactam + macrolide) pending culture. De-escalate based on organism susceptibility.",
    "prevention": "Pneumococcal vaccine (PCV, PPSV23), annual influenza vaccination, smoking cessation.",
    "advice": "Assess severity (CURB-65). Monitor oxygenation. Consider ICU admission if SaO2 <90% or RR >30. Follow-up CXR at 4-6 weeks."
  },
  "age-related macular degeneration": {
    "characteristics": "Drusen and retinal pigment epithelium changes in macula. Dry form shows gradual photoreceptor loss; wet form shows choroidal neovascularization.",
    "symptoms": "Blurred central vision, metamorphopsia (wavy lines), scotoma. Sudden vision loss suggests wet AMD.",
    "treatment": "Dry AMD: antioxidant vitamins (AREDS2), amsler grid monitoring. Wet AMD: anti-VEGF intravitreal injections (bevacizumab, ranibizumab).",
    "prevention": "Omega-3 supplementation, UV protection, smoking cessation, blood pressure control, antioxidant-rich diet.",
    "advice": "Urgent OCT and angiography if sudden vision change. Monthly monitoring during anti-VEGF therapy. Low-vision aids if advanced."
  },
  "diabetic retinopathy": {
    "characteristics": "Progressive microvascular disease with microaneurysms, dot-blot hemorrhages, hard exudates, cotton-wool spots. May progress to neovascularization.",
    "symptoms": "Often asymptomatic in early stages. Floaters, blurred vision, vision loss in advanced proliferative disease.",
    "treatment": "Non-proliferative: tight glucose and BP control. Proliferative: pan-retinal photocoagulation (PRP) or anti-VEGF injections.",
    "prevention": "HbA1c <7%, BP <130/80, annual dilated fundus exams, strict glycemic control from diagnosis.",
    "advice": "Refer to retinal specialist if moderate/severe NPDR or any PDR. Anti-VEGF therapy first-line for macular edema."
  },
  "normal": {
    "characteristics": "Healthy retinal architecture with intact photoreceptor layer, macula cupping <0.6, healthy optic nerve coloration and margins.",
    "symptoms": "None. Normal visual acuity and color vision.",
    "treatment": "No treatment needed. Continue routine eye care and annual exams.",
    "prevention": "Maintain healthy lifestyle, UV protection, regular eye exams, manage systemic diseases.",
    "advice": "Continue annual screening. Educate on signs of change. Encourage preventive measures."
  }
}
```

## Step 3: Create RAG Backend Endpoint

Create `backend/rag_engine.py`:

```python
"""RAG engine for disease information retrieval and generation."""
import json
import os
from pathlib import Path
from typing import Optional

try:
    import chromadb
    from langchain_huggingface import HuggingFaceEmbeddings
    from langchain.text_splitter import CharacterTextSplitter
    HAS_RAG = True
except ImportError:
    HAS_RAG = False


class DiseaseRAGEngine:
    """Retrieval-Augmented Generation for disease information."""

    def __init__(self, knowledge_base_path: str = "knowledge_base/disease_database.json"):
        self.kb_path = Path(knowledge_base_path)
        self.chroma_client = None
        self.collection = None
        self.embedder = None
        self.knowledge_base = {}
        
        if HAS_RAG:
            self._initialize_rag()
        else:
            self._load_knowledge_base()

    def _load_knowledge_base(self):
        """Load disease database from JSON file."""
        if self.kb_path.exists():
            with open(self.kb_path, "r", encoding="utf-8") as f:
                self.knowledge_base = json.load(f)

    def _initialize_rag(self):
        """Initialize ChromaDB and embeddings."""
        try:
            # Load knowledge base
            self._load_knowledge_base()
            
            # Initialize embedder
            self.embedder = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )
            
            # Initialize ChromaDB
            self.chroma_client = chromadb.Client()
            
            # Create or get collection
            collection_name = "disease_info"
            try:
                self.collection = self.chroma_client.get_collection(collection_name)
            except Exception:
                self.collection = self.chroma_client.create_collection(collection_name)
                self._populate_collection()
                
        except Exception as e:
            print(f"RAG initialization error: {e}. Falling back to static knowledge base.")
            HAS_RAG = False

    def _populate_collection(self):
        """Add disease documents to ChromaDB."""
        if not self.collection or not self.knowledge_base:
            return
            
        for disease_name, info in self.knowledge_base.items():
            # Combine all information into a single document
            document_text = f"""
            Disease: {disease_name}
            Characteristics: {info.get('characteristics', '')}
            Symptoms: {info.get('symptoms', '')}
            Treatment: {info.get('treatment', '')}
            Prevention: {info.get('prevention', '')}
            Clinical Advice: {info.get('advice', '')}
            """
            
            try:
                self.collection.add(
                    documents=[document_text],
                    metadatas=[{"disease": disease_name}],
                    ids=[disease_name]
                )
            except Exception as e:
                print(f"Error adding {disease_name} to collection: {e}")

    def retrieve_disease_info(self, disease_name: str, n_results: int = 1) -> dict:
        """
        Retrieve disease information using RAG or fallback to static data.
        
        Args:
            disease_name: Name of the disease to retrieve
            n_results: Number of retrieval results
            
        Returns:
            Dictionary with disease information
        """
        # Normalize disease name
        normalized_name = disease_name.lower().strip()
        
        # Try RAG retrieval first
        if HAS_RAG and self.collection:
            try:
                results = self.collection.query(
                    query_texts=[normalized_name],
                    n_results=n_results
                )
                
                if results and results.get("metadatas"):
                    retrieved_disease = results["metadatas"][0][0].get("disease")
                    if retrieved_disease in self.knowledge_base:
                        return self.knowledge_base[retrieved_disease]
            except Exception as e:
                print(f"RAG retrieval error: {e}")
        
        # Fallback to static knowledge base
        if normalized_name in self.knowledge_base:
            return self.knowledge_base[normalized_name]
        
        # If disease not found, return generic response
        return self._generate_generic_response(disease_name)

    def _generate_generic_response(self, disease_name: str) -> dict:
        """Generate generic response for unknown diseases."""
        return {
            "characteristics": f"{disease_name} is a medical condition that presents with specific imaging and clinical features.",
            "symptoms": f"Symptoms associated with {disease_name} vary based on disease severity and patient factors.",
            "treatment": f"Treatment for {disease_name} should be determined by qualified medical professionals.",
            "prevention": f"Prevention strategies for {disease_name} depend on disease etiology.",
            "advice": f"Consult with specialists for comprehensive evaluation and management of {disease_name}."
        }

    def get_all_diseases(self) -> list:
        """Get list of all available diseases in knowledge base."""
        return list(self.knowledge_base.keys())


# Initialize global RAG engine
rag_engine = None

def init_rag_engine(knowledge_base_path: str = "knowledge_base/disease_database.json"):
    """Initialize RAG engine on startup."""
    global rag_engine
    rag_engine = DiseaseRAGEngine(knowledge_base_path)
    return rag_engine
```

## Step 4: Add Endpoint to Flask App

Add to `backend/app.py`:

```python
from rag_engine import init_rag_engine, rag_engine

# Initialize RAG engine when app starts
@app.before_request
def setup_rag():
    global rag_engine
    if rag_engine is None:
        init_rag_engine()

# New endpoint for disease information
@app.route("/api/disease-info", methods=["POST"])
def get_disease_info():
    """Retrieve disease information using RAG."""
    try:
        data = request.json
        disease_name = data.get("disease", "")
        modality = data.get("modality", "xray")
        
        if not disease_name:
            return jsonify({"error": "Disease name required"}), 400
        
        # Retrieve from RAG engine
        info = rag_engine.retrieve_disease_info(disease_name)
        
        return jsonify({
            "success": True,
            "disease": disease_name,
            "modality": modality,
            "information": info
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to list available diseases
@app.route("/api/diseases", methods=["GET"])
def list_diseases():
    """List all available diseases in knowledge base."""
    try:
        diseases = rag_engine.get_all_diseases()
        return jsonify({"diseases": diseases})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
```

## Step 5: Update Frontend to Use RAG

Create new utility `src/utils/diseaseInfoService.js`:

```javascript
import { API_ENDPOINT } from "./constants";

export async function fetchDiseaseInfoFromRAG(diseaseName, modality = "retina") {
  try {
    // Use the Flask backend RAG endpoint
    const diseaseApiUrl = API_ENDPOINT.replace("/predict", "/api/disease-info");
    
    const response = await fetch(diseaseApiUrl, {
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
      throw new Error("Failed to fetch disease information");
    }

    const data = await response.json();
    
    if (data.success) {
      return data.information;
    } else {
      throw new Error(data.error || "Unknown error");
    }
  } catch (error) {
    console.error("RAG fetch error:", error);
    return null;
  }
}
```

## Step 6: Update ScanningReportPage to Use RAG

Update `src/pages/ScanningReportPage.jsx`:

```javascript
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buildDiseaseInsights, formatConfidence, loadStoredPrediction } from "../utils/predictionUtils";
import { fetchDiseaseInfoFromRAG } from "../utils/diseaseInfoService";

export default function ScanningReportPage() {
  const [prediction, setPrediction] = useState(null);
  const [diseaseInfo, setDiseaseInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const storedPrediction = loadStoredPrediction();
    setPrediction(storedPrediction);
    
    // Fetch disease info from RAG when prediction is loaded
    if (storedPrediction?.prediction) {
      fetchDiseasInfoFromRAG(storedPrediction.prediction, storedPrediction.modality);
    }
  }, []);

  const fetchDiseasInfoFromRAG = async (diseaseName, modality) => {
    setLoadingInfo(true);
    try {
      const info = await fetchDiseaseInfoFromRAG(diseaseName, modality);
      if (info) {
        setDiseaseInfo(info);
      }
    } catch (error) {
      console.error("Error fetching disease info:", error);
    } finally {
      setLoadingInfo(false);
    }
  };

  const confidence = formatConfidence(prediction?.confidence ?? 0);
  const diseaseName = prediction?.prediction || "No prediction yet";
  const modalityName = prediction?.modality === "retina" ? "Retina" : "X-ray";
  const timestamp = prediction?.timestamp ? new Date(prediction.timestamp) : null;

  // Use RAG info if available, fallback to generic insights
  const insights = useMemo(() => {
    if (diseaseInfo) {
      return {
        characteristics: diseaseInfo.characteristics || "",
        symptoms: diseaseInfo.symptoms || "",
        treatment: diseaseInfo.treatment || "",
        prevention: diseaseInfo.prevention || "",
        advice: diseaseInfo.advice || "",
      };
    }
    return buildDiseaseInsights(diseaseName);
  }, [diseaseInfo, diseaseName]);

  // ... rest of the component stays the same
}
```

## Step 7: Test the Integration

```bash
# Navigate to backend directory
cd backend

# Create knowledge base directory
mkdir -p knowledge_base

# Run Flask with RAG enabled
python app.py
```

Test the endpoint:
```bash
curl -X POST http://localhost:5000/api/disease-info \
  -H "Content-Type: application/json" \
  -d '{"disease": "tuberculosis", "modality": "xray"}'
```

## Deployment Options

### Option 1: Lightweight (Recommended for your setup)
- ChromaDB (in-memory or persistent local)
- HuggingFace embeddings (all-MiniLM model - 22MB)
- Static knowledge base + simple retrieval

### Option 2: Advanced
- ChromaDB Distributed
- OpenAI API for embeddings
- Add LLM (GPT-3.5) for generating insights from retrieved context
- Would need API key in `backend/.env`

### Option 3: Production
- Pinecone or Weaviate vector DB
- Professional LangChain setup
- Monitoring and caching with Redis

## Troubleshooting

**Issue**: "chromadb not found" error
- Solution: `pip install chromadb langchain-community langchain-huggingface`

**Issue**: First query takes 20+ seconds
- Solution: First query downloads embedding model (~400MB). Subsequent queries are fast.

**Issue**: Disease not found
- Solution: Expand `disease_database.json` with more diseases or check spelling

## Next Steps

1. ✅ Add more diseases to `disease_database.json`
2. ✅ Add vector DB persistence to `backend/.env`
3. ✅ Integrate LLM for natural language generation
4. ✅ Add user feedback to refine retrieved information
5. ✅ Cache results for frequently queried diseases

