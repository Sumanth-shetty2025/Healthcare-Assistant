"""RAG engine for disease information retrieval and generation."""
import json
import os
from importlib import import_module
from pathlib import Path
from typing import Optional

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# Optional RAG dependencies
try:
    chromadb = import_module("chromadb")
    HuggingFaceEmbeddings = import_module("langchain_huggingface").HuggingFaceEmbeddings
    HAS_RAG_DEPS = True
except ImportError:
    HAS_RAG_DEPS = False

# Optional LLM dependencies (best-effort; feature gracefully degrades when missing)
try:
    ChatOpenAI = import_module("langchain_openai").ChatOpenAI
    HAS_OPENAI_LLM = True
except ImportError:
    HAS_OPENAI_LLM = False

try:
    pipeline = import_module("transformers").pipeline
    HAS_TRANSFORMERS_LLM = True
except ImportError:
    HAS_TRANSFORMERS_LLM = False


class DiseaseRAGEngine:
    """Retrieval-Augmented Generation for disease information."""

    def __init__(self, knowledge_base_path: str = "knowledge_base/disease_database.json"):
        """
        Initialize RAG engine with knowledge base.
        
        Args:
            knowledge_base_path: Path to disease knowledge base JSON file
        """
        self.kb_path = Path(knowledge_base_path)
        self.chroma_client = None
        self.collection = None
        self.embedder = None
        self.knowledge_base = {}
        self.rag_enabled = False
        self.llm_provider = os.getenv("RAG_LLM_PROVIDER", "none").strip().lower()
        self.llm = None
        
        self._load_knowledge_base()
        
        if HAS_RAG_DEPS:
            try:
                self._initialize_rag()
                self.rag_enabled = True
                print("✓ RAG engine initialized with ChromaDB")
            except Exception as e:
                print(f"⚠ RAG initialization failed: {e}. Using static knowledge base.")
                self.rag_enabled = False
        else:
            print("⚠ RAG dependencies not installed. Using static knowledge base.")
            print("  Install: pip install chromadb langchain-huggingface sentence-transformers")

        self._initialize_llm()

    def _initialize_llm(self):
        """Initialize optional LLM backend for detailed section generation."""
        provider = self.llm_provider
        if provider not in {"openai", "transformers"}:
            return

        if provider == "openai":
            if not HAS_OPENAI_LLM:
                print("⚠ OpenAI LLM provider selected but langchain-openai is not installed.")
                return

            api_key = os.getenv("OPENAI_API_KEY", "").strip()
            if not api_key:
                print("⚠ OpenAI LLM provider selected but OPENAI_API_KEY is missing.")
                return

            try:
                self.llm = ChatOpenAI(
                    model=os.getenv("RAG_OPENAI_MODEL", "gpt-4o-mini"),
                    temperature=0.2,
                )
                print("✓ LLM initialized via OpenAI provider")
            except Exception as e:
                print(f"⚠ Failed to initialize OpenAI LLM: {e}")
                self.llm = None
            return

        if provider == "transformers":
            if not HAS_TRANSFORMERS_LLM:
                print("⚠ Transformers LLM provider selected but transformers is not installed.")
                return

            model_name = os.getenv("RAG_LOCAL_MODEL", "google/flan-t5-base")
            try:
                self.llm = pipeline("text2text-generation", model=model_name, device=-1)
                print(f"✓ LLM initialized via transformers provider ({model_name})")
            except Exception as e:
                print(f"⚠ Failed to initialize transformers LLM ({model_name}): {e}")
                self.llm = None

    def _load_knowledge_base(self):
        """Load disease database from JSON file."""
        try:
            if self.kb_path.exists():
                with open(self.kb_path, "r", encoding="utf-8") as f:
                    self.knowledge_base = json.load(f)
                print(f"✓ Loaded {len(self.knowledge_base)} diseases from knowledge base")
            else:
                print(f"⚠ Knowledge base not found at {self.kb_path}")
        except Exception as e:
            print(f"✗ Error loading knowledge base: {e}")

    def _initialize_rag(self):
        """Initialize ChromaDB and embeddings for vector retrieval."""
        if not self.knowledge_base:
            print("⚠ No knowledge base available for RAG")
            return
            
        try:
            # Initialize embedder (downloads ~400MB on first use)
            print("Initializing embedding model (first run may take 1-2 minutes)...")
            self.embedder = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2",
                model_kwargs={"device": "cpu"}
            )
            
            # Initialize ChromaDB client
            self.chroma_client = chromadb.Client()
            
            # Create or get collection
            collection_name = "disease_information"
            try:
                self.collection = self.chroma_client.get_collection(collection_name)
                print(f"✓ Using existing ChromaDB collection: {collection_name}")
            except Exception:
                self.collection = self.chroma_client.create_collection(collection_name)
                print(f"✓ Created new ChromaDB collection: {collection_name}")
                self._populate_collection()
                
        except Exception as e:
            print(f"✗ RAG initialization error: {e}")
            raise

    def _populate_collection(self):
        """Add disease documents to ChromaDB for vector search."""
        if not self.collection or not self.knowledge_base:
            print("⚠ Cannot populate collection: missing collection or knowledge base")
            return
        
        print("Populating vector database with disease documents...")
        added_count = 0
        
        for disease_name, info in self.knowledge_base.items():
            try:
                # Create comprehensive document for better retrieval
                document_text = f"""
Disease: {disease_name}

Characteristics:
{info.get('characteristics', 'Not available')}

Symptoms:
{info.get('symptoms', 'Not available')}

Treatment:
{info.get('treatment', 'Not available')}

Prevention:
{info.get('prevention', 'Not available')}

Clinical Advice:
{info.get('advice', 'Not available')}
                """
                
                self.collection.add(
                    documents=[document_text],
                    metadatas=[{"disease": disease_name}],
                    ids=[disease_name.lower().replace(" ", "_")]
                )
                added_count += 1
            except Exception as e:
                print(f"  ✗ Error adding {disease_name}: {e}")
        
        print(f"✓ Added {added_count} documents to vector database")

    def retrieve_disease_info(self, disease_name: str, n_results: int = 1) -> dict:
        """
        Retrieve disease information using RAG (vector search) or fallback to static lookup.
        
        Args:
            disease_name: Name of the disease to retrieve
            n_results: Number of retrieval results to consider
            
        Returns:
            Dictionary with disease information (characteristics, symptoms, treatment, prevention, advice)
        """
        normalized_name = disease_name.lower().strip()
        
        # Try exact match in knowledge base first (fastest)
        if normalized_name in self.knowledge_base:
            return self.knowledge_base[normalized_name]
        
        # Try RAG vector search if enabled
        if self.rag_enabled and self.collection:
            try:
                results = self.collection.query(
                    query_texts=[disease_name],
                    n_results=n_results
                )
                
                if results and results.get("metadatas") and len(results["metadatas"]) > 0:
                    retrieved_disease = results["metadatas"][0].get("disease")
                    if retrieved_disease and retrieved_disease in self.knowledge_base:
                        print(f"✓ Retrieved '{retrieved_disease}' via vector search")
                        return self.knowledge_base[retrieved_disease]
            except Exception as e:
                print(f"✗ RAG retrieval error: {e}")
        
        # Try fuzzy matching (case-insensitive substring)
        for kb_disease in self.knowledge_base:
            if normalized_name in kb_disease.lower() or kb_disease.lower() in normalized_name:
                return self.knowledge_base[kb_disease]
        
        # Fallback: generate generic response
        print(f"⚠ Disease '{disease_name}' not found in knowledge base")
        return self._generate_generic_response(disease_name)

    def _generate_generic_response(self, disease_name: str) -> dict:
        """Generate generic response for diseases not in knowledge base."""
        return {
            "characteristics": f"{disease_name} is a medical condition that requires professional evaluation to determine specific imaging and clinical features.",
            "symptoms": f"Symptoms of {disease_name} vary based on disease severity, patient age, comorbidities, and individual factors.",
            "treatment": f"Treatment of {disease_name} must be individualized and determined by qualified medical professionals based on disease severity and patient status.",
            "prevention": f"Prevention strategies for {disease_name} should be discussed with your healthcare provider based on known risk factors.",
            "advice": f"Consult with appropriate medical specialists for comprehensive evaluation, diagnosis confirmation, and evidence-based management of {disease_name}."
        }

    def _build_external_queries(self, disease_name: str, section: str, modality: str) -> list[str]:
        """Build external search queries for section-specific web retrieval."""
        section_key = self._resolve_section_key(section)
        section_queries = {
            "characteristics": [
                f"{disease_name} overview",
                f"{disease_name} causes clinical features",
            ],
            "symptoms": [
                f"{disease_name} symptoms signs",
                f"{disease_name} clinical symptoms",
            ],
            "treatment": [
                f"{disease_name} treatment management",
                f"{disease_name} therapy medication",
            ],
            "prevention": [
                f"{disease_name} prevention risk factors",
                f"{disease_name} prevention control",
            ],
            "advice": [
                f"{disease_name} medical advice follow up",
                f"{disease_name} when to see doctor",
            ],
        }

        queries = section_queries.get(section_key, [f"{disease_name} {section_key}"])
        if modality == "xray":
            queries.append(f"{disease_name} chest xray radiology")
        return [query for query in queries if query]

    def _external_fetch_json(self, url: str, params: Optional[dict] = None) -> dict:
        """Fetch JSON from an external source with a short timeout."""
        if not HAS_REQUESTS:
            return {}

        try:
            response = requests.get(url, params=params, timeout=6)
            response.raise_for_status()
            return response.json()
        except Exception:
            return {}

    def _fetch_wikipedia_summary(self, title: str) -> Optional[dict]:
        """Fetch a Wikipedia summary for a disease or related topic."""
        if not HAS_REQUESTS:
            return None

        safe_title = title.strip().replace(" ", "_")
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{safe_title}"
        try:
            response = requests.get(url, timeout=6, headers={"Accept": "application/json"})
            if response.status_code != 200:
                return None

            data = response.json()
            extract = str(data.get("extract", "")).strip()
            page_url = data.get("content_urls", {}).get("desktop", {}).get("page")
            if not extract:
                return None

            return {
                "source": "Wikipedia",
                "title": str(data.get("title") or title),
                "content": extract,
                "url": page_url or f"https://en.wikipedia.org/wiki/{safe_title}",
            }
        except Exception:
            return None

    def _search_wikipedia(self, query: str, limit: int = 2) -> list[dict]:
        """Search Wikipedia for related external snippets."""
        if not HAS_REQUESTS:
            return []

        url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "format": "json",
            "srlimit": limit,
            "origin": "*",
        }
        data = self._external_fetch_json(url, params=params)
        search_results = data.get("query", {}).get("search", []) if isinstance(data, dict) else []
        snippets: list[dict] = []

        for result in search_results[:limit]:
            title = str(result.get("title", "")).strip()
            snippet = str(result.get("snippet", "")).strip()
            if not title or not snippet:
                continue

            cleaned_snippet = snippet.replace("<span class=\"searchmatch\">", "").replace("</span>", "")
            snippets.append(
                {
                    "source": "Wikipedia search",
                    "title": title,
                    "content": cleaned_snippet,
                    "url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                }
            )

        return snippets

    def _search_pubmed(self, query: str, limit: int = 3) -> list[dict]:
        """Search PubMed and return lightweight citation context.

        Notes:
            PubMed E-utilities are public and rate-limited; keep requests small.
        """
        if not HAS_REQUESTS:
            return []

        try:
            search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
            search_params = {
                "db": "pubmed",
                "term": query,
                "retmode": "json",
                "retmax": limit,
                "sort": "relevance",
            }
            search_data = self._external_fetch_json(search_url, params=search_params)
            ids = search_data.get("esearchresult", {}).get("idlist", []) if isinstance(search_data, dict) else []
            if not ids:
                return []

            summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
            summary_params = {
                "db": "pubmed",
                "id": ",".join(ids),
                "retmode": "json",
            }
            summary_data = self._external_fetch_json(summary_url, params=summary_params)
            result_block = summary_data.get("result", {}) if isinstance(summary_data, dict) else {}

            publications: list[dict] = []
            for pmid in ids:
                entry = result_block.get(str(pmid), {})
                if not isinstance(entry, dict):
                    continue

                title = str(entry.get("title", "")).strip()
                source = str(entry.get("source", "")).strip()
                pubdate = str(entry.get("pubdate", "")).strip()
                if not title:
                    continue

                content = f"{title}. {source} {pubdate}".strip()
                publications.append(
                    {
                        "source": "PubMed",
                        "title": title,
                        "content": content,
                        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                    }
                )

            return publications
        except Exception:
            return []

    def _fetch_external_context(self, disease_name: str, section: str, modality: str) -> list[dict]:
        """Retrieve external evidence for the requested section."""
        if not HAS_REQUESTS:
            print("⚠ requests is unavailable; skipping external retrieval")
            return []

        evidence: list[dict] = []
        seen_titles: set[str] = set()

        def add_item(item: Optional[dict]) -> None:
            if not item:
                return
            title = str(item.get("title", "")).strip().lower()
            if not title or title in seen_titles:
                return
            seen_titles.add(title)
            evidence.append(item)

        # Try a direct disease page first.
        add_item(self._fetch_wikipedia_summary(disease_name))

        # Then query section-specific medical context from external sources.
        for query in self._build_external_queries(disease_name, section, modality):
            add_item(self._fetch_wikipedia_summary(query))
            for snippet in self._search_wikipedia(query):
                add_item(snippet)
            for paper in self._search_pubmed(query):
                add_item(paper)

        return evidence

    def _compose_external_context(self, external_sources: list[dict]) -> str:
        """Convert external source payload into a compact prompt context string."""
        if not external_sources:
            return "No external web sources were available."

        lines = []
        for item in external_sources[:5]:
            source = item.get("source", "External source")
            title = item.get("title", "Untitled")
            content = item.get("content", "").strip()
            url = item.get("url", "")
            lines.append(f"- {source}: {title}\n  {content}\n  {url}")
        return "\n".join(lines)

    def _combine_internal_and_external_context(self, disease_name: str, section: str, modality: str) -> dict:
        """Combine local knowledge base retrieval with external web evidence."""
        knowledge = self.retrieve_disease_info(disease_name)
        section_key = self._resolve_section_key(section)
        section_text = knowledge.get(section_key) or self._generate_generic_response(disease_name).get(section_key, "")
        external_sources = self._fetch_external_context(disease_name, section, modality)

        return {
            "knowledge": knowledge,
            "section_key": section_key,
            "section_text": section_text,
            "external_sources": external_sources,
            "external_context": self._compose_external_context(external_sources),
        }

    def get_all_diseases(self) -> list:
        """Get list of all available diseases in knowledge base."""
        return sorted(list(self.knowledge_base.keys()))

    def _resolve_section_key(self, section: str) -> str:
        """Map UI section title to knowledge-base key."""
        section_map = {
            "disease characteristics": "characteristics",
            "symptoms": "symptoms",
            "treatment options": "treatment",
            "prevention": "prevention",
            "doctor advice": "advice",
            "characteristics": "characteristics",
            "treatment": "treatment",
            "advice": "advice",
        }
        return section_map.get(section.lower().strip(), section.lower().strip())

    def _build_llm_prompt(self, disease_name: str, modality: str, section_label: str, section_text: str, knowledge: dict) -> str:
        """Create a comprehensive clinical prompt for section-level explanation generation."""
        return f"""
You are a medical AI assistant for educational clinical support.
Generate a comprehensive explanation for the requested report section.

Disease: {disease_name}
Imaging modality: {modality}
Section requested: {section_label}

Primary section content:
{section_text}

Additional retrieved context:
Characteristics: {knowledge.get('characteristics', '')}
Symptoms: {knowledge.get('symptoms', '')}
Treatment: {knowledge.get('treatment', '')}
Prevention: {knowledge.get('prevention', '')}
Advice: {knowledge.get('advice', '')}

Instructions:
1) Return point-wise content only as 6-9 bullet points.
2) Start each line with "- " and keep each point clinically meaningful.
3) Keep primary focus on the requested section, but include concise links to other sections when clinically useful.
4) Use both internal knowledge and external evidence in a synthesized way.
5) Highlight critical medical terms by surrounding them with double asterisks, e.g., **{disease_name}**, **antibiotics**, **screening**, **x-ray**.
6) Avoid definitive diagnosis language and avoid claiming certainty.
7) End with one short safety bullet recommending clinician follow-up.
""".strip()

    def _generate_with_llm(self, prompt: str) -> Optional[str]:
        """Generate text with configured LLM provider."""
        if self.llm is None:
            return None

        try:
            if self.llm_provider == "openai":
                response = self.llm.invoke(prompt)
                content = getattr(response, "content", "")
                return content.strip() if content else None

            if self.llm_provider == "transformers":
                outputs = self.llm(prompt, max_length=256, do_sample=True, temperature=0.35)
                if outputs and isinstance(outputs, list):
                    return outputs[0].get("generated_text", "").strip() or None
        except Exception as e:
            print(f"⚠ LLM generation failed: {e}")

        return None

    def _build_external_evidence_lines(self, external_sources: list[dict], max_items: int = 3) -> list[str]:
        """Build concise external evidence bullets for report output."""
        if not external_sources:
            return []

        bullets: list[str] = []
        for item in external_sources[:max_items]:
            source = str(item.get("source", "External source")).strip()
            title = str(item.get("title", "Clinical reference")).strip()
            content = str(item.get("content", "")).strip()
            compact_content = " ".join(content.split())
            if len(compact_content) > 170:
                compact_content = f"{compact_content[:167]}..."

            bullets.append(f"- External evidence: **{source}** - **{title}**. {compact_content}")

        return bullets

    def _fallback_expand_section(self, disease_name: str, section_label: str, section_text: str, external_sources: list[dict]) -> str:
        """Fallback detail builder used when no live LLM provider is configured."""
        points = [
            f"- Core section insight: **{section_label}** for **{disease_name}** suggests {section_text}",
            f"- Key clinical context: interpret **{disease_name}** with imaging pattern, symptom timeline, and risk profile.",
            "- Diagnostic support: correlate findings with history, examination, and targeted laboratory or specialist evaluation.",
            "- Treatment planning: review suitable **medicine** options, non-pharmacologic care, and expected response monitoring.",
            "- Prevention strategy: reinforce risk-factor control, adherence, and regular **screening** where applicable.",
            "- Follow-up focus: track progression, red-flag worsening, and need for escalation or referral.",
        ]

        points.extend(self._build_external_evidence_lines(external_sources))

        points.extend([
            "- Safety note: discuss all treatment decisions with a qualified clinician before acting on this summary.",
        ])
        return "\n".join(points)

    def _convert_markdown_to_html(self, text: str) -> str:
        """
        Convert markdown-style highlights (**term**) to HTML spans with medical-term class.
        Formats each bullet point with proper HTML structure.
        
        Args:
            text: Text with markdown highlights like **term** and bullet points
            
        Returns:
            HTML string with proper formatting and medical term highlighting
        """
        import re
        
        if not text:
            return ""
        
        # First, remove any existing HTML to avoid double-encoding
        text = re.sub(r'<[^>]+>', '', text)
        
        # Split into individual lines for processing
        lines = text.strip().split('\n')
        formatted_html_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Convert **term** to <span class="medical-term">term</span>
            # This regex matches anything between **...**
            line_html = re.sub(
                r'\*\*([^\*]+)\*\*',
                r'<span class="medical-term">\1</span>',
                line
            )
            
            # Wrap the line in a div with proper class
            formatted_html_lines.append(line_html)
        
        # Join lines with proper line breaks within the content
        return '\n'.join(formatted_html_lines)

    def generate_detailed_section_explanation(self, disease_name: str, section: str, modality: str = "xray") -> dict:
        """
        Retrieve section-level context with RAG and generate a detailed explanation.

        Returns:
            {
                "section": "Symptoms",
                "section_key": "symptoms",
                "detail": "...",
                "source": "llm" | "fallback"
            }
        """
        combined_context = self._combine_internal_and_external_context(disease_name, section, modality)
        knowledge = combined_context["knowledge"]
        section_key = combined_context["section_key"]
        section_text = combined_context["section_text"]
        external_context = combined_context["external_context"]

        prompt = self._build_llm_prompt(disease_name, modality, section, section_text, knowledge)
        prompt = f"{prompt}\n\nExternal web evidence:\n{external_context}"
        llm_text = self._generate_with_llm(prompt)
        external_lines = self._build_external_evidence_lines(combined_context["external_sources"])

        if llm_text:
            final_text = llm_text
            if external_lines:
                final_text = f"{final_text}\n" + "\n".join(external_lines)

            # Convert markdown highlights to HTML for medical term highlighting
            html_detail = self._convert_markdown_to_html(final_text)
            return {
                "section": section,
                "section_key": section_key,
                "detail": html_detail,
                "source": "llm",
                "external_sources": combined_context["external_sources"],
                "external_count": len(combined_context["external_sources"]),
            }

        # Fallback: use static template with markdown-to-HTML conversion
        fallback_text = self._fallback_expand_section(
            disease_name,
            section,
            section_text,
            combined_context["external_sources"],
        )
        html_detail = self._convert_markdown_to_html(fallback_text)
        return {
            "section": section,
            "section_key": section_key,
            "detail": html_detail,
            "source": "fallback",
            "external_sources": combined_context["external_sources"],
            "external_count": len(combined_context["external_sources"]),
        }

    def get_disease_count(self) -> int:
        """Get total number of diseases in knowledge base."""
        return len(self.knowledge_base)

    def add_disease(self, disease_name: str, information: dict) -> bool:
        """
        Add a new disease to the knowledge base.
        
        Args:
            disease_name: Name of the disease
            information: Dictionary with keys: characteristics, symptoms, treatment, prevention, advice
            
        Returns:
            True if successful, False otherwise
        """
        try:
            normalized_name = disease_name.lower().strip()
            self.knowledge_base[normalized_name] = information
            
            # Re-populate ChromaDB if RAG enabled
            if self.rag_enabled and self.collection:
                self._populate_collection()
            
            return True
        except Exception as e:
            print(f"✗ Error adding disease: {e}")
            return False


# Global RAG engine instance
_rag_engine_instance = None


def init_rag_engine(knowledge_base_path: str = "knowledge_base/disease_database.json") -> DiseaseRAGEngine:
    """
    Initialize global RAG engine instance.
    
    Args:
        knowledge_base_path: Path to disease knowledge base JSON
        
    Returns:
        DiseaseRAGEngine instance
    """
    global _rag_engine_instance
    if _rag_engine_instance is None:
        _rag_engine_instance = DiseaseRAGEngine(knowledge_base_path)
    return _rag_engine_instance


def get_rag_engine() -> DiseaseRAGEngine:
    """Get the global RAG engine instance."""
    global _rag_engine_instance
    if _rag_engine_instance is None:
        _rag_engine_instance = init_rag_engine()
    return _rag_engine_instance
