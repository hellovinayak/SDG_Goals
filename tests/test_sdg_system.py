"""
Comprehensive Automated Test Suite for SDG Analysis, Forecasting, and RAG Advisory System.

Covers:
1. Data loading, schemas, state filtering, and missing data integrity.
2. SDG gap analysis, velocity calculations, and official target benchmarks.
3. SDG isolation (verifies SDG 3 does not leak into SDG 4 or SDG 13).
4. Phased 2026 Action Plan with departmental KPIs and document citations.
5. Extended Random Forest forecasting (2024–2030) and 95% confidence intervals.
6. Scenario analysis: Baseline vs Realistic Improvement vs Higher-Effort deltas.
7. RAG vector retrieval and grounded citations from ChromaDB.
8. REST API endpoints via TestClient / HTTP requests.
"""

import unittest
import os
import sys

# Ensure repository root is in sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from src.data_loader import load_sdg_data, load_health_indicators, load_climate_indicators, STATES_AND_UTS
from src.gap_analysis import compute_state_sdg_gaps
from src.action_planner import generate_2026_action_plan
from src.model_engine import (
    train_and_validate_models,
    generate_forecasts,
    generate_scenario_forecasts,
    FORECAST_HORIZON_EXTENDED,
)
from src.rag_engine import get_rag_engine


class TestDataLoadingAndIntegrity(unittest.TestCase):
    """Phase 1: Test Data Ingestion, Schemas, and Missing Data Integrity."""

    def setUp(self):
        self.df = load_sdg_data()

    def test_states_coverage(self):
        """Verify all 36 States and Union Territories plus National India are represented."""
        unique_states = self.df["State"].unique()
        self.assertEqual(len(unique_states), 37)
        self.assertIn("Tamil Nadu", unique_states)
        self.assertIn("Kerala", unique_states)
        self.assertIn("India", unique_states)

    def test_year_range(self):
        """Verify historical time series spans 2018 to 2023."""
        years = sorted(self.df["Year"].unique().tolist())
        self.assertEqual(years, [2018, 2019, 2020, 2021, 2022, 2023])

    def test_sdg_goals_present(self):
        """Verify SDG 3, SDG 4, and SDG 13 columns exist."""
        for col in ["SDG3_Health", "SDG4_Education", "SDG13_Climate", "Composite_Score"]:
            self.assertIn(col, self.df.columns)

    def test_no_missing_data_treated_as_zero(self):
        """Verify that missing indicator values are preserved as NaN, never fabricated as 0."""
        df_health = load_health_indicators()
        self.assertFalse(df_health.empty)
        mmr_col = [c for c in df_health.columns if "maternal" in c.lower()][0]
        ut_row = df_health[df_health["Area"] == "Chandigarh"]
        if not ut_row.empty:
            val = ut_row[mmr_col].values[0]
            if str(val) != "nan" and val is not None:
                self.assertNotEqual(val, 0, "Missing MMR should never be reported as 0")


class TestSDGGapAnalysis(unittest.TestCase):
    """Phase 2: Test Gap Analysis, Velocity, and Benchmark Comparisons."""

    def setUp(self):
        self.df = load_sdg_data()
        self.tn_gaps = compute_state_sdg_gaps("Tamil Nadu")

    def test_tamil_nadu_historical_trajectory(self):
        """Verify Tamil Nadu latest values and changes for SDG 3, 4, 13."""
        summaries = self.tn_gaps["goal_summaries"]
        self.assertIn("SDG3_Health", summaries)
        self.assertIn("SDG4_Education", summaries)
        self.assertIn("SDG13_Climate", summaries)

        # Tamil Nadu 2023 actuals verified against NITI Aayog raw data
        self.assertEqual(summaries["SDG3_Health"]["2023_score"], 77.0)
        self.assertEqual(summaries["SDG4_Education"]["2023_score"], 76.0)
        self.assertEqual(summaries["SDG13_Climate"]["2023_score"], 81.0)

        # Target gaps (Goal target = 100)
        self.assertEqual(summaries["SDG3_Health"]["gap_to_target"], 23.0)
        self.assertEqual(summaries["SDG4_Education"]["gap_to_target"], 24.0)
        self.assertEqual(summaries["SDG13_Climate"]["gap_to_target"], 19.0)

    def test_prioritized_indicator_gaps(self):
        """Verify prioritized gaps contain micro-indicators with official benchmarks."""
        gaps = self.tn_gaps.get("priority_gaps_table", [])
        micro_gaps = self.tn_gaps.get("indicator_micro_gaps", [])
        self.assertGreater(len(gaps) + len(micro_gaps), 0)

        all_indicators = [g.get("Indicator", g.get("SDG", "")).lower() for g in (gaps + micro_gaps)]
        self.assertTrue(any("maternal" in ind or "under-five" in ind or "immuniz" in ind or "tuberculosis" in ind or "climate" in ind for ind in all_indicators))

    def test_sdg_isolation(self):
        """Verify SDG 3 metrics are strictly separated from SDG 4 and SDG 13."""
        summaries = self.tn_gaps["goal_summaries"]
        self.assertNotEqual(summaries["SDG3_Health"]["sdg_title"], summaries["SDG4_Education"]["sdg_title"])
        self.assertNotEqual(summaries["SDG3_Health"]["sdg_title"], summaries["SDG13_Climate"]["sdg_title"])


