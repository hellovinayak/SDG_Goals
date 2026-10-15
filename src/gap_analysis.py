"""
src/gap_analysis.py
Phase 2 SDG Gap Analysis & Target Benchmarking Engine.
Analyzes:
  - Historical score deltas (2018-2023)
  - Distance to official NITI Aayog / 2030 targets (Target = 100 for composite, 75 for Front Runner)
  - Micro-indicator performance (SDG 3 Health & SDG 13 Climate)
  - Transparent gap prioritization with criteria (severity, trend, confidence)
  - Comparative interstate and national benchmarking for Tamil Nadu and any state.
"""

import os
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

from src.data_loader import load_sdg_data, load_health_indicators, load_climate_indicators, STATES_AND_UTS

SDG_LABELS = {
    "SDG3_Health": "SDG 3: Good Health & Well-Being",
    "SDG4_Education": "SDG 4: Quality Education",
    "SDG13_Climate": "SDG 13: Climate Action"
}

# Official Targets & Thresholds
OFFICIAL_BENCHMARKS = {
    "SDG_COMPOSITE": {
        "Target": 100.0,
        "Front_Runner": 75.0,
        "Performer": 50.0,
        "Aspirant": 0.0
    },
    "SDG3_Health_Indicators": {
        "Maternal Mortality Ratio (per 100000 live births)": {
            "target": 70.0,
            "direction": "lower",
            "unit": "per 100k live births",
            "source": "NITI Aayog / National Health Policy"
        },
        "Under-five Mortality Rate (per 1000 live births)": {
            "target": 25.0,
            "direction": "lower",
            "unit": "per 1,000 live births",
            "source": "SDG 3.2 Target / NITI Aayog"
        },
        "Children aged 12-23 months fully immunized (BCG Measles and three doses of Pentavalent vaccine)": {
            "target": 100.0,
            "direction": "higher",
            "unit": "%",
            "source": "Mission Indradhanush / Universal"
        },
        "Women in the age group of 15-49 years using modern methods of family planning": {
            "target": 100.0,
            "direction": "higher",
            "unit": "%",
            "source": "Family Planning 2030"
        },
        "Number of governmental physicians nurses and midwives": {
            "target": 44.5,
            "direction": "higher",
            "unit": "per 10,000 population",
            "source": "WHO Minimum Standard"
        },
        "Total case notification rate of tuberculosis": {
            "target": 0.0,
            "direction": "lower",
            "unit": "per 100k population",
            "source": "National TB Elimination Programme"
        }
    },
    "SDG13_Climate_Indicators": {
        "Percentage of renewable energy out of total installed generating capacity (including allocated shares)": {
            "target": 40.0,
            "direction": "higher",
            "unit": "%",
            "source": "India NDC 2030 Target"
        }
    }
}


