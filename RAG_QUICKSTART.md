# RAG Quick Start Guide

## What is RAG?
**RAG (Retrieval-Augmented Generation)** combines:
1. **Retrieval**: Search a knowledge base for relevant disease information
2. **Augmentation**: Use retrieved data to fill in context
3. **Generation**: Create accurate, contextual insights for your predictions

Instead of hardcoded text, your app now dynamically fetches real medical information!

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Install RAG Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- `chromadb` - Vector database for fast similarity search
- `langchain` - Framework for RAG pipelines
- `sentence-transformers` - Converts disease names to embeddings

**Note**: First run downloads ~400MB embedding model (happens once)

### Step 2: Start Flask Backend with RAG

```bash
cd backend
python app.py
```

Expected output:
```
✓ Loaded 8 diseases from knowledge base
✓ RAG engine initialized with ChromaDB
 * Running on http://0.0.0.0:5000
```

### Step 3: Test RAG Endpoint

```bash
curl -X POST http://localhost:5000/api/disease-info \
  -H "Content-Type: application/json" \
  -d '{"disease": "tuberculosis", "modality": "xray"}'
```

Response:
```json
{
  "success": true,
  "disease": "tuberculosis",
  "information": {
    "characteristics": "Mycobacterium tuberculosis infection...",
    "symptoms": "Chronic productive cough lasting >3 weeks...",
    "treatment": "Standard 6-month regimen: RIPE...",
    "prevention": "TST screening, prophylactic INH...",
    "advice": "Urgent referral to TB specialist..."
  }
}
```

### Step 4: Start React Frontend

```bash
npm start
```

Your Scanning Report page now fetches real disease information!

---

## 📊 How It Works in Your App

### Flow Diagram

```
User uploads image
    ↓
Model predicts disease (e.g., "tuberculosis")
    ↓
ScanningReportPage loads
    ↓
Calls fetchDiseaseInfoFromRAG("tuberculosis")
    ↓
Backend RAG Engine:
  1. Converts "tuberculosis" → embedding vector
  2. Searches ChromaDB for similar disease documents
  3. Retrieves matching knowledge base entry
  4. Returns formatted information
    ↓
Frontend displays rich, accurate disease information
```

---

## 🔧 Architecture

### Knowledge Base: `backend/knowledge_base/disease_database.json`

```json
{
  "tuberculosis": {
    "characteristics": "...",
    "symptoms": "...",
    "treatment": "...",
    "prevention": "...",
    "advice": "..."
  },
  "pneumonia": { ... },
  "normal": { ... }
}
```

### Backend: RAG Engine (`backend/rag_engine.py`)

```python
engine = DiseaseRAGEngine("knowledge_base/disease_database.json")

# Fast vector similarity search
info = engine.retrieve_disease_info("tuberculosis")
# Returns: { characteristics, symptoms, treatment, prevention, advice }

# List all available diseases
diseases = engine.get_all_diseases()
# Returns: ["tuberculosis", "pneumonia", "normal", ...]
```

### Backend: Flask Endpoints (`backend/app.py`)

- `POST /api/disease-info` - Retrieve disease information
- `GET /api/diseases` - List available diseases

### Frontend: Service (`src/utils/diseaseInfoService.js`)

```javascript
import { fetchDiseaseInfoFromRAG } from "./diseaseInfoService";

// In your component:
const diseaseInfo = await fetchDiseaseInfoFromRAG("tuberculosis", "xray");
// Returns disease information or null if failed
```

### Frontend: Component (`src/pages/ScanningReportPage.jsx`)

Already integrated! The page:
1. Loads prediction from localStorage
2. Calls `fetchDiseaseInfoFromRAG(prediction.disease)`
3. Uses RAG data if available, falls back to generic text
4. Displays on Scanning Report page

---

## 📚 Adding More Diseases

### Option 1: Manual Addition

Edit `backend/knowledge_base/disease_database.json`:

```json
{
  "disease-name": {
    "characteristics": "Clinical presentation and imaging findings...",
    "symptoms": "Primary and secondary symptoms...",
    "treatment": "Evidence-based treatment protocols...",
    "prevention": "Preventive measures and lifestyle...",
    "advice": "Follow-up and specialist referral recommendations..."
  }
}
```

### Option 2: Programmatically (Python)

