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
from fastapi.responses import HTMLResponse, FileResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import csv
import time
import traceback

# ── ESP32 Configuration ──
ESP32_BASE_URL = os.environ.get("ESP32_URL", "http://192.168.4.1")
ESP32_TIMEOUT = 4  # seconds

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

# ═══════════════════════════════════════════════════════════
# ESP32 PROXY ENDPOINTS  (avoids browser CORS issues)
# ═══════════════════════════════════════════════════════════
import urllib.request
import urllib.error
import re as _re
import json as _json

ESP32_BASE_URL = os.environ.get("ESP32_URL", "http://192.168.4.1")
ESP32_TIMEOUT = int(os.environ.get("ESP32_TIMEOUT", "5"))

_esp32_discovered_endpoints = []
_esp32_inspected_html = False
_last_known_soil_raw = 0.0

NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

def _fetch_esp32(path: str, timeout: int = ESP32_TIMEOUT) -> bytes:
    """Low-level GET to ESP32 with cache-busting and no-cache headers."""
    sep = "&" if "?" in path else "?"
    url = f"{ESP32_BASE_URL}{path}{sep}_nocache={int(time.time() * 1000)}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (SDG-Dashboard-Proxy/1.0)",
            "Accept": "*/*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()

def _safe_float(v):
    if v is None:
        return None
    try:
        s = str(v).strip().strip('"').strip("'")
        if not s or s.lower() in ("nan", "null", "none", "-", "—"):
            return None
        return float(s)
    except (ValueError, TypeError):
        return None

def _first_valid(*vals):
    """Returns the first non-None value, properly preserving 0 and 0.0."""
    for v in vals:
        if v is not None and v != "":
            return v
    return None

def _inspect_esp32_root_html():
    """Inspects root HTML / script on ESP32 to discover API routes."""
    global _esp32_inspected_html, _esp32_discovered_endpoints
    if _esp32_inspected_html:
        return _esp32_discovered_endpoints

    try:
        raw_html = _fetch_esp32("/", timeout=3).decode("utf-8", errors="replace")
        _esp32_inspected_html = True
        patterns = _re.findall(r'["\'](/[\w\-_]+)["\']', raw_html)
        discovered = []
        for p in patterns:
            if p not in ("/", "/download") and not p.endswith((".css", ".js", ".png", ".ico", ".jpg")):
                if p not in discovered:
                    discovered.append(p)
        _esp32_discovered_endpoints = discovered
        print(f"[ESP32 Proxy] Discovered endpoints on ESP32 root HTML: {_esp32_discovered_endpoints}", flush=True)
        return discovered
    except Exception:
        return []

