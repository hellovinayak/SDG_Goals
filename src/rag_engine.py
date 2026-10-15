"""
src/rag_engine.py
Retrieval-Augmented Generation (RAG) & Policy Intelligence Pipeline for SDG Monitoring.
Integrates:
  - PyMuPDF (fitz) for PDF text & page extraction
  - ChromaDB for persistent vector storage & similarity retrieval
  - Google Gemini API (via google-genai SDK) with strict factual grounding
  - Structured historical & forecast CSV data integration
"""

import os
import re
import glob
import logging
from typing import Dict, List, Any, Optional, Tuple
import pandas as pd
import fitz  # PyMuPDF
import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv

from src.gap_analysis import compute_state_sdg_gaps, OFFICIAL_BENCHMARKS
from src.action_planner import generate_2026_action_plan
from src.model_engine import generate_scenario_forecasts, DEFAULT_FORECAST_YEARS

# Load environment variables
load_dotenv()

logger = logging.getLogger("rag_engine")
logger.setLevel(logging.INFO)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DOCS_DIR = os.path.join(DATA_DIR, "documents")
CHROMA_DIR = os.getenv("CHROMA_DB_DIR", os.path.join(DATA_DIR, "chroma_db"))
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

SDG_MAP = {
    "SDG3_Health": "SDG 3 (Good Health and Well-Being)",
    "SDG4_Education": "SDG 4 (Quality Education)",
    "SDG13_Climate": "SDG 13 (Climate Action)"
}

SDG_SHORT_KEYS = {
    "3": "SDG3_Health",
    "4": "SDG4_Education",
    "13": "SDG13_Climate",
    "health": "SDG3_Health",
    "education": "SDG4_Education",
    "climate": "SDG13_Climate"
}


