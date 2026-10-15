# Comprehensive Data Audit & Inventory Report
## NITI Aayog SDG India Index & Indicator Data Repository

> **Audit Date:** October 2026  
> **Coverage:** 36 Indian States and Union Territories + National India Composite  
> **SDGs Analyzed:** SDG 3 (Health), SDG 4 (Education), SDG 13 (Climate Action)  

---

## 1. Executive Summary of Datasets

| Dataset File | Category | Temporal Coverage | Entity Count | Indicator / Target Count | Data Completeness | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `SDG_13_18.csv` | Climate Indicators | 2018 | 36 entities | 3 cols | 100.0% | Renewable energy share in total power generation capacity |
| `SDG_13_19-20.csv` | Raw SDG 13 Scores | 19-20 | 28 entities | 3 cols | 66.7% | Official NITI Aayog raw index scores for Climate Action |
| `SDG_13_20-21.csv` | Raw SDG 13 Scores | 20-21 | 28 entities | 3 cols | 100.0% | Official NITI Aayog raw index scores for Climate Action |
| `SDG_13_23-24.csv` | Raw SDG 13 Scores | 23-24 | 28 entities | 3 cols | 100.0% | Official NITI Aayog raw index scores for Climate Action |
| `SDG_3_18.csv` | Raw SDG 3 Scores | 18 | 29 entities | 2 cols | 100.0% | Official NITI Aayog raw index scores for Health |
| `SDG_3_19-20.csv` | Raw SDG 3 Scores | 19-20 | 28 entities | 3 cols | 100.0% | Official NITI Aayog raw index scores for Health |
| `SDG_3_20-21.csv` | Raw SDG 3 Scores | 20-21 | 28 entities | 3 cols | 100.0% | Official NITI Aayog raw index scores for Health |
| `SDG_3_23-24.csv` | Raw SDG 3 Scores | 23-24 | 28 entities | 3 cols | 100.0% | Official NITI Aayog raw index scores for Health |
| `SDG_3_25.csv` | Health Indicators | 2020-21 / NFHS-5 | 36 entities | 8 cols | 100.0% | Indicator-level health measurements (MMR, U5MR, Immunization, Physicians, TB) |
| `SDG_4_18.csv` | Raw SDG 4 Scores | 18 | 29 entities | 2 cols | 100.0% | Official NITI Aayog raw index scores for Education |
| `SDG_4_19-20.csv` | Raw SDG 4 Scores | 19-20 | 28 entities | 3 cols | 100.0% | Official NITI Aayog raw index scores for Education |
| `SDG_4_20-21.csv` | Raw SDG 4 Scores | 20-21 | 28 entities | 3 cols | 100.0% | Official NITI Aayog raw index scores for Education |
| `SDG_4_23-24.csv` | Raw SDG 4 Scores | 23-24 | 28 entities | 3 cols | 100.0% | Official NITI Aayog raw index scores for Education |
| `niti_aayog_sdg_historical.csv` | Historical Time Series | 2018–2023 | 36 entities | 6 cols | 100.0% | Normalized longitudinal scores for model training (2018-2023) |
| `sdg_projections_2024_2026.csv` | ML Forecasts | 2024–2026 | 36 entities | 8 cols | 100.0% | Random Forest Regressor projections with 95% CIs |
| `sdg_validation_scorecard.csv` | Validation Metrics | 2022–2023 | 36 entities | 10 cols | 100.0% | Holdout error scorecard (RMSE, MAE, R², naive baseline) |

---

## 2. In-Depth Indicator Schemas & Target Benchmarks

### A. SDG 3 Health Indicator Level (`SDG_3_25.csv`)
Contains primary micro-indicators for 36 States/UTs plus National India Composite and NITI Aayog 2030 Official Targets:

| Indicator Name | Unit | NITI Aayog / National Target | Direction of Improvement | State Data Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **Maternal Mortality Ratio (MMR)** | Per 100,000 live births | **70** (National SDG Target) | Lower is better | Available for major states; small UTs pooled |
| **Under-five Mortality Rate (U5MR)** | Per 1,000 live births | **25** (National SDG Target) | Lower is better | Complete across states |
| **Children aged 12-23 months fully immunized** | Percentage (%) | **100%** (Universal Target) | Higher is better | Complete |
| **Women (15-49 yrs) using modern family planning** | Percentage (%) | **100%** | Higher is better | Complete |
| **Number of physicians, nurses, and midwives** | Per 10,000 population | **44.5** (WHO Minimum Benchmark) | Higher is better | Complete |
| **Tuberculosis Case Notification Rate** | Per 100,000 population | **<= 0 / Elimination** | Lower is better | Complete |

### B. SDG 13 Climate Action Indicator Level (`SDG_13_18.csv`)
| Indicator Name | Unit | Official Target | Direction | State Data Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **Renewable energy share in installed generation capacity** | Percentage (%) | **40.0%** (NDC Target by 2030) | Higher is better | Complete across all 36 States/UTs |

---

## 3. Data Quality, Missing Data & Harmonization Rules

### Observed Data Quality Strengths
1. **State Harmonization**: Standardized state names reconcile historical differences (e.g., 'Orissa' -> 'Odisha', 'Pondicherry' -> 'Puducherry', merged Dadra & Nagar Haveli and Daman & Diu).
2. **Longitudinal Consistency**: Standardized 0–100 normalized score bounds across SDG 3, SDG 4, and SDG 13 from NITI Aayog Index 2018 through 2023-24.
3. **Zero-Imputation Integrity**: Missing indicator cells are strictly recorded as `NaN` and never filled with zeros.

### Gaps & Limitations Requiring Transparent Analytical Disclosure
1. **Intermediate Year Linear Interpolation (2021 & 2022)**: NITI Aayog released official reports for 2018, 2019-20, 2020-21, and 2023-24. Scores for 2021 and 2022 represent validated linear interpolation points in `niti_aayog_sdg_historical.csv`.
2. **Indicator Coverage Gaps**: Detailed indicator-level micro-data is available for SDG 3 (`SDG_3_25.csv`) and SDG 13 (`SDG_13_18.csv`), whereas SDG 4 raw micro-indicators (GER, PTR, school electricity) are recorded via aggregate normalized scores in `niti_aayog_sdg_historical.csv` and documented in official compendiums.
3. **Small UT Aggregations**: Certain indicators (such as MMR) are not calculated individually for small island UTs (Lakshadweep, Andaman & Nicobar) due to small sample size denominator constraints, and are reported under zonal aggregates.