def _parse_csv_text(text: str) -> list:
    """
    Parses CSV text by column index position:
      Col 0: uptime (seconds)
      Col 1: temp / temperature (°C)
      Col 2: humidity (%)
      Col 3: pressure (hPa)
      Col 4: soilPercent (%)
      Col 5: soilRaw (Raw ADC)
    Filters empty lines and trims trailing whitespace.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []

    # Check if first row is a header row (has alphabetic letters)
    first_line = lines[0]
    has_header = any(c.isalpha() for c in first_line)
    data_lines = lines[1:] if has_header else lines

    parsed_rows = []
    for line in data_lines:
        cols = [c.strip() for c in line.split(",")]
        if len(cols) < 2:
            continue

        uptime = _safe_float(cols[0]) if len(cols) > 0 else None
        temp = _safe_float(cols[1]) if len(cols) > 1 else None
        hum = _safe_float(cols[2]) if len(cols) > 2 else None
        pres = _safe_float(cols[3]) if len(cols) > 3 else None
        soil_pct = _safe_float(cols[4]) if len(cols) > 4 else None
        raw_val = _safe_float(cols[5]) if len(cols) > 5 else 0.0
        if raw_val is None:
            raw_val = 0.0
        global _last_known_soil_raw
        _last_known_soil_raw = raw_val

        row = {
            "uptime": uptime,
            "temperature": temp,
            "temp": temp,
            "humidity": hum,
            "pressure": pres,
            "soilPercent": soil_pct,
            "soilRaw": raw_val,
        }
        parsed_rows.append(row)
    return parsed_rows

def _pick_latest_reading(rows: list) -> dict:
    """
    Picks the row with largest uptime (or last row) as the current live reading.
    """
    if not rows:
        return {}
    rows_with_uptime = [r for r in rows if r.get("uptime") is not None]
    if rows_with_uptime:
        return max(rows_with_uptime, key=lambda r: r["uptime"])
    return rows[-1]

@app.get("/api/esp32/data")
def get_esp32_data():
    """Proxy live sensor readings from the ESP32.
    Strategy:
      1. Try JSON endpoints (discovered or /data).
      2. Parse /download CSV by column index position, picking largest uptime.
    """
    ts_now = time.time()

    # Discover endpoints from root HTML if not done yet
    discovered = _inspect_esp32_root_html()

    # ── Attempt 1: Check known JSON endpoints (/data, /live, /readings, etc.) ──
    candidate_json_paths = ["/data"]
    for ep in discovered:
        if ep not in candidate_json_paths:
            candidate_json_paths.append(ep)

    for path in candidate_json_paths:
        try:
            raw = _fetch_esp32(path, timeout=3)
            payload = _json.loads(raw)
            if isinstance(payload, dict):
                t = _safe_float(_first_valid(payload.get("temperature"), payload.get("temp"), payload.get("t")))
                h = _safe_float(_first_valid(payload.get("humidity"), payload.get("hum"), payload.get("h")))
                p = _safe_float(_first_valid(payload.get("pressure"), payload.get("pres"), payload.get("p")))
                s = _safe_float(_first_valid(payload.get("soilPercent"), payload.get("soil"), payload.get("s")))
                r = _safe_float(_first_valid(payload.get("soilRaw"), payload.get("raw"), payload.get("adc")))
                up = _safe_float(_first_valid(payload.get("uptime"), payload.get("up"), payload.get("time")))
                if r is None:
                    r = _last_known_soil_raw

                if any(v is not None for v in (t, h, p, s)):
                    norm_data = {
                        "uptime": up,
                        "temperature": t,
                        "temp": t,
                        "humidity": h,
                        "pressure": p,
                        "soilPercent": s,
                        "soilRaw": r,
                    }
                    print(f"[ESP32 Proxy] Live data via JSON {path}: {norm_data}", flush=True)
                    return JSONResponse(
                        content={
                            "connected": True,
                            "source": f"json:{path}",
                            "timestamp": ts_now,
                            "data": norm_data,
                        },
                        headers=NO_CACHE_HEADERS
                    )
        except Exception:
            continue

    # ── Attempt 2: CSV /download fallback ──
    try:
        raw = _fetch_esp32("/download", timeout=ESP32_TIMEOUT)
        text = raw.decode("utf-8", errors="replace").strip()
        parsed_rows = _parse_csv_text(text)
        if not parsed_rows:
            return JSONResponse(
                content={
                    "connected": True,
                    "source": "csv_empty",
                    "timestamp": ts_now,
                    "data": {},
                    "rows": 0,
                },
                headers=NO_CACHE_HEADERS
            )

        latest = _pick_latest_reading(parsed_rows)
        return JSONResponse(
            content={
                "connected": True,
                "source": "csv_fallback",
                "timestamp": ts_now,
                "data": latest,
                "rows": len(parsed_rows),
            },
            headers=NO_CACHE_HEADERS
        )
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as net_err:
        return JSONResponse(
            content={
                "connected": False,
                "source": "none",
                "timestamp": ts_now,
                "error": f"ESP32 unreachable: {net_err}",
                "data": {},
            },
            headers=NO_CACHE_HEADERS
        )
    except Exception as e:
        return JSONResponse(
            content={
                "connected": False,
                "source": "none",
                "timestamp": ts_now,
                "error": str(e),
                "data": {},
            },
            headers=NO_CACHE_HEADERS
        )

@app.get("/api/esp32/logs")
def get_esp32_logs(limit: int = 50):
    """Proxy the ESP32 CSV download and return the last `limit` rows as JSON."""
    ts_now = time.time()
    try:
        raw = _fetch_esp32("/download", timeout=ESP32_TIMEOUT + 3)
        text = raw.decode("utf-8", errors="replace").strip()
        parsed_rows = _parse_csv_text(text)

        # Sort logs by uptime ascending so chronological graphs are correct
        if any(r.get("uptime") is not None for r in parsed_rows):
            parsed_rows.sort(key=lambda r: (r.get("uptime") if r.get("uptime") is not None else -1))

        return JSONResponse(
            content={
                "connected": True,
                "timestamp": ts_now,
                "logs": parsed_rows[-limit:],
                "total": len(parsed_rows),
            },
            headers=NO_CACHE_HEADERS
        )
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as net_err:
        return JSONResponse(
            content={
                "connected": False,
                "timestamp": ts_now,
                "error": f"ESP32 unreachable: {net_err}",
                "logs": [],
                "total": 0,
            },
            headers=NO_CACHE_HEADERS
        )
    except Exception as e:
        return JSONResponse(
            content={
                "connected": False,
                "timestamp": ts_now,
                "error": str(e),
                "logs": [],
                "total": 0,
            },
            headers=NO_CACHE_HEADERS
        )


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