def compute_state_sdg_gaps(state_name: str = "Tamil Nadu") -> Dict[str, Any]:
    """
    Performs comprehensive gap analysis for a specific state across all 3 focus SDGs
    and available indicator-level metrics.
    """
    df_hist = load_sdg_data()
    st_df = df_hist[df_hist["State"] == state_name].sort_values("Year")
    
    if st_df.empty:
        raise ValueError(f"State '{state_name}' not found in historical dataset.")

    # All India baseline for comparison
    ind_df = df_hist[df_hist["State"] == "India"].sort_values("Year")
    
    analysis = {
        "state": state_name,
        "latest_year": int(st_df["Year"].max()),
        "baseline_year": int(st_df["Year"].min()),
        "goal_summaries": {},
        "priority_gaps_table": [],
        "indicator_micro_gaps": [],
        "national_comparisons": {}
    }

    # 1. Goal-Level Trajectory & Gap
    for sdg_key, sdg_label in SDG_LABELS.items():
        scores = st_df.set_index("Year")[sdg_key].to_dict()
        s_2018 = scores.get(2018)
        s_2020 = scores.get(2020)
        s_2023 = scores.get(2023)
        
        # Absolute changes
        delta_5yr = round(s_2023 - s_2018, 1) if (s_2023 is not None and s_2018 is not None) else None
        delta_3yr = round(s_2023 - s_2020, 1) if (s_2023 is not None and s_2020 is not None) else None
        velocity = round(delta_5yr / 5.0, 2) if delta_5yr is not None else 0.0

        # Gap to targets
        gap_to_target_100 = round(100.0 - s_2023, 1) if s_2023 is not None else None
        gap_to_front_runner_75 = round(75.0 - s_2023, 1) if s_2023 is not None else None

        # Status classification
        if s_2023 >= 100.0:
            status = "Target Achieved"
        elif s_2023 >= 75.0:
            status = "Front Runner (On Track)" if velocity >= 0 else "Front Runner (Slowing)"
        elif s_2023 >= 50.0:
            status = "Performer (Sub-target)"
        else:
            status = "Aspirant (Critical Gap)"

        # Trend label
        if velocity > 0.5:
            trend = "Improving"
        elif velocity < -0.5:
            trend = "Worsening"
        else:
            trend = "Stagnant"

        # National comparison
        ind_2023 = float(ind_df[ind_df["Year"] == 2023][sdg_key].values[0]) if not ind_df.empty else 60.0
        national_gap = round(s_2023 - ind_2023, 1) if s_2023 is not None else 0.0

        analysis["goal_summaries"][sdg_key] = {
            "sdg_title": sdg_label,
            "2018_score": s_2018,
            "2020_score": s_2020,
            "2023_score": s_2023,
            "5yr_change": delta_5yr,
            "3yr_change": delta_3yr,
            "annual_velocity": velocity,
            "gap_to_target": gap_to_target_100,
            "status": status,
            "trend": trend,
            "national_avg_2023": ind_2023,
            "vs_national_avg": national_gap
        }

        # Add to Priority Gap Table
        confidence = 0.90 if sdg_key != "SDG13_Climate" else 0.85
        priority_score = (gap_to_target_100 * 0.5) + (abs(min(0, velocity)) * 10 * 0.3) + ((1.0 - confidence) * 20 * 0.2)

        priority_reason = (
            f"Lagging Aspirant tier (<50 pts) with {gap_to_target_100} pts gap to target" if s_2023 < 50 else (
                f"Stagnant growth ({velocity} pts/yr) with {gap_to_target_100} pts distance to 2030 target" if abs(velocity) <= 0.3 else (
                    f"Worsening trajectory ({velocity} pts/yr)" if velocity < -0.3 else f"Progressing but {gap_to_target_100} pts below full achievement"
                )
            )
        )

        analysis["priority_gaps_table"].append({
            "SDG": sdg_label,
            "Scope": "Macro Goal Index",
            "Latest_Value": s_2023,
            "Year": 2023,
            "Target_Benchmark": 100.0,
            "Gap_to_Target": gap_to_target_100,
            "Trend": trend,
            "Evidence": f"NITI Aayog SDG India Index 2023-24 (Score: {s_2023}/100, Velocity: {velocity} pts/yr)",
            "Data_Confidence": f"{int(confidence*100)}%",
            "Priority_Score": round(priority_score, 2),
            "Priority_Reason": priority_reason
        })

    # 2. Indicator-Level Micro Gaps (SDG 3 Health from SDG_3_25.csv)
    health_df = load_health_indicators()
    if not health_df.empty:
        st_health = health_df[health_df["Area"] == state_name]
        if not st_health.empty:
            st_health_row = st_health.iloc[0]
            for ind_name, meta in OFFICIAL_BENCHMARKS["SDG3_Health_Indicators"].items():
                if ind_name in st_health_row:
                    val = st_health_row[ind_name]
                    if pd.notnull(val):
                        tgt = meta["target"]
                        direction = meta["direction"]
                        unit = meta["unit"]
                        
                        # Gap calculation based on direction
                        if direction == "lower":
                            gap = round(float(val) - float(tgt), 1)
                            unmet = (val > tgt)
                            gap_display = f"+{gap} (excess over target)" if gap > 0 else f"{gap} (target met)"
                        else:
                            gap = round(float(tgt) - float(val), 1)
                            unmet = (val < tgt)
                            gap_display = f"{gap} {unit} deficit" if gap > 0 else "Target met"

                        confidence = 0.95
                        severity = max(0.0, gap if direction == "higher" else (gap * 1.5))
                        p_score = severity * 0.7 + ((1.0 - confidence) * 10)

                        item = {
                            "SDG": "SDG 3: Health",
                            "Indicator": ind_name,
                            "Latest_Value": float(val),
                            "Unit": unit,
                            "Year": 2021,  # NFHS-5 / SDG 2020-21 cycle
                            "Target": tgt,
                            "Target_Met": not unmet,
                            "Gap_Display": gap_display,
                            "Numeric_Gap": round(float(gap), 2),
                            "Direction": "Lower is better" if direction == "lower" else "Higher is better",
                            "Priority_Score": round(p_score, 2),
                            "Evidence": f"SDG_3_25.csv / NFHS-5 indicator baseline (Val: {val} {unit}, Target: {tgt})",
                            "Confidence": "95%"
                        }
                        analysis["indicator_micro_gaps"].append(item)

    # 3. Indicator-Level Micro Gaps (SDG 13 Renewable Share from SDG_13_18.csv)
    clim_df = load_climate_indicators()
    if not clim_df.empty:
        st_clim = clim_df[clim_df["Area"] == state_name]
        if not st_clim.empty:
            ren_col = [c for c in clim_df.columns if "renewable" in c.lower()][0]
            val = st_clim[ren_col].values[0]
            if pd.notnull(val):
                tgt = 40.0
                gap = round(tgt - float(val), 1)
                unmet = (float(val) < tgt)
                analysis["indicator_micro_gaps"].append({
                    "SDG": "SDG 13: Climate Action",
                    "Indicator": "Percentage of renewable energy in installed power capacity",
                    "Latest_Value": float(val),
                    "Unit": "%",
                    "Year": 2018,
                    "Target": tgt,
                    "Target_Met": not unmet,
                    "Gap_Display": f"{gap}% deficit" if gap > 0 else "Target achieved",
                    "Numeric_Gap": round(gap, 1),
                    "Direction": "Higher is better",
                    "Priority_Score": round(max(0.0, gap) * 0.8, 2),
                    "Evidence": f"CEA / NITI Aayog SDG_13_18.csv (Renewable Share: {val}%, Target: {tgt}%)",
                    "Confidence": "90%"
                })

    # Sort priority gap table by priority score descending
    analysis["priority_gaps_table"].sort(key=lambda x: x["Priority_Score"], reverse=True)
    analysis["indicator_micro_gaps"].sort(key=lambda x: x["Priority_Score"], reverse=True)

    return analysis
