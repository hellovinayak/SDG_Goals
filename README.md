# Predictive Dashboard for SDG Performance Monitoring & Policy Intelligence

> **BCSE497J: Project I — Vellore Institute of Technology (VIT) Chennai Campus**  
> **Team:** Sakhi Telang (23BAI1105) · Akhilesh Deshmukh (23BRS1149) · Vinayak Rathod (23BCE1747)  
> **Faculty Guide:** Dr. Sureshkumar WI, Associate Professor (SCOPE)

---

## 📌 Overview

This repository hosts the **SDG Predictive Performance Monitoring Dashboard**, combining machine learning trajectory forecasting (Random Forest Regressor) with an evidence-grounded **Retrieval-Augmented Generation (RAG)** Policy Intelligence layer for Indian States and Union Territories across:
- **SDG 3**: Good Health & Well-Being
- **SDG 4**: Quality Education
- **SDG 13**: Climate Action

The system integrates longitudinal NITI Aayog historical data (2018–2023), forward ML predictions (2024–2026), and a floating **SDG Policy AI Assistant** grounded in ChromaDB vector document retrieval and Google's Gemini GenAI API.

---

## 🚀 Key Features

1. **Longitudinal Trajectory Forecaster**:
   - Random Forest model projections through 2026 with 95% confidence intervals and growth velocity metrics.
2. **Early Warning Risk Matrix**:
   - Automated threshold breach detection for states at risk of falling into the Aspirant category (<50 points).
3. **Spatial & Comparative Analytics**:
   - Comparative multi-state trajectories and national benchmarking across 36 States/UTs.
4. **Floating AI Policy Assistant & Popup Chat**:
   - Fixed floating button in bottom-right with pulse animation and "Ask AI" label.
   - Smooth slide-up glassmorphic chat interface.
   - **Score Context Engine**: Explains historical and forecasted score changes using exact metrics and policy records.
   - **Cross-State Advisor**: Benchmarks target state against peer leaders (e.g., Kerala, Tamil Nadu, Himachal Pradesh) and extracts transferable interventions.
   - **Policy Recommendations**: Surfaces targeted programs with implementation prerequisites and resource challenges.
   - **Policy Simulation**: Evaluates hypothetical programmatic interventions on forward scores.
5. **Real RAG Pipeline**:
   - **PyMuPDF (`fitz`)**: Extracts text page-by-page from multi-page policy PDFs.
   - **ChromaDB**: Local persistent vector database with ONNX sentence embeddings.
   - **Structured Data Integration**: Fuses raw CSV indicators with semantic vector citations.
   - **Factual Grounding**: Strict system guardrails prevent hallucinations; every claim cites document and page number.
   - **Google Gemini GenAI SDK**: Integrates `google-genai` for multi-turn generative policy reasoning.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.9+, FastAPI, Uvicorn, Pydantic
- **ML & Data**: Scikit-Learn (Random Forest), Pandas, NumPy, SciPy
- **Vector & RAG**: ChromaDB, PyMuPDF (fitz), Python-Dotenv
- **GenAI**: Google GenAI SDK (`google-genai` / Gemini 2.5 Flash)
- **Frontend**: Vanilla JavaScript (ES6+), Modern Glassmorphism CSS, Chart.js, Lucide Icons

---

## 📦 Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/hellovinayak/SDG-Dashboard-.git
cd SDG-Dashboard-
```

### 2. Set up virtual environment and install dependencies
```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configure Environment Variables (Optional for Live Gemini GenAI)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and add your Google Gemini API key:
```ini
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
CHROMA_DB_DIR=./data/chroma_db
```
> **Note**: If `GEMINI_API_KEY` is not provided, the dashboard automatically runs in **Local RAG Mode**, utilizing ChromaDB vector search and deterministic Random Forest metrics without breaking or throwing errors.

---

## ▶️ Running the Application

### Option A: Using the Launch Script (Recommended)
```bash
./run.sh
```

### Option B: Running Manually
```bash
source venv/bin/activate
python server.py
```

