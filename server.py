"""
server.py
High-Performance FastAPI Server & REST API for SDG Predictive Monitoring Dashboard
BCSE497J: Project I - VIT University Chennai Campus
Serves modern interactive frontend and real-time ML forecast endpoints.
"""

import os
import sys
import io
import pandas as pd
import numpy as np
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Ensure local src package is on path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from src.rag_engine import get_rag_engine
from src.data_loader import (
    load_sdg_data, 
    STATES_AND_UTS, 
    load_health_indicators, 
    load_climate_indicators
)
from src.gap_analysis import compute_state_sdg_gaps
from src.action_planner import generate_2026_action_plan
from src.model_engine import (
    train_and_validate_models, 
    generate_forecasts, 
    get_complete_timeseries,
    generate_scenario_forecasts,
    SDG_TARGETS
)
from src.risk_classifier import (
    enrich_with_risk_labels, 
    get_early_warning_alerts,
    classify_score
)
from src.policy_insights import (
    generate_state_policy_advisory,
    get_national_policy_priorities
)

app = FastAPI(
    title="SDG Predictive Monitoring Dashboard API",
    description="Machine Learning Forecasting & Risk Analytics Engine for India SDGs (BCSE497J Project I)",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory cache
DATA_CACHE = {}

def get_pipeline_cache():
    if "timeseries" not in DATA_CACHE:
        hist_df = load_sdg_data()
        trained_models, val_df = train_and_validate_models()
        fore_df = generate_forecasts(trained_models)
        fore_enriched = enrich_with_risk_labels(fore_df, score_col="Forecast_Score")
        timeseries_df, _, _ = get_complete_timeseries(models=trained_models, df_fore=fore_df)
        early_warnings = get_early_warning_alerts(fore_enriched, hist_df)
        health_ind = load_health_indicators()
        clim_ind = load_climate_indicators()

        slopes = {}
        for (st, sdg), minfo in trained_models.items():
            slopes[f"{st}__{sdg}"] = {
                "slope": minfo["slope"],
                "intercept": minfo["intercept"],
                "std_err": minfo["std_err"],
                "r2": minfo["full_r2"]
            }

        DATA_CACHE["historical"] = hist_df
        DATA_CACHE["models"] = trained_models
        DATA_CACHE["validation"] = val_df
        DATA_CACHE["forecast"] = fore_enriched
        DATA_CACHE["timeseries"] = timeseries_df
        DATA_CACHE["early_warnings"] = early_warnings
        DATA_CACHE["slopes"] = slopes
        DATA_CACHE["health_ind"] = health_ind
        DATA_CACHE["clim_ind"] = clim_ind

    return DATA_CACHE

@app.on_event("startup")
def startup_event():
    get_pipeline_cache()
    try:
        get_rag_engine()
    except Exception as e:
        print(f"Warning: RAG engine warmup failed: {e}")

@app.get("/api/initial-data")
def get_initial_data():
    cache = get_pipeline_cache()
    hist_df = cache["historical"]
    fore_df = cache["forecast"]
    val_df = cache["validation"]
    ts_df = cache["timeseries"]
    ew_df = cache["early_warnings"]
    health_df = cache["health_ind"]
    clim_df = cache["clim_ind"]

    states = sorted(list(hist_df["State"].unique()))

    # Calculate National KPIs per year
    kpis = {}
    for yr in [2024, 2025, 2026]:
        sub_fore = fore_df[fore_df["Year"] == yr]
        hist_23 = hist_df[hist_df["Year"] == 2023]

        s3_tgt = float(sub_fore[sub_fore["SDG"] == "SDG3_Health"]["Forecast_Score"].mean())
        s4_tgt = float(sub_fore[sub_fore["SDG"] == "SDG4_Education"]["Forecast_Score"].mean())
        s13_tgt = float(sub_fore[sub_fore["SDG"] == "SDG13_Climate"]["Forecast_Score"].mean())

        s3_delta = s3_tgt - float(hist_23["SDG3_Health"].mean())
        s4_delta = s4_tgt - float(hist_23["SDG4_Education"].mean())
        s13_delta = s13_tgt - float(hist_23["SDG13_Climate"].mean())

        high_risk_states = list(sub_fore[sub_fore["Forecast_Score"] < 50]["State"].unique())

        kpis[yr] = {
            "sdg3_avg": round(s3_tgt, 1),
            "sdg3_delta": round(s3_delta, 1),
            "sdg4_avg": round(s4_tgt, 1),
            "sdg4_delta": round(s4_delta, 1),
            "sdg13_avg": round(s13_tgt, 1),
            "sdg13_delta": round(s13_delta, 1),
            "high_risk_count": len(high_risk_states),
            "high_risk_states": high_risk_states
        }

    # Aggregate validation scorecard
    val_agg = val_df.groupby("SDG").agg(
        mean_rmse=("RMSE", "mean"),
        mean_mae=("MAE", "mean"),
        mean_r2=("R2", "mean"),
        naive_beaten_pct=("Naive_Beaten", lambda x: round(float(x.mean() * 100), 1))
    ).reset_index()

    return {
        "states": states,
        "sdg_targets": SDG_TARGETS,
        "sdg_labels": {
            "SDG3_Health": "SDG 3: Good Health & Well-Being",
            "SDG4_Education": "SDG 4: Quality Education",
            "SDG13_Climate": "SDG 13: Climate Action"
        },
        "kpis": kpis,
        "timeseries": ts_df.to_dict(orient="records"),
        "historical": hist_df.to_dict(orient="records"),
        "forecast": fore_df.to_dict(orient="records"),
        "early_warnings": ew_df.to_dict(orient="records"),
        "validation_records": val_df.to_dict(orient="records"),
        "validation_summary": val_agg.to_dict(orient="records"),
        "slopes": cache["slopes"],
        "health_indicators": health_df.fillna("").to_dict(orient="records") if not health_df.empty else [],
        "climate_indicators": clim_df.fillna("").to_dict(orient="records") if not clim_df.empty else []
    }

@app.get("/api/policy/{state_name}")
def get_state_policy(state_name: str):
    cache = get_pipeline_cache()
    hist_df = cache["historical"]
    fore_df = cache["forecast"]
    trained_models = cache["models"]

    st_hist = hist_df[hist_df["State"] == state_name]
    if st_hist.empty:
        raise HTTPException(status_code=404, detail=f"State '{state_name}' not found")

    latest_23_dict = st_hist.sort_values("Year").iloc[-1].to_dict()
    fore_26_sub = fore_df[(fore_df["State"] == state_name) & (fore_df["Year"] == 2026)]
    proj_26_dict = {row["SDG"]: row["Forecast_Score"] for _, row in fore_26_sub.iterrows()}
    slopes_dict = {k: trained_models.get((state_name, k), {}).get("slope", 0.0) for k in SDG_TARGETS}

    advisory = generate_state_policy_advisory(state_name, latest_23_dict, proj_26_dict, slopes_dict)
    return advisory

@app.get("/api/export/{dataset_name}")
def export_csv(dataset_name: str):
    cache = get_pipeline_cache()
    if dataset_name == "projections":
        df = cache["forecast"]
        filename = "sdg_india_projections_2024_2026.csv"
    elif dataset_name == "historical":
        df = cache["historical"]
        filename = "niti_aayog_sdg_historical_2018_2023.csv"
    elif dataset_name == "validation":
        df = cache["validation"]
        filename = "sdg_model_validation_scorecard.csv"
    elif dataset_name == "health":
        df = cache["health_ind"]
        filename = "sdg3_health_indicators.csv"
    elif dataset_name == "climate":
        df = cache["clim_ind"]
        filename = "sdg13_climate_indicators.csv"
    else:
        raise HTTPException(status_code=400, detail="Invalid dataset name")

    csv_data = df.to_csv(index=False)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

class AIPolicyRequest(BaseModel):
    question: str
    state: Optional[str] = "Tamil Nadu"
    sdg: Optional[str] = "SDG3_Health"
    action_type: Optional[str] = "general"
    peer_state: Optional[str] = None
    simulation_input: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None

@app.get("/api/ai-policy/status")
def get_ai_policy_status():
    """Returns vector store indexing state and Gemini model readiness."""
    try:
        engine = get_rag_engine()
        return engine.get_status()
    except Exception as e:
        return {
            "gemini_configured": False,
            "model": "Error",
            "documents_indexed": 0,
            "chunks_indexed": 0,
            "documents": [],
            "error": str(e)
        }

@app.post("/api/ai-policy")
def post_ai_policy(req: AIPolicyRequest):
    """Processes user query through ChromaDB vector retrieval, structured data grounding, and Gemini GenAI."""
    try:
        engine = get_rag_engine()
        result = engine.process_query(
            question=req.question,
            state=req.state or "Tamil Nadu",
            sdg=req.sdg or "SDG3_Health",
            action_type=req.action_type or "general",
            peer_state=req.peer_state,
            simulation_input=req.simulation_input,
            history=req.history
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Policy query failed: {str(e)}")

@app.get("/api/analytics/state/{state_name}")
def get_state_analytics(state_name: str):
    """Returns comprehensive empirical gap analysis, unmet targets, and 2026 action plan for a state."""
    try:
        gaps = compute_state_sdg_gaps(state_name)
        action_plan = generate_2026_action_plan(state_name)
        return {
            "state": state_name,
            "gaps": gaps,
            "action_plan": action_plan
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not compute analytics for {state_name}: {str(e)}")

@app.get("/api/forecasts/extended/{state_name}")
def get_extended_forecasts(state_name: str):
    """Returns 2024-2030 forecasts across Baseline, Improvement, and Higher-Effort scenarios."""
    try:
        cache = get_pipeline_cache()
        trained_models = cache.get("models")
        results = {}
        for sdg in SDG_TARGETS:
            sc = generate_scenario_forecasts(state_name, sdg, trained_models=trained_models)
            results[sdg] = sc
        return {
            "state": state_name,
            "horizon_years": [2024, 2025, 2026, 2027, 2028, 2029, 2030],
            "scenarios_by_sdg": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not compute extended forecasts for {state_name}: {str(e)}")

@app.get("/api/audit-report")
def get_audit_report():
    """Returns machine-readable Phase 1 data inventory and quality audit."""
    import json
    report_path = os.path.join(BASE_DIR, "reports", "data_inventory.json")
    if os.path.exists(report_path):
        with open(report_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"message": "Data audit inventory not found."}

# Serve static frontend
STATIC_DIR = os.path.join(BASE_DIR, "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/", response_class=HTMLResponse)
def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>SDG Predictive Monitoring Dashboard API Online</h1><p>Building frontend...</p>"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