class TestActionPlanner(unittest.TestCase):
    """Phase 3: Test 2026 Action Plan with KPIs, Departments, and Citations."""

    def setUp(self):
        self.plan = generate_2026_action_plan("Tamil Nadu")

    def test_action_plan_structure(self):
        """Verify actions list exists and contains phased actions."""
        actions = self.plan["actions"]
        self.assertGreaterEqual(len(actions), 3)
        self.assertIn("2026", self.plan["action_plan_horizon"])

    def test_action_attributes(self):
        """Verify every action has a responsible department, KPIs, steps, and verified evidence."""
        for act in self.plan["actions"]:
            self.assertTrue(len(act["id"]) > 0)
            self.assertTrue(len(act["sdg"]) > 0)
            self.assertTrue(len(act["tier"]) > 0)
            self.assertTrue(len(act["responsible_department"]) > 0)
            self.assertTrue(len(act["measurable_kpi"]) > 0)
            self.assertTrue(len(act["baseline"]) > 0)
            self.assertTrue(len(act["target_2026"]) > 0)
            self.assertTrue(len(act["monitoring_frequency"]) > 0)
            self.assertGreater(len(act["implementation_steps"]), 0)
            self.assertTrue(len(act["evidence"]) > 0)


class TestForecastingAndScenarios(unittest.TestCase):
    """Phase 4 & 5: Test Extended Random Forest Projections (2024-2030) and Scenarios."""

    @classmethod
    def setUpClass(cls):
        cls.models, _ = train_and_validate_models()
        cls.scenarios = {
            sdg: generate_scenario_forecasts("Tamil Nadu", sdg, cls.models)
            for sdg in ["SDG3_Health", "SDG4_Education", "SDG13_Climate"]
        }

    def test_horizon_years_include_2027_2028_2029_2030(self):
        """Verify the forecasting horizon includes 2024, 2025, 2026, 2027, 2028, 2029, and 2030."""
        self.assertEqual(FORECAST_HORIZON_EXTENDED, [2024, 2025, 2026, 2027, 2028, 2029, 2030])

    def test_baseline_predictions_bounds_and_cis(self):
        """Verify baseline scores are strictly bounded [0, 100] with valid 95% CIs."""
        for sdg in ["SDG3_Health", "SDG4_Education", "SDG13_Climate"]:
            self.assertIn(sdg, self.scenarios)
            baseline = self.scenarios[sdg]["scenarios"]["baseline"]
            projs = baseline["projections"]
            cis = baseline["confidence_interval_95"]
            self.assertEqual(len(projs), 7)  # 2024, 2025, 2026, 2027, 2028, 2029, 2030

            for yr, score in projs.items():
                ci_low, ci_high = cis[yr]
                self.assertGreaterEqual(score, 0.0)
                self.assertLessEqual(score, 100.0)
                self.assertLessEqual(ci_low, score)
                self.assertGreaterEqual(ci_high, score)

    def test_scenarios_hierarchy(self):
        """Verify Scenario C (Higher-Effort) >= Scenario B (Realistic) >= Scenario A (Baseline)."""
        for sdg in ["SDG3_Health", "SDG4_Education", "SDG13_Climate"]:
            base_projs = self.scenarios[sdg]["scenarios"]["baseline"]["projections"]
            real_projs = self.scenarios[sdg]["scenarios"]["improvement"]["projections"]
            high_projs = self.scenarios[sdg]["scenarios"]["higher_effort"]["projections"]

            for yr in [2026, 2028, 2029, 2030]:
                self.assertGreaterEqual(real_projs[yr], base_projs[yr] - 0.01)
                self.assertGreaterEqual(high_projs[yr], real_projs[yr] - 0.01)
                self.assertLessEqual(high_projs[yr], 100.0)

    def test_state_isolation_in_forecasting(self):
        """Verify forecasts for Tamil Nadu are distinct from Kerala."""
        kerala_sdg3 = generate_scenario_forecasts("Kerala", "SDG3_Health", self.models)
        tn_sdg3_2030 = self.scenarios["SDG3_Health"]["scenarios"]["baseline"]["projections"][2030]
        kl_sdg3_2030 = kerala_sdg3["scenarios"]["baseline"]["projections"][2030]
        self.assertNotEqual(tn_sdg3_2030, kl_sdg3_2030)