class SDGKnowledgeBase:
    """Manages document extraction (PDF/TXT), chunking, and ChromaDB vector indexing."""

    def __init__(self, chroma_path: str = CHROMA_DIR):
        self.chroma_path = chroma_path
        os.makedirs(self.chroma_path, exist_ok=True)
        self.client = chromadb.PersistentClient(path=self.chroma_path)
        self.collection_name = "sdg_policy_knowledge"
        
        # Use default local ONNX MiniLM embedding function (offline capable, deterministic)
        self.embed_fn = embedding_functions.DefaultEmbeddingFunction()
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            embedding_function=self.embed_fn,
            metadata={"description": "Official SDG Policy & Governance Documents for India"}
        )
        self.documents_metadata = []
        self._ensure_documents_indexed()

    def _extract_text_from_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        """Extract text page-by-page from a PDF using PyMuPDF (fitz)."""
        pages = []
        doc_name = os.path.basename(file_path)
        try:
            doc = fitz.open(file_path)
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                text = page.get_text("text").strip()
                if text:
                    pages.append({
                        "document": doc_name,
                        "file_path": file_path,
                        "page": page_idx + 1,
                        "text": text,
                        "title": f"NITI Aayog SDG Compendium (Page {page_idx + 1})"
                    })
            doc.close()
        except Exception as e:
            logger.error(f"Error extracting PDF {file_path}: {e}")
        return pages

    def _extract_text_from_txt(self, file_path: str) -> List[Dict[str, Any]]:
        """Extract text and section titles from a TXT document."""
        doc_name = os.path.basename(file_path)
        sections = []
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Extract title if present in first markdown heading
            title = doc_name.replace(".txt", "").replace("_", " ").title()
            title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
            if title_match:
                title = title_match.group(1).strip()

            sections.append({
                "document": doc_name,
                "file_path": file_path,
                "page": 1,
                "text": content,
                "title": title
            })
        except Exception as e:
            logger.error(f"Error reading TXT {file_path}: {e}")
        return sections

    def _chunk_text(self, text: str, chunk_size: int = 700, overlap: int = 120) -> List[str]:
        """Splits text into chunks preserving sentence boundaries where possible."""
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) <= chunk_size:
            return [text]

        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            if end >= len(text):
                chunks.append(text[start:].strip())
                break

            # Try to break at a period, question mark, or newline
            break_pt = text.rfind(". ", start, end)
            if break_pt == -1 or break_pt < start + (chunk_size // 2):
                break_pt = text.rfind("; ", start, end)
            if break_pt == -1 or break_pt < start + (chunk_size // 2):
                break_pt = text.rfind(" ", start, end)
            if break_pt == -1 or break_pt < start:
                break_pt = end

            chunk = text[start:break_pt + 1].strip()
            if chunk:
                chunks.append(chunk)
            start = break_pt + 1 - overlap
            if start < 0:
                start = 0
        return chunks

    def _tag_sdg_and_state(self, text: str, doc_name: str) -> Tuple[str, str]:
        """Infers SDG category and primary state/region from text content."""
        lower = (text + " " + doc_name).lower()
        sdg = "General"
        if "sdg 3" in lower or "health" in lower or "nhm" in lower or "hospital" in lower or "doctor" in lower:
            sdg = "SDG3_Health"
        elif "sdg 4" in lower or "education" in lower or "nep" in lower or "school" in lower or "literacy" in lower:
            sdg = "SDG4_Education"
        elif "sdg 13" in lower or "climate" in lower or "solar" in lower or "renewable" in lower or "emission" in lower:
            sdg = "SDG13_Climate"

        # Detect notable states mentioned
        detected_state = "National"
        for st in ["Kerala", "Tamil Nadu", "Himachal Pradesh", "Delhi", "Gujarat", "Odisha", "Sikkim", "Rajasthan", "Uttar Pradesh", "Bihar", "Assam", "Maharashtra", "Karnataka"]:
            if st.lower() in lower:
                detected_state = st
                break

        return sdg, detected_state

    def _ensure_documents_indexed(self):
        """Indexes all documents in data/documents into ChromaDB if not already indexed."""
        if not os.path.exists(DOCS_DIR):
            os.makedirs(DOCS_DIR, exist_ok=True)
            return

        current_count = self.collection.count()
        # If collection already has data and document count matches, skip heavy re-indexing
        doc_files = glob.glob(os.path.join(DOCS_DIR, "*.*"))
        valid_files = [f for f in doc_files if f.endswith((".pdf", ".txt", ".md"))]

        if current_count > 0 and len(valid_files) > 0:
            # Quick check if all files are in metadata
            existing = self.collection.get(limit=5)
            if existing and existing["ids"]:
                logger.info(f"ChromaDB collection already initialized with {current_count} chunks.")
                return

        logger.info(f"Indexing {len(valid_files)} documents into ChromaDB...")
        chunk_ids = []
        chunk_texts = []
        chunk_metadatas = []

        chunk_counter = 0
        for file_path in valid_files:
            doc_name = os.path.basename(file_path)
            if file_path.endswith(".pdf"):
                pages = self._extract_text_from_pdf(file_path)
            else:
                pages = self._extract_text_from_txt(file_path)

            for page_info in pages:
                chunks = self._chunk_text(page_info["text"])
                for idx, chunk in enumerate(chunks):
                    sdg_tag, state_tag = self._tag_sdg_and_state(chunk, doc_name)
                    cid = f"{doc_name}_p{page_info['page']}_c{idx}_{chunk_counter}"
                    chunk_ids.append(cid)
                    chunk_texts.append(chunk)
                    chunk_metadatas.append({
                        "document": doc_name,
                        "title": page_info["title"],
                        "page": int(page_info["page"]),
                        "sdg": sdg_tag,
                        "state": state_tag,
                        "source": file_path
                    })
                    chunk_counter += 1

        if chunk_ids:
            self.collection.add(
                ids=chunk_ids,
                documents=chunk_texts,
                metadatas=chunk_metadatas
            )
            logger.info(f"Successfully indexed {len(chunk_ids)} chunks into ChromaDB.")

    def retrieve(self, query: str, state: Optional[str] = None, sdg: Optional[str] = None, n_results: int = 4) -> List[Dict[str, Any]]:
        """Queries ChromaDB vector collection for relevant policy text chunks."""
        count = self.collection.count()
        if count == 0:
            return []

        # Construct semantic query including state & SDG for high recall
        augmented_query = query
        if state and state.lower() not in query.lower():
            augmented_query += f" {state}"
        if sdg and sdg in SDG_MAP:
            augmented_query += f" {SDG_MAP[sdg]}"

        try:
            results = self.collection.query(
                query_texts=[augmented_query],
                n_results=min(n_results, count)
            )
        except Exception as e:
            logger.error(f"Chroma query error: {e}")
            return []

        retrieved = []
        if results and "documents" in results and results["documents"]:
            docs = results["documents"][0]
            metas = results["metadatas"][0] if "metadatas" in results else [{}] * len(docs)
            distances = results["distances"][0] if "distances" in results and results["distances"] else [0.0] * len(docs)

            for doc_text, meta, dist in zip(docs, metas, distances):
                retrieved.append({
                    "document": meta.get("document", "Unknown Document"),
                    "title": meta.get("title", meta.get("document", "Document")),
                    "page": meta.get("page", 1),
                    "sdg": meta.get("sdg", "General"),
                    "state": meta.get("state", "National"),
                    "text": doc_text,
                    "relevance_distance": float(dist) if dist else 0.0
                })

        return retrieved

    def get_stats(self) -> Dict[str, Any]:
        """Returns collection stats."""
        doc_files = [os.path.basename(f) for f in glob.glob(os.path.join(DOCS_DIR, "*.*")) if f.endswith((".pdf", ".txt", ".md"))]
        return {
            "chunks_count": self.collection.count(),
            "documents_count": len(doc_files),
            "documents": doc_files
        }


class SDGDataStore:
    """Provides structured data lookups from historical NITI Aayog CSVs and ML projections."""

    def __init__(self):
        self.hist_df = None
        self.fore_df = None
        self._load_datasets()

    def _load_datasets(self):
        hist_path = os.path.join(DATA_DIR, "niti_aayog_sdg_historical.csv")
        fore_path = os.path.join(DATA_DIR, "sdg_projections_2024_2026.csv")

        if os.path.exists(hist_path):
            self.hist_df = pd.read_csv(hist_path)
        if os.path.exists(fore_path):
            self.fore_df = pd.read_csv(fore_path)

    def get_metrics(self, state: str, sdg: str) -> Dict[str, Any]:
        """Computes comprehensive quantitative metrics for a state and SDG."""
        res = {
            "state": state,
            "sdg": sdg,
            "sdg_title": SDG_MAP.get(sdg, sdg),
            "historical_scores": {},
            "forecast_scores": {},
            "historical_change": 0.0,
            "forecast_change": 0.0,
            "annual_velocity": 0.0,
            "2023_score": None,
            "2026_forecast": None,
            "tier_2023": "Unknown",
            "tier_2026": "Unknown",
            "national_avg_2023": None,
            "national_avg_2026": None,
            "top_peer_state": None,
            "top_peer_score_2026": None
        }

        # Historical data
        if self.hist_df is not None and not self.hist_df.empty:
            st_hist = self.hist_df[self.hist_df["State"] == state].sort_values("Year")
            if not st_hist.empty and sdg in st_hist.columns:
                for _, row in st_hist.iterrows():
                    res["historical_scores"][int(row["Year"])] = round(float(row[sdg]), 1)
                
                score_2018 = res["historical_scores"].get(2018)
                score_2023 = res["historical_scores"].get(2023)
                if score_2023 is not None:
                    res["2023_score"] = score_2023
                    res["tier_2023"] = "Front Runner (≥75)" if score_2023 >= 75 else ("Performer (50-74)" if score_2023 >= 50 else "Aspirant (<50)")
                if score_2018 is not None and score_2023 is not None:
                    res["historical_change"] = round(score_2023 - score_2018, 1)

            # National 2023 avg
            hist_23 = self.hist_df[self.hist_df["Year"] == 2023]
            if not hist_23.empty and sdg in hist_23.columns:
                res["national_avg_2023"] = round(float(hist_23[sdg].mean()), 1)

        # Forecast data
        if self.fore_df is not None and not self.fore_df.empty:
            st_fore = self.fore_df[(self.fore_df["State"] == state) & (self.fore_df["SDG"] == sdg)].sort_values("Year")
            if not st_fore.empty:
                for _, row in st_fore.iterrows():
                    res["forecast_scores"][int(row["Year"])] = round(float(row["Forecast_Score"]), 1)
                
                score_2026 = res["forecast_scores"].get(2026)
                if score_2026 is not None:
                    res["2026_forecast"] = score_2026
                    res["tier_2026"] = "Front Runner (≥75)" if score_2026 >= 75 else ("Performer (50-74)" if score_2026 >= 50 else "Aspirant (<50)")
                
                if res["2023_score"] is not None and score_2026 is not None:
                    res["forecast_change"] = round(score_2026 - res["2023_score"], 1)
                    res["annual_velocity"] = round(res["forecast_change"] / 3.0, 2)

            # National 2026 avg
            fore_26 = self.fore_df[(self.fore_df["Year"] == 2026) & (self.fore_df["SDG"] == sdg)]
            if not fore_26.empty:
                res["national_avg_2026"] = round(float(fore_26["Forecast_Score"].mean()), 1)

            # Find top peer state for this SDG in 2026
            best_peer = fore_26.sort_values("Forecast_Score", ascending=False).iloc[0]
            if best_peer["State"] != state:
                res["top_peer_state"] = str(best_peer["State"])
                res["top_peer_score_2026"] = round(float(best_peer["Forecast_Score"]), 1)
            else:
                second_peer = fore_26.sort_values("Forecast_Score", ascending=False).iloc[1]
                res["top_peer_state"] = str(second_peer["State"])
                res["top_peer_score_2026"] = round(float(second_peer["Forecast_Score"]), 1)

        return res


class SDGRagEngine:
    """Core RAG & GenAI Policy Assistant coordinating knowledge retrieval, prompt grounding, and Gemini execution."""

    def __init__(self):
        self.kb = SDGKnowledgeBase()
        self.datastore = SDGDataStore()
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model_name = GEMINI_MODEL
        self._gemini_client = None
        self._init_gemini()

    def _init_gemini(self):
        """Initializes Google GenAI client if GEMINI_API_KEY is available."""
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if self.api_key and self.api_key != "your_gemini_api_key_here":
            try:
                import google.genai as genai
                self._gemini_client = genai.Client(api_key=self.api_key)
                logger.info(f"Google GenAI initialized with model: {self.model_name}")
            except Exception as e:
                logger.error(f"Failed to initialize google.genai: {e}")
                self._gemini_client = None
        else:
            self._gemini_client = None

    def is_gemini_configured(self) -> bool:
        """Returns True if a real Gemini API key is configured and client is ready."""
        return self._gemini_client is not None

    def get_status(self) -> Dict[str, Any]:
        """Provides status of vector store and Gemini configuration."""
        stats = self.kb.get_stats()
        return {
            "gemini_configured": self.is_gemini_configured(),
            "model": self.model_name,
            "documents_indexed": stats["documents_count"],
            "chunks_indexed": stats["chunks_count"],
            "documents": stats["documents"],
            "default_state": "Tamil Nadu",
            "default_sdg": "SDG3_Health",
            "sdgs": list(SDG_MAP.keys())
        }

    def _build_grounding_context(
        self, 
        state: str, 
        sdg: str, 
        metrics: Dict[str, Any], 
        passages: List[Dict[str, Any]],
        gaps_data: Dict[str, Any],
        action_plan: Dict[str, Any],
        scenarios: Dict[str, Any]
    ) -> str:
        """Assembles verified data, gap analysis, 2026 action plan, 2024-2030 forecasts, and retrieved document text into structured context."""
        context_parts = []
        
        # 1. State Status & Longitudinal Metrics
        context_parts.append("### 1. OFFICIAL LONGITUDINAL DATA (NITI Aayog Historical 2018-2023):")
        context_parts.append(f"- State / UT: {state}")
        context_parts.append(f"- Target Goal: {metrics.get('sdg_title', sdg)}")
        context_parts.append(f"- Historical Trajectory (2018-2023): {metrics.get('historical_scores', {})}")
        context_parts.append(f"- Baseline 2023 Score: {metrics.get('2023_score', 'N/A')} ({metrics.get('tier_2023', 'N/A')})")
        context_parts.append(f"- 5-Year Historical Delta (2018 to 2023): {metrics.get('historical_change', 'N/A')} points (Annual Velocity: {metrics.get('annual_velocity', 'N/A')} pts/yr)")
        context_parts.append(f"- 2023 National Average: {metrics.get('national_avg_2023', 'N/A')}")
        if metrics.get("top_peer_state"):
            context_parts.append(f"- Top Benchmark Peer State: {metrics.get('top_peer_state')} (Projected 2026 Score: {metrics.get('top_peer_score_2026')})")

        # 2. Comprehensive Goal & Indicator Gap Analysis
        context_parts.append("\n### 2. EMPIRICAL GAP ANALYSIS & UNMET TARGETS:")
        for g_k, g_v in gaps_data.get("goal_summaries", {}).items():
            context_parts.append(
                f"- {g_v['sdg_title']}: 2023 Score = {g_v['2023_score']} | 2030 Target = 100.0 | Distance to Target = {g_v['gap_to_target']} pts | Trend = {g_v['trend']} ({g_v['annual_velocity']} pts/yr) | Status = {g_v['status']}"
            )
        
        if gaps_data.get("indicator_micro_gaps"):
            context_parts.append("\nSpecific Micro-Indicator Gaps (from SDG_3_25.csv / SDG_13_18.csv):")
            for ind in gaps_data["indicator_micro_gaps"]:
                status_str = "Met" if ind["Target_Met"] else "UNMET"
                context_parts.append(
                    f"- [{ind['SDG']}] {ind['Indicator']}: Latest Value = {ind['Latest_Value']} {ind['Unit']} (Target = {ind['Target']} {ind['Unit']}, Status: {status_str}, Gap: {ind['Gap_Display']})"
                )

        # 3. Phased 2026 Departmental Action Plan
        context_parts.append("\n### 3. EVIDENCE-LINKED 2026 ACTION PLAN:")
        for act in action_plan.get("actions", []):
            context_parts.append(
                f"- [{act['tier']}] ID: {act['id']} | SDG: {act['sdg']}\n"
                f"  Problem: {act['problem']}\n"
                f"  Evidence: {act['evidence']}\n"
                f"  Intervention: {act['recommended_intervention']}\n"
                f"  Steps: {'; '.join(act['implementation_steps'])}\n"
                f"  Department: {act['responsible_department']}\n"
                f"  KPI & Target: Baseline: {act['baseline']} -> 2026 Target: {act['target_2026']}\n"
                f"  Type: {act['evidence_type']}"
            )

        # 4. Multi-Year Forecasts & Scenarios (2024 to 2030)
        context_parts.append("\n### 4. MULTI-YEAR FORECAST HORIZONS & SCENARIO ANALYSIS (2024, 2025, 2026, 2027, 2028, 2029, 2030):")
        for sc_key, sc_data in scenarios.get("scenarios", {}).items():
            context_parts.append(
                f"- {sc_data['name']}:\n"
                f"  Projections: {sc_data['projections']}\n"
                f"  Key Assumptions: {'; '.join(sc_data['assumptions'])}\n"
                f"  Limitations: {sc_data.get('limitations', 'Standard model uncertainty.')}"
            )

        # 5. Retrieved Document Passages
        context_parts.append("\n### 5. RETRIEVED VERIFIED POLICY DOCUMENTS (From ChromaDB Vector Store):")
        if not passages:
            context_parts.append("(No specific policy passages retrieved for this query. The assistant must state that document evidence is limited.)")
        else:
            for idx, p in enumerate(passages, 1):
                context_parts.append(
                    f"\n[Source {idx}] Title: {p['title']} | File: {p['document']} | Page: {p['page']} | SDG: {p['sdg']}\n"
                    f"Excerpt:\n\"{p['text']}\""
                )

        return "\n".join(context_parts)

    def _execute_gemini_generation(self, user_prompt: str, system_context: str) -> str:
        """Calls Google GenAI API with grounded instructions."""
        system_instruction = (
            "You are the Senior NITI Aayog SDG Policy Advisor, Lead ML Engineer, and Data Scientist.\n"
            "STRICT FACTUAL GROUNDING RULES:\n"
            "1. Ground your response STRICTLY in the provided FACTUAL QUANTITATIVE DATA, GAP ANALYSIS, 2026 ACTION PLAN, SCENARIO FORECASTS, and RETRIEVED VERIFIED POLICY DOCUMENTS.\n"
            "2. Whenever mentioning policies, interventions, or case studies, cite the source precisely using bracket format, e.g., '[Doc: Title, Page X]' or '[Source N]'.\n"
            "3. Cite exact score numbers, years, and historical/forecast deltas from the data. Do NOT alter numerical values or claim a calculation was performed if it was not.\n"
            "4. Structure your response to directly address the user's questions with readable headings (H3/H4), bullet points, and clear sections.\n"
            "5. Clearly distinguish between observed historical data, model forecasts (2024, 2025, 2026, 2027, 2028, 2029, 2030), and hypothetical policy scenarios.\n"
            "6. Never claim a policy caused a score change merely because they co-occurred.\n"
            "7. If data or evidence is missing for an indicator, state that transparently.\n"
            "8. When asked for a comprehensive assessment, address all 7 core analytical dimensions:\n"
            "   (1) Current SDG status\n"
            "   (2) Goals & indicators below target, worsening, or stagnant\n"
            "   (3) Biggest gaps & resource priority\n"
            "   (4) Practical 2026 departmental action plan\n"
            "   (5) 2027, 2028, and 2030 baseline forecasts\n"
            "   (6) Realistic improvement vs higher-effort scenarios\n"
            "   (7) Supporting evidence & verified citations."
        )

        full_prompt = f"{system_context}\n\nUser Question:\n{user_prompt}"

        try:
            if self._gemini_client is None:
                self._init_gemini()

            response = self._gemini_client.models.generate_content(
                model=self.model_name,
                contents=full_prompt,
                config={
                    "system_instruction": system_instruction,
                    "temperature": 0.2,
                    "max_output_tokens": 3000
                }
            )
            return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini API generation error: {e}")
            raise e

    def _generate_local_grounded_answer(
        self, 
        action_type: str, 
        state: str, 
        sdg: str, 
        metrics: Dict[str, Any], 
        passages: List[Dict[str, Any]], 
        user_question: str,
        gaps_data: Dict[str, Any],
        action_plan: Dict[str, Any],
        scenarios: Dict[str, Any]
    ) -> str:
        """
        Generates an honest, fact-grounded response directly from real computed analytics,
        gap calculations, action plans, and ChromaDB vector passages when offline.
        """
        sdg_name = metrics.get("sdg_title", sdg)
        s23 = metrics.get("2023_score", "N/A")
        vel = metrics.get("annual_velocity", 0.0)
        peer = metrics.get("top_peer_state", "Kerala")

        lines = [
            f"> [!NOTE]\n> **Local RAG & Quantitative Mode Active**: Displaying real computed gap analytics, 2026 action plans, Random Forest forecasts (2024-2030), and ChromaDB citations.\n",
            f"### Comprehensive SDG Policy Intelligence Report: {state}\n"
        ]

        # 1. Current Status
        lines.append("#### 1. Current SDG Status & Longitudinal Baseline")
        for g_k, g_v in gaps_data.get("goal_summaries", {}).items():
            lines.append(f"- **{g_v['sdg_title']}**: **{g_v['2023_score']} points** in 2023 ({g_v['status']}). 5-year change: **{'+' if g_v['5yr_change'] >= 0 else ''}{g_v['5yr_change']} pts** (Annual velocity: **{g_v['annual_velocity']} pts/yr**).")
        lines.append(f"- **National Benchmarking**: In 2023, India national average was {metrics.get('national_avg_2023', 'N/A')}. Benchmark peer: **{peer}** ({metrics.get('top_peer_score_2026', 'N/A')} pts projected in 2026).\n")

        # 2. Gaps & Unmet Targets
        lines.append("#### 2. Prioritized Gaps & Below-Target Indicators")
        lines.append("| Goal / Indicator | Latest Value | Target | Gap / Deficit | Trend | Priority Reason |")
        lines.append("| :--- | :--- | :--- | :--- | :--- | :--- |")
        for gap in gaps_data.get("priority_gaps_table", []):
            lines.append(f"| **{gap['SDG']}** | {gap['Latest_Value']} | {gap['Target_Benchmark']} | {gap['Gap_to_Target']} pts | {gap['Trend']} | {gap['Priority_Reason']} |")
        
        for mg in gaps_data.get("indicator_micro_gaps", [])[:3]:
            lines.append(f"| {mg['Indicator'][:32]}... | {mg['Latest_Value']} {mg['Unit']} | {mg['Target']} {mg['Unit']} | {mg['Gap_Display']} | Metric Gap | Priority Score: {mg['Priority_Score']} |")
        lines.append("")

        # 3. 2026 Departmental Action Plan
        lines.append("#### 3. Prioritized 2026 Departmental Action Plan")
        for act in action_plan.get("actions", [])[:3]:
            lines.append(f"**[{act['tier']}] {act['sdg']}**")
            lines.append(f"- **Responsible Department**: {act['responsible_department']}")
            lines.append(f"- **Recommended Intervention**: {act['recommended_intervention']}")
            lines.append(f"- **Key Implementation Step**: {act['implementation_steps'][0]}")
            lines.append(f"- **Measurable KPI**: Baseline: {act['baseline']} → 2026 Target: **{act['target_2026']}** ({act['monitoring_frequency']})")
            lines.append(f"- **Evidence**: {act['evidence']} *({act['evidence_type']})*\n")

        # 4. Multi-Year Forecasts & Scenario Analysis
        hist_baseline = scenarios.get("historical_2023_baseline", "N/A")
        hist_str = f"{float(hist_baseline):.1f}" if isinstance(hist_baseline, (int, float)) else str(hist_baseline)
        lines.append("#### 4. Extended Forecasts (2024–2030) & Improvement Scenarios")
        lines.append(f"**State**: {state} | **Target Goal**: {sdg_name} | **Historical Baseline Year**: 2023 ({hist_str} pts) | **Horizon**: 2024–2030\n")
        lines.append("| Scenario Horizon | 2024 | 2025 | 2026 | 2027 | 2028 | 2029 | 2030 | Key Assumptions |")
        lines.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |")

        def _fmt_val(p_dict, yr):
            val = p_dict.get(yr) if yr in p_dict else p_dict.get(str(yr))
            if val is None:
                return "N/A — data unavailable"
            try:
                return f"{float(val):.1f}"
            except (ValueError, TypeError):
                return str(val)

        for sc_k, sc_v in scenarios.get("scenarios", {}).items():
            p = sc_v.get("projections", {})
            sc_display = sc_v.get("name", sc_k)
            if ":" in sc_display:
                sc_display = sc_display.split(":")[1].strip()
            first_assump = sc_v.get("assumptions", ["Model continuation assumptions."])[0]
            lines.append(f"| **{sc_display}** | {_fmt_val(p, 2024)} | {_fmt_val(p, 2025)} | {_fmt_val(p, 2026)} | {_fmt_val(p, 2027)} | {_fmt_val(p, 2028)} | {_fmt_val(p, 2029)} | {_fmt_val(p, 2030)} | {first_assump} |")
        lines.append("")

        # 5. Citations
        lines.append("#### 5. Supporting Document Citations")
        if passages:
            for idx, p in enumerate(passages[:3], 1):
                lines.append(f"- **[Doc: {p['title']}, Page {p['page']}]**: \"{p['text'][:220]}...\"")
        else:
            lines.append("- *(ChromaDB policy index loaded across 4 official reference compendiums)*")

        return "\n".join(lines)

    def process_query(
        self,
        question: str,
        state: str = "Tamil Nadu",
        sdg: str = "SDG3_Health",
        action_type: str = "general",
        peer_state: Optional[str] = None,
        simulation_input: Optional[str] = None,
        history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Main entry point for AI Policy Assistant queries.
        Retrieves real gap analytics, 2026 action plan, multi-year scenario forecasts,
        and vector passages from ChromaDB before synthesizing with Gemini.
        """
        state = state.strip() if state else "Tamil Nadu"
        sdg = sdg.strip() if sdg else "SDG3_Health"
        if sdg not in SDG_MAP and sdg in SDG_SHORT_KEYS:
            sdg = SDG_SHORT_KEYS[sdg]

        # 1. Compute Real Analytics First
        metrics = self.datastore.get_metrics(state, sdg)
        gaps_data = compute_state_sdg_gaps(state)
        action_plan = generate_2026_action_plan(state)
        scenarios = generate_scenario_forecasts(state, sdg)

        # 2. Vector Evidence Retrieval from ChromaDB
        search_query = question
        if action_type == "peer_state" and peer_state:
            search_query += f" compare {state} and {peer_state} policies"
        elif action_type == "score_context":
            search_query += f" {state} historical health education climate policy reforms"
        elif action_type == "recommendations" or action_type == "action_plan_2026":
            search_query += f" 2026 action plan interventions for {sdg} in {state}"
        elif action_type == "gap_analysis":
            search_query += f" targets gaps {sdg} indicators {state}"
        elif action_type == "simulate":
            search_query += f" policy impact intervention {simulation_input or question}"
        elif action_type == "comprehensive_audit":
            search_query += f" {state} SDG targets indicators health education climate policy compendium"

        retrieved_passages = self.kb.retrieve(search_query, state=state, sdg=sdg, n_results=4)

        # 3. Format citations for return
        citations = []
        for p in retrieved_passages:
            citations.append({
                "document": p["document"],
                "title": p["title"],
                "page": p["page"],
                "sdg": p["sdg"],
                "state": p["state"],
                "excerpt": p["text"][:220] + "..." if len(p["text"]) > 220 else p["text"]
            })

        # 4. Check if Gemini is configured
        self._init_gemini()
        is_configured = self.is_gemini_configured()

        if is_configured:
            rag_status = "online"
            try:
                system_context = self._build_grounding_context(
                    state, sdg, metrics, retrieved_passages, gaps_data, action_plan, scenarios
                )
                answer = self._execute_gemini_generation(question, system_context)
                error_msg = None
            except Exception as e:
                logger.error(f"Gemini execution failed: {e}. Falling back to verified local RAG synthesis.")
                rag_status = "error"
                error_msg = f"Gemini API request failed ({str(e)}). Displaying verified analytical results."
                answer = self._generate_local_grounded_answer(
                    action_type, state, sdg, metrics, retrieved_passages, question, gaps_data, action_plan, scenarios
                )
        else:
            rag_status = "key_missing"
            error_msg = "GEMINI_API_KEY is not configured in .env. Showing local verified analytics & trajectory."
            answer = self._generate_local_grounded_answer(
                action_type, state, sdg, metrics, retrieved_passages, question, gaps_data, action_plan, scenarios
            )

        return {
            "success": True,
            "answer": answer,
            "citations": citations,
            "retrieved_count": len(citations),
            "rag_status": rag_status,
            "model": self.model_name if is_configured else "Local Analytics & RAG Engine",
            "state": state,
            "sdg": sdg,
            "gap_analysis": gaps_data,
            "action_plan": action_plan,
            "scenarios": scenarios,
            "structured_metrics": {
                "historical_scores": metrics.get("historical_scores"),
                "2023_score": metrics.get("2023_score"),
                "forecast_scores": metrics.get("forecast_scores"),
                "2026_forecast": metrics.get("2026_forecast"),
                "annual_velocity": metrics.get("annual_velocity"),
                "tier_2026": metrics.get("tier_2026"),
                "top_peer_state": metrics.get("top_peer_state"),
                "top_peer_score_2026": metrics.get("top_peer_score_2026")
            },
            "error": error_msg
        }


# Singleton instance
_rag_engine_instance = None

def get_rag_engine() -> SDGRagEngine:
    global _rag_engine_instance
    if _rag_engine_instance is None:
        _rag_engine_instance = SDGRagEngine()
    return _rag_engine_instance