```python
from rag_engine import get_rag_engine

engine = get_rag_engine()

new_disease = {
    "characteristics": "...",
    "symptoms": "...",
    "treatment": "...",
    "prevention": "...",
    "advice": "..."
}

engine.add_disease("disease_name", new_disease)
```

### Option 3: From API/Database

Replace `backend/knowledge_base/disease_database.json` with data from:
- Medical APIs (OpenMRS, FHIR)
- Your own database
- AI-generated summaries

---

## 🎯 Current Diseases Available

1. **tuberculosis** - Mycobacterium infection
2. **pneumonia** - Acute lung infection
3. **normal** - Healthy (retina/chest)
4. **age-related macular degeneration** - Retinal degeneration
5. **diabetic retinopathy** - Diabetes-related eye disease
6. **cataract** - Lens opacity
7. **myopia** - Nearsightedness
8. **retinal vein occlusion** - Vein blockage
9. **pneumoconiosis** - Occupational lung disease

---

## 🔍 Troubleshooting

### Issue: "RAG engine not available"
**Problem**: RAG packages not installed
**Solution**:
```bash
pip install chromadb langchain langchain-community langchain-huggingface sentence-transformers
```

### Issue: First query takes 30+ seconds
**Problem**: Embedding model downloaded on first run (~400MB)
**Solution**: Wait for first query. Subsequent queries are instant.

### Issue: Disease not found
**Problem**: Disease name doesn't match knowledge base
**Solution**: 
- Check spelling (case-insensitive)
- Add disease to `disease_database.json`
- Or expand fuzzy matching in `rag_engine.py`

### Issue: Model download fails (proxy/network)
**Problem**: Can't reach HuggingFace Hub
**Solution**: 
```bash
# Pre-download model
huggingface-cli download sentence-transformers/all-MiniLM-L6-v2

# Or use offline mode
export HF_DATASETS_OFFLINE=1
```

### Issue: Port 5000 already in use
**Problem**: Flask can't bind to port
**Solution**:
```bash
PORT=5001 python app.py  # Use different port
# Update frontend API_BASE_URL in diseaseInfoService.js
```

---

## 🚀 Advanced Features

### 1. Persistent Vector Database

By default, ChromaDB stores in memory. For persistence:

```python
# In rag_engine.py
self.chroma_client = chromadb.PersistentClient(path="./chroma_db")
```

### 2. Custom Embedding Model

Use a different embedding model (faster/better):

```python
# In rag_engine.py
self.embedder = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-mpnet-base-v2"  # Better quality
)
```

### 3. Add LLM for Natural Language Generation

Generate insights instead of just retrieving:

```bash
pip install openai langchain-openai
```

```python
from langchain.chat_models import ChatOpenAI

llm = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Use RAG + LLM to generate custom insights
prompt = f"Summarize treatment for {disease}..."
response = llm.invoke(prompt)
```

### 4. Caching for Performance

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def retrieve_disease_info(self, disease_name):
    # Retrieved results are cached
    return self.knowledge_base.get(disease_name)
```

---

## 📋 Checklist

- ✅ Updated `backend/requirements.txt` with RAG packages
- ✅ Created `backend/rag_engine.py` (RAG engine)
- ✅ Created `backend/knowledge_base/disease_database.json` (knowledge base)
- ✅ Updated `backend/app.py` with RAG endpoints
- ✅ Created `src/utils/diseaseInfoService.js` (frontend service)
- ✅ `src/pages/ScanningReportPage.jsx` already uses RAG
- ✅ Test endpoints with curl or Postman

---

## 📞 Support

Need help? Check:
1. Flask console output for initialization messages
2. Browser DevTools Console for frontend errors
3. `RAG_IMPLEMENTATION_GUIDE.md` for detailed documentation
4. Knowledge base JSON for disease coverage

---

## 🎉 What's Next?

1. **Expand Knowledge Base**: Add more diseases with comprehensive information
2. **Improve Retrieval**: Add semantic search for symptoms and treatments
3. **Add LLM**: Integrate GPT for natural summarization
4. **User Feedback**: Let users rate information quality for model improvement
5. **Analytics**: Track which diseases are queried most
6. **Export**: Allow users to export disease reports as PDF

Happy disease detection! 🏥