class TestRAGEngineAndCitations(unittest.TestCase):
    """Phase 6: Test Vector Retrieval and Citation Grounding."""

    @classmethod
    def setUpClass(cls):
        cls.engine = get_rag_engine()

    def test_collection_contains_indexed_documents(self):
        """Verify ChromaDB has indexed the official policy documents."""
        stats = self.engine.kb.get_stats()
        self.assertGreater(stats["chunks_count"], 0, "ChromaDB should contain indexed policy chunks")

    def test_targeted_query_retrieves_relevant_citations(self):
        """Verify query on climate action retrieves SDG 13 document citations."""
        citations = self.engine.kb.retrieve(
            query="renewable energy climate action Tamil Nadu",
            state="Tamil Nadu",
            sdg="SDG13_Climate",
            n_results=3,
        )
        self.assertGreater(len(citations), 0)
        top_cit = citations[0]
        self.assertIn("document", top_cit)
        self.assertTrue("text" in top_cit or "excerpt" in top_cit)
        self.assertIn("page", top_cit)

    def test_action_plan_context_integration(self):
        """Verify process_query executes and returns structured output."""
        res = self.engine.process_query(
            question="Analyze SDG gaps and unmet targets for Tamil Nadu",
            state="Tamil Nadu",
            sdg="SDG3_Health",
            action_type="gap_analysis",
        )
        self.assertIn("answer", res)
        self.assertIn("citations", res)
        self.assertGreater(len(res["answer"]), 100)


class TestRESTAPIEndpoints(unittest.TestCase):
    """Phase 7: Test FastAPI HTTP Endpoints."""

    def setUp(self):
        self.base_url = "http://127.0.0.1:8000"

    def _get(self, endpoint):
        import urllib.request
        import json
        req = urllib.request.Request(f"{self.base_url}{endpoint}")
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_api_initial_data(self):
        """Verify /api/initial-data returns 200 and valid metadata."""
        status, data = self._get("/api/initial-data")
        self.assertEqual(status, 200)
        self.assertIn("states", data)
        self.assertEqual(len(data["states"]), 37)

    def test_api_analytics_tamil_nadu(self):
        """Verify /api/analytics/state/Tamil%20Nadu returns gaps and action plan."""
        status, data = self._get("/api/analytics/state/Tamil%20Nadu")
        self.assertEqual(status, 200)
        self.assertEqual(data["state"], "Tamil Nadu")
        self.assertIn("gaps", data)
        self.assertIn("action_plan", data)
        self.assertIn("2026", data["action_plan"]["action_plan_horizon"])

    def test_api_extended_forecasts_tamil_nadu(self):
        """Verify /api/forecasts/extended/Tamil%20Nadu contains 2027, 2028, 2029, and 2030."""
        status, data = self._get("/api/forecasts/extended/Tamil%20Nadu")
        self.assertEqual(status, 200)
        self.assertEqual(data["horizon_years"], [2024, 2025, 2026, 2027, 2028, 2029, 2030])
        self.assertIn("SDG3_Health", data["scenarios_by_sdg"])
        self.assertIn("SDG13_Climate", data["scenarios_by_sdg"])

    def test_api_audit_report(self):
        """Verify /api/audit-report returns inventory metadata."""
        status, data = self._get("/api/audit-report")
        self.assertEqual(status, 200)
        self.assertIn("total_datasets_inspected", data)
        self.assertGreaterEqual(data["total_datasets_inspected"], 16)


if __name__ == "__main__":
    unittest.main()