The interactive dashboard will be live at:
**[http://localhost:8000](http://localhost:8000)**

---

## 📡 REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves main interactive dashboard |
| `GET` | `/api/initial-data` | Baseline historical scores (2018–2023), forecasts, KPIs, and validation metrics |
| `GET` | `/api/analytics/state/{state}` | Empirical indicator-level gap analysis, velocity, and 2026 Departmental Action Plan |
| `GET` | `/api/forecasts/extended/{state}` | Multi-year projections (2024–2030) across Baseline, Realistic, and Higher-Effort scenarios |
| `GET` | `/api/audit-report` | Full machine-readable data inventory covering all 16 CSV spreadsheets |
| `GET` | `/api/policy/{state}` | Rule-based policy playbook for a specific state |
| `GET` | `/api/ai-policy/status` | Vector store index status and Gemini GenAI configuration |
| `POST` | `/api/ai-policy` | Grounded multi-action query to the SDG Policy Assistant (`comprehensive_audit`, `gap_analysis`, `action_plan_2026`, `extended_forecasts`, etc.) |
| `GET` | `/api/export/{dataset}` | Exports CSV files (`projections`, `historical`, `validation`, `health`, `climate`) |

---

## 🧪 Automated Test Suite

A comprehensive 20-test automated verification suite is included in `tests/test_sdg_system.py`:
- **Data Ingestion & Integrity**: Verifies 36 States/UTs + India coverage, 2018–2023 time series, and that missing indicator values are preserved as NaN (never fabricated as zero).
- **SDG Gap Analysis**: Verifies latest 2023 values, target gaps (MMR, U5MR, Immunization, Renewable Energy), and strict isolation of SDG 3 from SDG 4 and 13.
- **2026 Action Plan**: Verifies phased actions, responsible departments (Health & Family Welfare / TNMSC, School Education / Samagra Shiksha, Environment & Climate / TNGCC), baseline KPIs, 2026 targets, and document citations.
- **Extended Forecasting (2024–2030)**: Validates Random Forest projections, chronological momentum dampening (0.85^(h-1)), tree variance 95% CIs, and scenario hierarchies (Higher-Effort >= Realistic >= Baseline).
- **RAG Engine & Grounding**: Tests semantic chunk retrieval from ChromaDB and strict evidence citation.
- **REST API Endpoints**: Tests all HTTP endpoints against the live backend.

Run the test suite with:
```bash
./venv/bin/python tests/test_sdg_system.py
```

---

## 📚 Indexed Policy Documents & Refreshing Indexes

The RAG engine indexes official policy documentation located in `data/documents/`:
- `niti_aayog_sdg_state_policy_compendium.pdf`: Multi-page official compendium of state health, education, and climate policy case studies (extracted via PyMuPDF).
- `sdg3_national_health_mission_framework.txt`: National Health Mission (NHM), Ayushman Bharat PM-JAY, HWCs.
- `sdg4_quality_education_nep_framework.txt`: NEP 2020, Samagra Shiksha, NIPUN Bharat, and state education initiatives.
- `sdg13_climate_action_sapcc_framework.txt`: NAPCC, SAPCC, PM-KUSUM, PM Surya Ghar, disaster resilience.

To re-index policy documents into ChromaDB:
```bash
./venv/bin/python -c "from src.rag_engine import get_rag_engine; e = get_rag_engine(); print(e.get_status())"
```

---

## ⚠️ Methodological Notes & Limitations

1. **Missing Data Policy**: Missing historical values are preserved as null/NaN; the pipeline never imputes zero for unmeasured indicators.
2. **Multi-Year Extrapolation**: Random Forest models are trained on chronological holdouts (2018–2021 train, 2022–2023 validation). Multi-year extrapolations to 2027, 2028, and 2030 use damped momentum (0.85^(h-1)) and tree variance to prevent unphysical explosive growth.
3. **Illustrative Scenarios vs. Causal Claims**: Scenarios B (Realistic Improvement) and C (Higher-Effort) illustrate the sensitivity of composite scores to accelerated indicator achievement; they are policy bounding exercises and not guaranteed causal predictions.