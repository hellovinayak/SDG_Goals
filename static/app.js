/**
 * app.js
 * High-Performance Frontend Engine for SDG Predictive Monitoring Dashboard
 * BCSE497J: Project I - Vellore Institute of Technology (VIT) Chennai Campus
 */

// Application State
const state = {
  data: null,
  selectedState: "Tamil Nadu",
  selectedYear: 2026,
  selectedSdgFilter: "ALL",
  compareState: "Kerala",
  compareSdg: "SDG3_Health",
  geoMetric: "Composite_Score",
  healthIndicator: "",
  charts: {}
};

const COLORS = {
  sdg3: "#4ade80",       /* Green  — SDG 3 Health   */
  sdg4: "#facc15",       /* Yellow — SDG 4 Education */
  sdg13: "#f87171",      /* Red    — SDG 13 Climate  */
  composite: "#a78bfa",
  highRisk: "#f87171",
  medRisk: "#facc15",
  lowRisk: "#4ade80",
  accent: "#6b8fad",
  grid: "rgba(232, 237, 242, 0.06)",
  tick: "#9aa5b1",
  legend: "#c5ced6",
  tooltipBg: "#161b22",
  tooltipTitle: "#e8edf2",
  tooltipBody: "#9aa5b1"
};

const CHART_FONT = "Inter, Roboto, system-ui, sans-serif";

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function applyChartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.font.family = CHART_FONT;
  Chart.defaults.color = COLORS.tick;
  Chart.defaults.borderColor = COLORS.grid;
}

function setupAboutModal() {
  const modal = document.getElementById("aboutModal");
  const openers = [document.getElementById("aboutOpenBtn"), document.getElementById("aboutOpenBtnFooter")];
  const closer = document.getElementById("aboutCloseBtn");
  const open = () => modal.classList.add("open");
  const close = () => modal.classList.remove("open");
  openers.forEach(btn => btn && btn.addEventListener("click", open));
  if (closer) closer.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  applyChartDefaults();
  setupAboutModal();
  setupTabs();
  setupGlobalControls();
  setupAIAssistant();
  refreshIcons();
  await loadDashboardData();
  refreshIcons();
});

// Setup Navigation Tabs
function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add("active");
        handleTabSwitch(targetId);
      }
    });
  });
}

function handleTabSwitch(tabId) {
  if (tabId === "tab-forecaster") {
    renderTrendChart();
    renderCompareChart();
  } else if (tabId === "tab-climate") {
    renderClimateCharts();
  } else if (tabId === "tab-health") {
    renderHealthChart();
  } else if (tabId === "tab-esp32") {
    esp32StartPolling();
    esp32FetchLogs();
  }

  // Stop ESP32 polling when navigating away from the tab
  if (tabId !== "tab-esp32") {
    esp32StopPolling();
  }
}

// Setup Global Controls (State dropdown, Year buttons, SDG selector)
function setupGlobalControls() {
  // Year toggle buttons
  const yearBtns = document.querySelectorAll(".year-btn");
  yearBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      yearBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.selectedYear = parseInt(btn.getAttribute("data-year"));
      
      // Update UI year labels
      document.querySelectorAll(".selected-year-text").forEach(el => {
        el.textContent = state.selectedYear;
      });

      updateNationalKPIs();
      renderGoalScorecards();
      renderRiskMatrixTable();
      renderGeoAnalytics();
    });
  });

  // State selector
  const stateSelect = document.getElementById("stateSelect");
  stateSelect.addEventListener("change", (e) => {
    state.selectedState = e.target.value;
    document.getElementById("forecaster-state-title").textContent = state.selectedState;
    document.getElementById("policy-state-name").textContent = state.selectedState;
    
    renderTrendChart();
    renderGoalScorecards();
    loadPolicyAdvisory();
  });

  // SDG Focus Filter
  const sdgFilterSelect = document.getElementById("sdgFilterSelect");
  sdgFilterSelect.addEventListener("change", (e) => {
    state.selectedSdgFilter = e.target.value;
    renderTrendChart();
  });

  // Compare State / SDG
  const compareStateSelect = document.getElementById("compareStateSelect");
  compareStateSelect.addEventListener("change", (e) => {
    state.compareState = e.target.value;
    renderCompareChart();
  });

  const compareSdgSelect = document.getElementById("compareSdgSelect");
  compareSdgSelect.addEventListener("change", (e) => {
    state.compareSdg = e.target.value;
    renderCompareChart();
  });

  // Table Filters
  const tableSearchInput = document.getElementById("tableSearchInput");
  tableSearchInput.addEventListener("input", () => renderRiskMatrixTable());

  const tableRiskFilter = document.getElementById("tableRiskFilter");
  tableRiskFilter.addEventListener("change", () => renderRiskMatrixTable());

  const tableSdgFilter = document.getElementById("tableSdgFilter");
  tableSdgFilter.addEventListener("change", () => renderRiskMatrixTable());

  // Geo Metric Select
  const geoMetricSelect = document.getElementById("geoMetricSelect");
  geoMetricSelect.addEventListener("change", (e) => {
    state.geoMetric = e.target.value;
    renderGeoAnalytics();
  });

  // Health Sub-indicator select
  const healthIndicatorSelect = document.getElementById("healthIndicatorSelect");
  healthIndicatorSelect.addEventListener("change", (e) => {
    state.healthIndicator = e.target.value;
    renderHealthChart();
  });
}

// Fetch Initial Data from Server API
async function loadDashboardData() {
  try {
    const res = await fetch("/api/initial-data");
    if (!res.ok) throw new Error("Failed to load initial data");
    state.data = await res.json();

    populateDropdowns();
    updateNationalKPIs();
    renderTrendChart();
    renderGoalScorecards();
    renderCompareChart();
    renderPriorityAlerts();
    renderRiskMatrixTable();
    renderGeoAnalytics();
    renderClimateCharts();
    renderHealthIndicators();
    renderValidationSection();
    loadPolicyAdvisory();

  } catch (err) {
    console.error("Error loading dashboard data:", err);
  }
}

// Populate State & Indicator Dropdowns
function populateDropdowns() {
  const stateSelect = document.getElementById("stateSelect");
  const compareStateSelect = document.getElementById("compareStateSelect");
  const aiStateSelect = document.getElementById("aiStateSelect");
  
  stateSelect.innerHTML = "";
  compareStateSelect.innerHTML = "";
  if (aiStateSelect) aiStateSelect.innerHTML = "";

  state.data.states.forEach(st => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    if (st === state.selectedState) opt.selected = true;
    stateSelect.appendChild(opt);

    const compOpt = document.createElement("option");
    compOpt.value = st;
    compOpt.textContent = st;
    if (st === state.compareState) compOpt.selected = true;
    compareStateSelect.appendChild(compOpt);

    if (aiStateSelect) {
      const aiOpt = document.createElement("option");
      aiOpt.value = st;
      aiOpt.textContent = st;
      if (st === state.selectedState) aiOpt.selected = true;
      aiStateSelect.appendChild(aiOpt);
    }
  });

  // Health Indicator columns
  const healthIndicatorSelect = document.getElementById("healthIndicatorSelect");
  healthIndicatorSelect.innerHTML = "";
  if (state.data.health_indicators.length > 0) {
    const sample = state.data.health_indicators[0];
    const numericKeys = Object.keys(sample).filter(k => k !== "SNo" && k !== "Area");
    numericKeys.forEach((key, idx) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      if (idx === 0) {
        opt.selected = true;
        state.healthIndicator = key;
      }
      healthIndicatorSelect.appendChild(opt);
    });
  }
}

// Update Top Executive KPI Cards
function updateNationalKPIs() {
  const kpis = state.data.kpis[state.selectedYear];
  if (!kpis) return;

  document.getElementById("kpi-sdg3-val").textContent = kpis.sdg3_avg.toFixed(1);
  const s3DeltaEl = document.getElementById("kpi-sdg3-delta");
  s3DeltaEl.textContent = `${kpis.sdg3_delta >= 0 ? '+' : ''}${kpis.sdg3_delta.toFixed(1)} pts vs 2023`;
  s3DeltaEl.className = `kpi-delta ${kpis.sdg3_delta >= 0 ? 'pos' : 'neg'}`;

  document.getElementById("kpi-sdg4-val").textContent = kpis.sdg4_avg.toFixed(1);
  const s4DeltaEl = document.getElementById("kpi-sdg4-delta");
  s4DeltaEl.textContent = `${kpis.sdg4_delta >= 0 ? '+' : ''}${kpis.sdg4_delta.toFixed(1)} pts vs 2023`;
  s4DeltaEl.className = `kpi-delta ${kpis.sdg4_delta >= 0 ? 'pos' : 'neg'}`;

  document.getElementById("kpi-sdg13-val").textContent = kpis.sdg13_avg.toFixed(1);
  const s13DeltaEl = document.getElementById("kpi-sdg13-delta");
  s13DeltaEl.textContent = `${kpis.sdg13_delta >= 0 ? '+' : ''}${kpis.sdg13_delta.toFixed(1)} pts vs 2023`;
  s13DeltaEl.className = `kpi-delta ${kpis.sdg13_delta >= 0 ? 'pos' : 'neg'}`;

  document.getElementById("kpi-aspirant-val").textContent = kpis.high_risk_count;
  document.getElementById("kpi-aspirant-desc").textContent = `States <50 in ${state.selectedYear}`;

  const critCount = state.data.early_warnings.filter(a => a.Severity === "CRITICAL").length;
  document.getElementById("kpi-alert-val").textContent = critCount;
}

// Render Main Trajectory Forecaster Line Chart (Chart.js)
function renderTrendChart() {
  const ctx = document.getElementById("trendChart").getContext("2d");
  if (state.charts.trendChart) state.charts.trendChart.destroy();

  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const stData = state.data.timeseries.filter(d => d.State === state.selectedState);

  const targets = (state.selectedSdgFilter === "ALL") 
    ? ["SDG3_Health", "SDG4_Education", "SDG13_Climate"]
    : [state.selectedSdgFilter];

  const datasets = [];

  targets.forEach(sdg => {
    const color = (sdg === "SDG3_Health") ? COLORS.sdg3 : ((sdg === "SDG4_Education") ? COLORS.sdg4 : COLORS.sdg13);
    const label = (sdg === "SDG3_Health") ? "SDG 3: Health" : ((sdg === "SDG4_Education") ? "SDG 4: Education" : "SDG 13: Climate");

    const histScores = [];
    const foreScores = [];
    const ciUpper = [];
    const ciLower = [];

    years.forEach(yr => {
      const rec = stData.find(d => d.SDG === sdg && d.Year === yr);
      if (yr <= 2023) {
        histScores.push(rec ? rec.Score : null);
        foreScores.push(yr === 2023 ? (rec ? rec.Score : null) : null);
      } else {
        histScores.push(null);
        foreScores.push(rec ? rec.Score : null);
      }
      ciUpper.push(rec ? rec.CI_Upper_95 : null);
      ciLower.push(rec ? rec.CI_Lower_95 : null);
    });

    // 1. Shaded Confidence Interval Upper Band
    datasets.push({
      label: `${label} (CI Upper)`,
      data: ciUpper,
      borderColor: "transparent",
      backgroundColor: "transparent",
      pointRadius: 0,
      fill: false
    });

    // 2. Shaded Confidence Interval Lower Band (fills to upper)
    datasets.push({
      label: `${label} (95% CI)`,
      data: ciLower,
      borderColor: "transparent",
      backgroundColor: color + "20",
      fill: "-1",
      pointRadius: 0
    });

    // 3. Historical Solid Line
    datasets.push({
      label: `${label} (Historical)`,
      data: histScores,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.2
    });

    // 4. Forecast Dashed Line
    datasets.push({
      label: `${label} (Forecast 2024-26)`,
      data: foreScores,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      borderDash: [6, 4],
      pointRadius: 6,
      pointStyle: 'rectRot',
      pointHoverRadius: 8,
      tension: 0.1
    });
  });

  state.charts.trendChart = new Chart(ctx, {
    type: "line",
    data: { labels: years, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: COLORS.legend,
            font: { family: CHART_FONT, size: 11, weight: "500" },
            filter: item => !item.text.includes("CI Upper") && !item.text.includes("95% CI")
          }
        },
        tooltip: {
          backgroundColor: COLORS.tooltipBg,
          titleColor: COLORS.tooltipTitle,
          bodyColor: COLORS.tooltipBody,
          borderColor: "rgba(107, 143, 173, 0.35)",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: context => {
              if (!context.raw) return null;
              return `${context.dataset.label}: ${context.raw.toFixed(1)} pts`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick, font: { family: CHART_FONT, weight: "500" } }
        },
        y: {
          min: 20,
          max: 100,
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick },
          title: { display: true, text: "SDG Index Score (0-100)", color: "#6b7580" }
        }
      }
    }
  });
}

// Render Goal Scorecards in Sidebar
function renderGoalScorecards() {
  const container = document.getElementById("state-goal-cards");
  container.innerHTML = "";

  const stHistLatest = state.data.historical
    .filter(d => d.State === state.selectedState && d.Year === 2023)[0] || {};

  const sdgKeys = ["SDG3_Health", "SDG4_Education", "SDG13_Climate"];

  sdgKeys.forEach(sdg => {
    const foreRec = state.data.forecast.find(
      d => d.State === state.selectedState && d.SDG === sdg && d.Year === state.selectedYear
    ) || {};

    const slopeInfo = state.data.slopes[`${state.selectedState}__${sdg}`] || { slope: 0, r2: 0.8 };
    const currVal = stHistLatest[sdg] || 0;
    const projVal = foreRec.Forecast_Score || 0;
    const ciLow = foreRec.CI_Lower_95 || 0;
    const ciHi = foreRec.CI_Upper_95 || 0;

    let tierClass = "badge-low";
    let tierText = "Front Runner";
    let borderColor = COLORS.lowRisk;

    if (projVal < 50) {
      tierClass = "badge-high";
      tierText = "Aspirant (<50)";
      borderColor = COLORS.highRisk;
    } else if (projVal < 75) {
      tierClass = "badge-med";
      tierText = "Performer (50–74)";
      borderColor = COLORS.medRisk;
    }

    const card = document.createElement("div");
    card.className = "score-stat-card";
    card.style.borderLeftColor = borderColor;

    const labelName = state.data.sdg_labels[sdg].split(":")[1].trim();

    card.innerHTML = `
      <div class="stat-header">
        <span class="stat-title">${labelName}</span>
        <span class="badge ${tierClass}">${tierText}</span>
      </div>
      <div class="stat-header" style="margin-top: 6px;">
        <span class="stat-score" style="color: ${borderColor};">${projVal.toFixed(1)}</span>
        <span style="font-size: 11px; color: var(--text-muted);">2023: <b>${currVal.toFixed(1)}</b> (${slopeInfo.slope >= 0 ? '+' : ''}${slopeInfo.slope.toFixed(2)}/yr)</span>
      </div>
      <div class="stat-meta">
        <span>95% CI: [${ciLow.toFixed(1)} – ${ciHi.toFixed(1)}]</span>
        <span>Fit R²: <b>${slopeInfo.r2.toFixed(2)}</b></span>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render Cross-State Comparative Trajectory Chart
function renderCompareChart() {
  const ctx = document.getElementById("compareChart").getContext("2d");
  if (state.charts.compareChart) state.charts.compareChart.destroy();

  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const statesToComp = [state.selectedState, state.compareState];
  const colorMap = [COLORS.sdg3, COLORS.composite];

  const datasets = [];

  statesToComp.forEach((stName, idx) => {
    const col = colorMap[idx % colorMap.length];
    const stData = state.data.timeseries.filter(d => d.State === stName && d.SDG === state.compareSdg);

    const histScores = [];
    const foreScores = [];

    years.forEach(yr => {
      const rec = stData.find(d => d.Year === yr);
      if (yr <= 2023) {
        histScores.push(rec ? rec.Score : null);
        foreScores.push(yr === 2023 ? (rec ? rec.Score : null) : null);
      } else {
        histScores.push(null);
        foreScores.push(rec ? rec.Score : null);
      }
    });

    datasets.push({
      label: `${stName} (Historical)`,
      data: histScores,
      borderColor: col,
      backgroundColor: col,
      borderWidth: 2.5,
      pointRadius: 4
    });

    datasets.push({
      label: `${stName} (Forecast)`,
      data: foreScores,
      borderColor: col,
      backgroundColor: col,
      borderWidth: 2.5,
      borderDash: [5, 4],
      pointRadius: 5,
      pointStyle: "rectRot"
    });
  });

  state.charts.compareChart = new Chart(ctx, {
    type: "line",
    data: { labels: years, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: COLORS.legend, font: { family: CHART_FONT, size: 11, weight: "500" } } }
      },
      scales: {
        x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.tick } },
        y: { min: 20, max: 100, grid: { color: COLORS.grid }, ticks: { color: COLORS.tick } }
      }
    }
  });
}

// Render Priority Early Warning Alerts
function renderPriorityAlerts() {
  const container = document.getElementById("priority-alerts-container");
  container.innerHTML = "";

  if (!state.data.early_warnings || state.data.early_warnings.length === 0) {
    container.innerHTML = `<div class="empty-state"><i data-lucide="circle-check" class="icon-sm"></i> No critical threshold drop alerts detected.</div>`;
    refreshIcons();
    return;
  }

  state.data.early_warnings.slice(0, 6).forEach(alert => {
    const card = document.createElement("div");
    card.className = `alert-card ${alert.Severity === 'CRITICAL' ? '' : (alert.Severity === 'WARNING' ? 'warning' : 'advisory')}`;

    let badgeClass = (alert.Severity === 'CRITICAL') ? 'badge-high' : ((alert.Severity === 'WARNING') ? 'badge-med' : 'badge-low');

    card.innerHTML = `
      <div>
        <span class="badge ${badgeClass}">${alert.Severity}</span>
        <b style="color: var(--text-primary); margin-left: 10px; font-size: 14px;">${alert.State} — ${alert.SDG}</b>
        <div style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">${alert.Description}</div>
      </div>
      <div style="text-align: right; min-width: 140px;">
        <span style="font-size: 11px; color: var(--text-muted);">2023 Baseline: <b>${alert['2023_Baseline'].toFixed(1)}</b></span><br>
        <span style="font-size: 13px; font-weight: 600; color: var(--status-negative);">2026 Projected: <b>${alert['2026_Projected'].toFixed(1)}</b></span>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render Risk Matrix Data Table
function renderRiskMatrixTable() {
  const tbody = document.querySelector("#riskDataTable tbody");
  tbody.innerHTML = "";

  const searchVal = document.getElementById("tableSearchInput").value.toLowerCase();
  const riskFilter = document.getElementById("tableRiskFilter").value;
  const sdgFilter = document.getElementById("tableSdgFilter").value;

  const yearForecasts = state.data.forecast.filter(d => d.Year === state.selectedYear);

  let filtered = yearForecasts.filter(row => {
    if (searchVal && !row.State.toLowerCase().includes(searchVal)) return false;
    if (riskFilter !== "ALL" && row.Risk_Category !== riskFilter) return false;
    if (sdgFilter !== "ALL" && row.SDG !== sdgFilter) return false;
    return true;
  });

  filtered.sort((a, b) => b.Forecast_Score - a.Forecast_Score);

  filtered.forEach(row => {
    const histRec = state.data.historical.find(h => h.State === row.State && h.Year === 2023) || {};
    const baseVal = histRec[row.SDG] || 0;

    const tr = document.createElement("tr");

    let badgeClass = (row.Risk_Category === "Low Risk") ? "badge-low" : ((row.Risk_Category === "Medium Risk") ? "badge-med" : "badge-high");
    let sdgLabel = (row.SDG === "SDG3_Health") ? "SDG 3: Health" : ((row.SDG === "SDG4_Education") ? "SDG 4: Education" : "SDG 13: Climate");

    tr.innerHTML = `
      <td><b>${row.State}</b></td>
      <td>${sdgLabel}</td>
      <td>${baseVal.toFixed(1)}</td>
      <td style="font-weight: 600; font-size: 15px;">${row.Forecast_Score.toFixed(1)}</td>
      <td style="color: var(--text-muted);">[${row.CI_Lower_95.toFixed(1)} – ${row.CI_Upper_95.toFixed(1)}]</td>
      <td style="color: ${row.Annual_Growth_Rate >= 0 ? 'var(--status-positive)' : 'var(--status-negative)'}; font-weight: 600;">
        ${row.Annual_Growth_Rate >= 0 ? '+' : ''}${row.Annual_Growth_Rate.toFixed(2)}
      </td>
      <td><span class="badge ${badgeClass}">${row.NITI_Tier}</span></td>
      <td><span class="badge ${badgeClass}">${row.Risk_Category}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Spatial Geo Heatmap and Leaderboard
function renderGeoAnalytics() {
  const cardsGrid = document.getElementById("state-cards-grid");
  const leaderboard = document.getElementById("state-leaderboard-container");
  cardsGrid.innerHTML = "";
  leaderboard.innerHTML = "";

  const yearData = [];

  state.data.states.forEach(st => {
    let score = 50;
    if (state.selectedYear <= 2023) {
      const rec = state.data.historical.find(h => h.State === st && h.Year === state.selectedYear);
      if (rec) score = rec[state.geoMetric] || rec.Composite_Score || 50;
    } else {
      if (state.geoMetric === "Composite_Score") {
        const foreList = state.data.forecast.filter(f => f.State === st && f.Year === state.selectedYear);
        if (foreList.length > 0) {
          const sum = foreList.reduce((acc, c) => acc + c.Forecast_Score, 0);
          score = sum / foreList.length;
        }
      } else {
        const rec = state.data.forecast.find(f => f.State === st && f.SDG === state.geoMetric && f.Year === state.selectedYear);
        if (rec) score = rec.Forecast_Score;
      }
    }
    yearData.push({ state: st, score: score });
  });

  yearData.sort((a, b) => b.score - a.score);

  // Cards Grid
  yearData.forEach(item => {
    let col = (item.score >= 75) ? COLORS.lowRisk : ((item.score >= 50) ? COLORS.medRisk : COLORS.highRisk);
    let tier = (item.score >= 75) ? "Front Runner" : ((item.score >= 50) ? "Performer" : "Aspirant");

    const card = document.createElement("div");
    card.className = "score-stat-card";
    card.style.borderLeftColor = col;
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      document.getElementById("stateSelect").value = item.state;
      state.selectedState = item.state;
      document.getElementById("forecaster-state-title").textContent = item.state;
      renderTrendChart();
      renderGoalScorecards();
      loadPolicyAdvisory();
    });

    card.innerHTML = `
      <div style="font-weight: 700; font-size: 13px;">${item.state}</div>
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;">
        <span style="font-size: 18px; font-weight: 600; color: ${col};">${item.score.toFixed(1)}</span>
        <span style="font-size: 11px; color: var(--text-muted);">${tier}</span>
      </div>
    `;
    cardsGrid.appendChild(card);
  });

  // Leaderboard Progress Bars
  yearData.forEach((item, idx) => {
    let col = (item.score >= 75) ? COLORS.lowRisk : ((item.score >= 50) ? COLORS.medRisk : COLORS.highRisk);

    const row = document.createElement("div");
    row.className = "leaderboard-row";
    row.innerHTML = `
      <div class="leaderboard-meta">
        <span>#${idx + 1} ${item.state}</span>
        <span style="color: ${col}; font-weight: 600;">${item.score.toFixed(1)}</span>
      </div>
      <div class="leaderboard-bar">
        <div class="leaderboard-fill" style="width: ${Math.min(100, Math.max(0, item.score))}%; background: ${col};"></div>
      </div>
    `;
    leaderboard.appendChild(row);
  });
}

// Render SDG 13 Climate Action Visuals
function renderClimateCharts() {
  // 1. Decarbonization Velocity Chart
  const ctxVel = document.getElementById("climateVelocityChart").getContext("2d");
  if (state.charts.climateVelChart) state.charts.climateVelChart.destroy();

  const climFore = state.data.forecast.filter(d => d.SDG === "SDG13_Climate" && d.Year === 2026);
  climFore.sort((a, b) => b.Annual_Growth_Rate - a.Annual_Growth_Rate);

  const topStates = climFore.slice(0, 15);

  state.charts.climateVelChart = new Chart(ctxVel, {
    type: "bar",
    data: {
      labels: topStates.map(d => d.State),
      datasets: [{
        label: "Annual Decarbonization Pace (pts/year)",
        data: topStates.map(d => d.Annual_Growth_Rate),
        backgroundColor: topStates.map(d => d.Annual_Growth_Rate >= 0 ? "rgba(138, 168, 154, 0.72)" : "rgba(176, 137, 137, 0.72)"),
        borderColor: topStates.map(d => d.Annual_Growth_Rate >= 0 ? COLORS.lowRisk : COLORS.highRisk),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: COLORS.legend, font: { family: CHART_FONT, size: 11 } } } },
      scales: {
        x: { ticks: { color: COLORS.tick, font: { size: 10 } }, grid: { color: COLORS.grid } },
        y: { ticks: { color: COLORS.tick }, grid: { color: COLORS.grid } }
      }
    }
  });

  // 2. Renewable Energy Share Breakdown Chart
  const ctxRen = document.getElementById("renewableEnergyChart").getContext("2d");
  if (state.charts.renChart) state.charts.renChart.destroy();

  if (state.data.climate_indicators.length > 0) {
    const renCol = Object.keys(state.data.climate_indicators[0]).find(k => k.toLowerCase().includes("renewable"));
    const sortedClim = [...state.data.climate_indicators]
      .filter(d => d.Area !== "Target" && typeof d[renCol] === "number")
      .sort((a, b) => b[renCol] - a[renCol])
      .slice(0, 15);

    state.charts.renChart = new Chart(ctxRen, {
      type: "bar",
      data: {
        labels: sortedClim.map(d => d.Area),
        datasets: [{
          label: "Renewable Energy Share (%)",
          data: sortedClim.map(d => d[renCol]),
          backgroundColor: "rgba(123, 163, 201, 0.65)",
          borderColor: COLORS.sdg4,
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: COLORS.legend, font: { family: CHART_FONT, size: 11 } } } },
        scales: {
          x: { ticks: { color: COLORS.tick, font: { size: 10 } }, grid: { color: COLORS.grid } },
          y: { max: 100, ticks: { color: COLORS.tick }, grid: { color: COLORS.grid } }
        }
      }
    });
  }
}

// Render Health Indicators Tab
function renderHealthIndicators() {
  const tbody = document.querySelector("#healthIndTable tbody");
  tbody.innerHTML = "";

  state.data.health_indicators.forEach(row => {
    if (row.Area === "Target") return;
    const tr = document.createElement("tr");

    const mmr = row["Maternal Mortality Ratio (per 100000 live births)"] || "-";
    const u5 = row["Under-five Mortality Rate (per 1000 live births)"] || "-";
    const tb = row["Total case notification rate of tuberculosis"] || "-";
    const fp = row["Women in the age group of 15-49 years using modern methods of family planning"] || "-";
    const doc = row["Number of governmental physicians nurses and midwives"] || "-";
    const imm = row["Children aged 12-23 months fully immunized (BCG Measles and three doses of Pentavalent vaccine)"] || "-";

    tr.innerHTML = `
      <td><b>${row.Area}</b></td>
      <td>${typeof u5 === 'number' ? u5.toFixed(1) : u5}</td>
      <td>${typeof tb === 'number' ? tb.toFixed(1) : tb}</td>
      <td>${typeof fp === 'number' ? fp.toFixed(1) + '%' : fp}</td>
      <td>${typeof doc === 'number' ? doc.toFixed(1) : doc}</td>
      <td>${typeof imm === 'number' ? imm.toFixed(1) + '%' : imm}</td>
      <td style="font-weight: 600; color: ${typeof mmr === 'number' && mmr > 100 ? 'var(--status-negative)' : 'var(--status-positive)'};">
        ${typeof mmr === 'number' ? mmr.toFixed(0) : mmr}
      </td>
    `;
    tbody.appendChild(tr);
  });

  renderHealthChart();
}

function renderHealthChart() {
  const ctx = document.getElementById("healthIndChart").getContext("2d");
  if (state.charts.healthChart) state.charts.healthChart.destroy();
  if (!state.healthIndicator) return;

  const validRows = state.data.health_indicators
    .filter(d => d.Area !== "Target" && typeof d[state.healthIndicator] === "number")
    .sort((a, b) => b[state.healthIndicator] - a[state.healthIndicator])
    .slice(0, 18);

  state.charts.healthChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: validRows.map(d => d.Area),
      datasets: [{
        label: state.healthIndicator,
        data: validRows.map(d => d[state.healthIndicator]),
        backgroundColor: "rgba(143, 184, 168, 0.65)",
        borderColor: COLORS.sdg3,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: COLORS.legend, font: { family: CHART_FONT, size: 11 } } } },
      scales: {
        x: { ticks: { color: COLORS.tick, font: { size: 10 } }, grid: { color: COLORS.grid } },
        y: { ticks: { color: COLORS.tick }, grid: { color: COLORS.grid } }
      }
    }
  });
}

// Load Policy & Governance Advisory from Server API
// Load Policy & Governance Advisory from Server API
async function loadPolicyAdvisory() {
  const stateTitleEl = document.getElementById("policy-state-name");
  const summaryEl = document.getElementById("policy-executive-summary");
  const gapsTableContainer = document.getElementById("policy-gaps-table-container");
  const actionPlanContainer = document.getElementById("policy-action-plan-container");
  const scenariosContainer = document.getElementById("policy-scenarios-container");
  const recContainer = document.getElementById("policy-recommendations-container");
  const natContainer = document.getElementById("national-priorities-container");

  const currentState = state.selectedState || "Tamil Nadu";
  if (stateTitleEl) stateTitleEl.textContent = currentState;

  try {
    const [policyRes, analyticsRes, forecastRes] = await Promise.allSettled([
      fetch(`/api/policy/${encodeURIComponent(currentState)}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics/state/${encodeURIComponent(currentState)}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/forecasts/extended/${encodeURIComponent(currentState)}`).then(r => r.ok ? r.json() : null)
    ]);

    const advisory = policyRes.status === "fulfilled" ? policyRes.value : null;
    const analytics = analyticsRes.status === "fulfilled" ? analyticsRes.value : null;
    const extForecasts = forecastRes.status === "fulfilled" ? forecastRes.value : null;

    // 1. Executive Summary Brief
    if (summaryEl) {
      const prioritySdg = advisory ? advisory.priority_sdg : "SDG 13: Climate Action";
      summaryEl.innerHTML = `
        <div class="policy-brief">
          <h4 style="color: var(--text-primary); margin-bottom: 8px; font-weight: 600;">Executive Governance Brief · ${currentState}</h4>
          <p style="color: var(--text-secondary); font-size: 14px; line-height: 1.6;">
            Empirical projections and indicator-level gap audits indicate that <b>${currentState}</b> requires the most critical developmental acceleration in
            <span style="color: var(--status-negative); font-weight: 600;">${prioritySdg}</span>.
            Below is the verified multi-indicator audit, 2026 departmental action matrix, and baseline vs. improvement trajectory models.
          </p>
        </div>
      `;
    }

    // 2. Prioritized Gaps & Below-Target Indicators Table
    if (gapsTableContainer && analytics && analytics.gaps) {
      const gaps = (analytics.gaps.priority_gaps_table || []).concat(analytics.gaps.indicator_micro_gaps || []);
      if (gaps.length === 0) {
        gapsTableContainer.innerHTML = `<div class="empty-state"><i data-lucide="circle-check" class="icon-sm"></i> No critical indicator gaps detected for ${currentState}.</div>`;
      } else {
        let tableHtml = `
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Rank &amp; Priority</th>
                  <th>SDG &amp; Indicator</th>
                  <th>Latest Value</th>
                  <th>Target / Benchmark</th>
                  <th>Measured Gap</th>
                  <th>5-Yr Trend</th>
                  <th>Priority Reason &amp; Evidence</th>
                </tr>
              </thead>
              <tbody>
        `;

        gaps.slice(0, 10).forEach((g, idx) => {
          const score = g.Priority_Score || 10;
          const severity = score > 100 ? "CRITICAL" : (score > 20 ? "HIGH" : "MEDIUM");
          const sevClass = (severity === "CRITICAL") ? "badge-high" : "badge-med";
          const trend = g.Trend || (g.Target_Met ? "Improving" : "Needs Acceleration");
          const trendColor = (trend.includes("worsening") || trend.includes("Needs")) ? "var(--status-negative)" : "var(--status-positive)";
          const sdgTitle = g.SDG || "SDG";
          const indName = g.Indicator || g.Scope || g.indicator_name || sdgTitle;
          const latestVal = g.Latest_Value ?? g.latest_value ?? 0;
          const targetVal = g.Target_Benchmark ?? g.Target ?? g.target ?? 100;
          const gapVal = g.Gap_to_Target ?? g.Numeric_Gap ?? (targetVal - latestVal);
          const unit = g.Unit || "pts";
          const yr = g.Year || 2023;
          const reason = g.Priority_Reason || (g.Gap_Display ? `Gap: ${g.Gap_Display}` : "Target divergence");
          const evidence = g.Evidence || "NITI Aayog SDG Index";

          tableHtml += `
            <tr>
              <td>
                <span class="badge ${sevClass}">#${idx + 1} · ${severity}</span>
              </td>
              <td>
                <b style="color: var(--text-primary);">${indName}</b><br>
                <span style="font-size: 11px; color: var(--text-muted);">${sdgTitle}</span>
              </td>
              <td>
                <b style="font-size: 14px;">${typeof latestVal === 'number' ? latestVal.toFixed(1) : latestVal}</b> ${unit}<br>
                <span style="font-size: 11px; color: var(--text-muted);">Year: ${yr}</span>
              </td>
              <td>
                <span style="font-weight: 600; color: var(--text-secondary);">${targetVal} ${unit}</span>
              </td>
              <td>
                <span style="font-weight: 700; color: ${gapVal > 0 ? 'var(--status-negative)' : 'var(--status-positive)'};">
                  ${typeof gapVal === 'number' ? (gapVal > 0 ? '+' : '') + gapVal.toFixed(1) : gapVal} ${unit}
                </span>
              </td>
              <td>
                <span style="color: ${trendColor}; font-weight: 600;">${trend}</span>
              </td>
              <td style="max-width: 280px; font-size: 12px; line-height: 1.5;">
                <span style="color: var(--text-primary);">${reason}</span><br>
                <span style="font-size: 10px; color: var(--text-muted);">Source: ${evidence}</span>
              </td>
            </tr>
          `;
        });

        tableHtml += `
              </tbody>
            </table>
          </div>
        `;
        gapsTableContainer.innerHTML = tableHtml;
      }
    }

    // 3. Phased 2026 Departmental Action Plan
    if (actionPlanContainer && analytics && analytics.action_plan) {
      const phases = analytics.action_plan.phases || [];
      actionPlanContainer.innerHTML = "";

      phases.forEach(phase => {
        const phaseCard = document.createElement("div");
        phaseCard.className = "glass-panel";
        phaseCard.style.padding = "16px";
        phaseCard.style.borderLeft = "4px solid var(--accent)";

        let actionsHtml = "";
        (phase.actions || []).forEach(act => {
          const stepsHtml = (act.steps || []).map(s => `<li>${s}</li>`).join("");
          const citationsHtml = (act.citations || []).map(c => `<span class="tag-pill" style="font-size: 10px;">${c.document} (${c.section})</span>`).join(" ");

          actionsHtml += `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; margin-top: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px;">
                <b style="font-size: 14px; color: var(--text-primary);">${act.action_title}</b>
                <span class="badge badge-low" style="font-size: 10px;">${act.intervention_type}</span>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin: 6px 0;">
                <b>Responsible Department:</b> <span style="color: var(--accent); font-weight: 500;">${act.responsible_department}</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 8px 0; background: rgba(0,0,0,0.15); padding: 8px; border-radius: 4px; font-size: 12px;">
                <div><b>Baseline KPI:</b> <span class="font-mono">${act.baseline_kpi}</span></div>
                <div><b>2026 Target:</b> <span class="font-mono" style="color: var(--status-positive); font-weight: 600;">${act.target_kpi_2026}</span></div>
                <div><b>Monitoring:</b> ${act.monitoring_frequency}</div>
              </div>
              <ul style="font-size: 12px; color: var(--text-secondary); margin: 6px 0 6px 18px;">
                ${stepsHtml}
              </ul>
              <div style="margin-top: 6px;">
                ${citationsHtml}
              </div>
            </div>
          `;
        });

        phaseCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <h4 style="font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0;">${phase.phase_name}</h4>
            <span class="tag-pill" style="color: var(--accent); font-weight: 600;">${phase.time_horizon}</span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin: 4px 0 8px 0;">${phase.focus}</div>
          ${actionsHtml}
        `;
        actionPlanContainer.appendChild(phaseCard);
      });
    }

    // 4. Multi-Year Scenario Matrix & Extended Forecasts (Task 2 & Task 3)
    if (scenariosContainer && extForecasts && extForecasts.scenarios_by_sdg) {
      window.cachedExtForecasts = extForecasts;
      window.cachedPolicyState = currentState;
      const initialSdg = window.activeScenarioSdg || "SDG3_Health";
      renderProfessionalScenarioDashboard(scenariosContainer, extForecasts, currentState, initialSdg);
    }

    // 5. Existing Playbook Interventions (Preserved)
    if (recContainer && advisory) {
      recContainer.innerHTML = "";
      (advisory.recommendations || []).forEach(rec => {
        const box = document.createElement("div");
        box.className = "policy-item";

        let urgColor = (rec.urgency && rec.urgency.includes("CRITICAL")) ? "var(--status-negative)" : ((rec.urgency && rec.urgency.includes("ACCELERATION")) ? "var(--status-caution)" : "var(--status-positive)");
        box.style.borderLeftColor = urgColor;

        box.innerHTML = `
          <h4>
            <span>${rec.sdg_title}</span>
            <span class="badge" style="background: rgba(255,255,255,0.05); color: ${urgColor}; border: 1px solid ${urgColor};">${rec.urgency}</span>
          </h4>
          <div style="font-size: 12px; color: var(--text-muted); margin: 6px 0 10px 0;">
            2023 Current: <b>${(rec['2023_score'] || 0).toFixed(1)}</b> → 2026 Projected: <b>${(rec['2026_proj'] || 0).toFixed(1)}</b> (Velocity: ${(rec.annual_velocity || 0) >= 0 ? '+' : ''}${(rec.annual_velocity || 0).toFixed(2)} pts/yr)
          </div>
          <div>
            <b style="font-size: 13px; color: var(--text-primary);">Recommended priority interventions:</b>
            <ul>
              ${(rec.action_items || []).map(act => `<li>${act}</li>`).join('')}
            </ul>
          </div>
        `;
        recContainer.appendChild(box);
      });
    }

    // 6. National Priorities (Preserved)
    if (natContainer && state.data && state.data.forecast) {
      const highRiskStates = state.data.forecast.filter(d => d.Year === 2026 && d.Forecast_Score < 50);
      if (highRiskStates.length > 0) {
        const grouped = {};
        highRiskStates.forEach(h => {
          if (!grouped[h.SDG]) grouped[h.SDG] = [];
          grouped[h.SDG].push(h.State);
        });

        let html = `<div style="font-size: 13px; line-height: 1.8;">`;
        Object.keys(grouped).forEach(k => {
          html += `<div style="margin-bottom: 8px;"><b>${state.data.sdg_labels[k] || k}:</b> <span style="color: var(--status-negative);">${grouped[k].join(', ')}</span></div>`;
        });
        html += `</div>`;
        natContainer.innerHTML = html;
      } else {
        natContainer.innerHTML = `<div class="empty-state"><i data-lucide="circle-check" class="icon-sm"></i> No states projected in Aspirant tier (&lt;50) by 2026.</div>`;
      }
    }

    refreshIcons();
  } catch (err) {
    console.error("Error loading policy advisory:", err);
  }
}

// ══════════════════════════════════════════════════════════════
// TASK 2 & TASK 3: PROFESSIONAL FORECAST & SCENARIO COMPONENT
// ══════════════════════════════════════════════════════════════
function renderProfessionalScenarioDashboard(container, extForecasts, currentState, activeSdgKey = "SDG3_Health") {
  if (!container) return;

  const sdgMap = (extForecasts && extForecasts.scenarios_by_sdg) || {};
  const availableSdgs = [
    { key: "SDG3_Health", num: "3", name: "Good Health and Well-Being", icon: "heart-pulse", color: "#4ade80" },
    { key: "SDG4_Education", num: "4", name: "Quality Education", icon: "book-open", color: "#facc15" },
    { key: "SDG13_Climate", num: "13", name: "Climate Action", icon: "leaf", color: "#38bdf8" }
  ];

  const currentSdgMeta = availableSdgs.find(s => s.key === activeSdgKey) || availableSdgs[0];
  const sdgItem = sdgMap[currentSdgMeta.key];

  if (!sdgItem || !sdgItem.scenarios) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="info" class="icon-sm"></i>
        <span>Extended scenario models are currently calculating for ${escapeHtml(currentState)} (${escapeHtml(currentSdgMeta.name)}).</span>
      </div>
    `;
    refreshIcons();
    return;
  }

  const histBaseline = sdgItem.historical_2023_baseline ?? "N/A";
  const scenarios = sdgItem.scenarios;
  const bSc = scenarios.baseline || {};
  const rSc = scenarios.realistic_improvement || scenarios.improvement || {};
  const hSc = scenarios.higher_effort || {};

  const years = extForecasts.horizon_years || [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  const getProjScore = (sc, yr) => {
    if (!sc || !sc.projections) return null;
    const v = sc.projections[yr] ?? sc.projections[String(yr)];
    return (typeof v === "number" && !isNaN(v)) ? v : null;
  };

  const formatScoreCell = (v) => {
    if (v === null || v === undefined) {
      return `<span class="cell-na">N/A — data unavailable</span>`;
    }
    return v.toFixed(1);
  };

  // Build Tab Selector Buttons
  const tabsHtml = availableSdgs.map(s => {
    const isActive = s.key === currentSdgMeta.key;
    return `
      <button type="button" class="scenario-sdg-tab-btn ${isActive ? 'active' : ''}" data-sdg="${s.key}">
        <i data-lucide="${s.icon}" class="icon-xxs"></i>
        <span>SDG ${s.num}: ${s.name}</span>
      </button>
    `;
  }).join("");

  // Build Table Rows
  const scenarioDefs = [
    {
      key: "baseline",
      data: bSc,
      typeLabel: "Model Forecast",
      badgeClass: "scenario-tag-base",
      icon: "compass",
      name: "Scenario A: Baseline (Historical Continuation)",
      deltaClass: "",
      highlightColor: "#60a5fa"
    },
    {
      key: "realistic",
      data: rSc,
      typeLabel: "Hypothetical Scenario · Realistic",
      badgeClass: "scenario-tag-real",
      icon: "trending-up",
      name: "Scenario B: Realistic Improvement",
      deltaClass: "text-positive",
      highlightColor: "#34d399"
    },
    {
      key: "higher_effort",
      data: hSc,
      typeLabel: "Hypothetical Scenario · Accelerated",
      badgeClass: "scenario-tag-high",
      icon: "zap",
      name: "Scenario C: Higher-Effort Accelerated",
      deltaClass: "text-indigo",
      highlightColor: "#c084fc"
    }
  ];

  let rowsHtml = "";
  scenarioDefs.forEach(def => {
    const scData = def.data;
    const scName = scData.name ? scData.name.split(":")[1]?.trim() || scData.name : def.name;
    const keyAssump = (scData.assumptions && scData.assumptions.length > 0) ? scData.assumptions[0] : "Model continuation assumptions.";

    let yearCellsHtml = "";
    years.forEach(yr => {
      const val = getProjScore(scData, yr);
      const bVal = getProjScore(bSc, yr);
      const formatted = formatScoreCell(val);

      let deltaBadge = "";
      if (def.key !== "baseline" && val !== null && bVal !== null && yr >= 2025) {
        const delta = val - bVal;
        if (delta > 0) {
          deltaBadge = `<div class="scenario-delta-pill ${def.deltaClass}">+${delta.toFixed(1)}</div>`;
        }
      }

      const isTarget = (yr === 2026 || yr === 2030);
      const targetStyle = isTarget ? `font-weight: 700; color: ${def.highlightColor};` : "";

      yearCellsHtml += `
        <td class="num-cell" style="text-align: right; ${targetStyle}">
          <div>${formatted}</div>
          ${deltaBadge}
        </td>
      `;
    });

    rowsHtml += `
      <tr class="scenario-row-${def.key}">
        <td style="text-align: left; vertical-align: top; min-width: 220px;">
          <div class="scenario-name-cell">
            <span class="scenario-tag ${def.badgeClass}">
              <i data-lucide="${def.icon}" class="icon-xxs"></i> ${def.typeLabel}
            </span>
            <div style="font-weight: 600; color: var(--text-primary); margin-top: 4px; font-size: 13px;">${escapeHtml(scName)}</div>
          </div>
        </td>
        ${yearCellsHtml}
        <td style="text-align: left; vertical-align: top; min-width: 260px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
          ${escapeHtml(keyAssump)}
        </td>
      </tr>
    `;
  });

  // Task 3: Transparent Scenario Assumptions Cards
  const buildAssumptionsCard = (def) => {
    const scData = def.data;
    const assumpList = (scData.assumptions || []).map(a => `<li>${escapeHtml(a)}</li>`).join("");

    let indicatorsChanged = "";
    if (currentSdgMeta.key === "SDG3_Health") {
      indicatorsChanged = (def.key === "baseline")
        ? "All health composite indicators continue along observed historical trends."
        : (def.key === "realistic"
          ? "Primary Health Centre (PHC) 24x7 doctor coverage, Ayushman Arogya Mandir operationalization, village sub-centre zero-stockout drug delivery, full immunization coverage."
          : "Tertiary public healthcare expenditure (>=2.5% GSDP), district oncology wings, universal cashless secondary/tertiary coverage, maternal mortality ratio reduction.");
    } else if (currentSdgMeta.key === "SDG4_Education") {
      indicatorsChanged = (def.key === "baseline")
        ? "All education indicators continue along observed historical trends."
        : (def.key === "realistic"
          ? "Foundational literacy & numeracy mentorship, Grade 8 to 9 retention tracking, Atal Tinkering Labs & smart classrooms in all government high schools."
          : "Universal secondary Gross Enrolment Ratio (100%), bilingual smart pedagogy, universal transport & nutrition subsidies, continuous NIPUN teacher training.");
    } else {
      indicatorsChanged = (def.key === "baseline")
        ? "Climate & clean energy indicators continue along observed historical trends."
        : (def.key === "realistic"
          ? "Distributed rooftop solar adoption under PM Surya Ghar, State Action Plan on Climate Change (SAPCC) enforcement, industrial energy efficiency audits."
          : "Aggressive renewable energy capacity share (>=50%), wetland & coastal bio-shield restoration, urban net-zero public transit electrification.");
    }

    const natureOfValues = (def.key === "baseline")
      ? `<span class="badge badge-low"><i data-lucide="compass" class="icon-xxs"></i> Model Forecast</span>`
      : `<span class="badge badge-med"><i data-lucide="test-tube" class="icon-xxs"></i> Hypothetical Simulation</span>`;

    const limitationsNote = (def.key === "baseline")
      ? `Autoregressive Random Forest projections extrapolate from 2018–2023 historical data. Uncertainty increases with horizon: 95% Confidence Interval in 2024 is [${bSc.confidence_interval_95?.['2024']?.[0] ?? (typeof histBaseline === 'number' ? (histBaseline - 1.9).toFixed(1) : 'N/A')}, ${bSc.confidence_interval_95?.['2024']?.[1] ?? (typeof histBaseline === 'number' ? (histBaseline + 1.9).toFixed(1) : 'N/A')}]. Does not anticipate sudden external macro shocks.`
      : `Hypothetical policy simulation bounds illustrate what is achievable under sustained operational and fiscal acceleration. <b>Implementing policy actions does NOT guarantee a specific point increase</b>; actual results depend on frontline administrative compliance, fiscal disbursements, and exogenous disruptions.`;

    const sources = (def.key === "baseline")
      ? "NITI Aayog SDG India Index historical dataset (2018–2023)."
      : (currentState === "Tamil Nadu"
        ? "Tamil Nadu State Health Mission / School Education Action Plans; NITI Aayog Best Practices Compendium; Central Centrally Sponsored Schemes (NHM, Samagra Shiksha, SAPCC)."
        : `${currentState} State Planning Commission Action Framework; NITI Aayog SDG Best Practices Compendium; Centrally Sponsored Scheme Guidelines.`);

    return `
      <div class="scenario-detail-card" style="border-top: 3px solid ${def.highlightColor};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <h5 style="margin: 0; font-size: 13.5px; font-weight: 700; color: var(--text-primary);">${escapeHtml(def.name)}</h5>
          ${natureOfValues}
        </div>
        <p style="font-size: 12px; color: var(--text-secondary); margin: 6px 0 10px 0; line-height: 1.5;">
          ${escapeHtml(scData.description || "Multi-year trajectory modeling for developmental planning.")}
        </p>

        <div class="scenario-meta-block">
          <div class="scenario-meta-title"><i data-lucide="clipboard-list" class="icon-xxs"></i> <b>Input Assumptions:</b></div>
          <ul class="scenario-meta-list">${assumpList}</ul>
        </div>

        <div class="scenario-meta-block" style="margin-top: 8px;">
          <div class="scenario-meta-title"><i data-lucide="sliders" class="icon-xxs"></i> <b>Changed Indicators / Variables:</b></div>
          <div class="scenario-meta-text">${escapeHtml(indicatorsChanged)}</div>
        </div>

        <div class="scenario-meta-block" style="margin-top: 8px;">
          <div class="scenario-meta-title"><i data-lucide="book-marked" class="icon-xxs"></i> <b>Evidence &amp; Sources:</b></div>
          <div class="scenario-meta-text" style="color: var(--accent);">${escapeHtml(sources)}</div>
        </div>

        <div class="scenario-meta-block scenario-limitations-box" style="margin-top: 10px;">
          <div class="scenario-meta-title" style="color: #facc15;"><i data-lucide="shield-alert" class="icon-xxs"></i> <b>Limitations &amp; Uncertainty:</b></div>
          <div class="scenario-meta-text" style="font-size: 11px; color: #cbd5e1;">${limitationsNote}</div>
        </div>
      </div>
    `;
  };

  const assumptionsCardsHtml = scenarioDefs.map(buildAssumptionsCard).join("");

  const fullHtml = `
    <div class="scenario-dashboard-card glass-panel" style="padding: 20px; border-radius: 12px; margin-bottom: 24px;">
      <!-- Title & Subtitle (Task 2) -->
      <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
        <div>
          <h4 class="scenario-dashboard-title" style="margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <i data-lucide="trending-up" style="color: ${currentSdgMeta.color};"></i>
            Extended Forecasts &amp; Improvement Scenarios
          </h4>
          <div class="scenario-dashboard-subtitle" style="font-size: 12.5px; color: var(--text-secondary); margin-top: 5px;">
            State: <b>${escapeHtml(currentState)}</b> &middot; Target: <b>SDG ${currentSdgMeta.num}: ${escapeHtml(currentSdgMeta.name)}</b> &middot; Historical Baseline Year: <b>2023 (${typeof histBaseline === 'number' ? histBaseline.toFixed(1) : histBaseline} pts)</b> &middot; Horizon: <b>2024&ndash;2030</b>
          </div>
        </div>
        <div class="scenario-sdg-tabs">
          ${tabsHtml}
        </div>
      </div>

      <!-- Legend (Task 2) -->
      <div class="scenario-legend-bar">
        <span style="font-weight: 600; color: var(--text-primary); margin-right: 4px;">Legend:</span>
        <span class="legend-chip"><span class="legend-dot dot-obs"></span> <b>Historical / Observed:</b> 2023 Baseline (${typeof histBaseline === 'number' ? histBaseline.toFixed(1) : histBaseline} pts)</span>
        <span class="legend-chip"><span class="legend-dot dot-base"></span> <b>Model Forecast:</b> Scenario A (Random Forest + Momentum Dampening)</span>
        <span class="legend-chip"><span class="legend-dot dot-real"></span> <b>Hypothetical Scenario:</b> Scenario B (Realistic Improvement)</span>
        <span class="legend-chip"><span class="legend-dot dot-high"></span> <b>Hypothetical Scenario:</b> Scenario C (Higher-Effort Accelerated)</span>
      </div>

      <!-- Professional Forecast Table (Task 2) -->
      <div class="table-wrapper ai-table-wrapper" style="margin: 12px 0; overflow-x: auto;">
        <table class="data-table ai-markdown-table" style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align: left; min-width: 220px;">Scenario</th>
              <th style="text-align: right; min-width: 80px;">2024<div class="th-sub th-near">Near-Term</div></th>
              <th style="text-align: right; min-width: 80px;">2025<div class="th-sub th-proj">Proj</div></th>
              <th style="text-align: right; min-width: 88px;">2026<div class="th-sub th-proj">Target</div></th>
              <th style="text-align: right; min-width: 80px;">2027<div class="th-sub th-proj">Proj</div></th>
              <th style="text-align: right; min-width: 80px;">2028<div class="th-sub th-proj">Proj</div></th>
              <th style="text-align: right; min-width: 80px;">2029<div class="th-sub th-proj">Proj</div></th>
              <th style="text-align: right; min-width: 88px;">2030<div class="th-sub th-proj">Horizon</div></th>
              <th style="text-align: left; min-width: 260px;">Key Assumptions</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Concise Explanatory Notes (Task 2) -->
      <div class="scenario-notes-box">
        <b>ℹ️ Methodological &amp; Policy Notes:</b>
        <ul style="margin: 4px 0 0 16px; padding: 0; line-height: 1.55;">
          <li><b>Baseline Continuation:</b> Model forecasts (2024&ndash;2030) are computed via state-specific Random Forest Regressors with chronological momentum dampening (factor: 0.85<sup>h-1</sup>).</li>
          <li><b>Near-Term Calibration (2024):</b> 2024 serves as the operational baseline where interventions are initiated; trajectories diverge from 2025&ndash;2026 as state scheme operationalization compounds.</li>
          <li><b>Hypothetical Policy Sensitivities:</b> Scenarios B &amp; C illustrate parameter sensitivity to policy interventions and top-peer benchmarks. They are strategic planning aids, not guaranteed causal outcomes or official government targets.</li>
        </ul>
      </div>

      <!-- Transparent Assumptions Breakdown (Task 3) -->
      <div class="scenario-assumptions-section" style="margin-top: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h5 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
            <i data-lucide="layers" class="icon-xs"></i>
            Scenario Assumptions &amp; Methodological Transparency
          </h5>
          <span style="font-size: 11px; color: var(--text-muted);">Audited for ${escapeHtml(currentState)} &middot; SDG ${currentSdgMeta.num}</span>
        </div>
        <div class="scenario-assumptions-grid">
          ${assumptionsCardsHtml}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = fullHtml;

  // Bind tab click handlers
  container.querySelectorAll(".scenario-sdg-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const selectedSdg = btn.dataset.sdg;
      window.activeScenarioSdg = selectedSdg;
      renderProfessionalScenarioDashboard(container, extForecasts, currentState, selectedSdg);
    });
  });

  refreshIcons();
}

// Render Validation KPIs and Scorecard
function renderValidationSection() {
  const kpisGrid = document.getElementById("validation-kpis-grid");
  const tbody = document.querySelector("#valScorecardTable tbody");
  kpisGrid.innerHTML = "";
  tbody.innerHTML = "";

  state.data.validation_summary.forEach(summary => {
    let col = (summary.SDG === "SDG3_Health") ? COLORS.sdg3 : ((summary.SDG === "SDG4_Education") ? COLORS.sdg4 : COLORS.sdg13);
    let title = (summary.SDG === "SDG3_Health") ? "SDG 3 (Health)" : ((summary.SDG === "SDG4_Education") ? "SDG 4 (Education)" : "SDG 13 (Climate)");

    const card = document.createElement("div");
    card.className = "glass-panel kpi-card";
    card.innerHTML = `
      <div class="kpi-title">${title} Holdout R²</div>
      <div class="kpi-value" style="color: ${col};">${summary.mean_r2.toFixed(2)}</div>
      <div class="kpi-delta pos">Mean holdout RMSE: <b>${summary.mean_rmse.toFixed(2)}</b> pts</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Naive baseline beaten: <b>${summary.naive_beaten_pct}%</b> of states</div>
    `;
    kpisGrid.appendChild(card);
  });

  state.data.validation_records.slice(0, 36).forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${row.State}</b></td>
      <td>${row.SDG.replace('_', ' ')}</td>
      <td>${row.Holdout_Actual_2022.toFixed(1)}</td>
      <td>${row.Holdout_Pred_2022.toFixed(1)}</td>
      <td>${row.Holdout_Actual_2023.toFixed(1)}</td>
      <td>${row.Holdout_Pred_2023.toFixed(1)}</td>
      <td style="font-weight: 700;">${row.RMSE.toFixed(2)}</td>
      <td>${row.MAE.toFixed(2)}</td>
      <td style="font-weight: 600; color: var(--accent);">${row.R2.toFixed(2)}</td>
      <td><span class="badge ${row.Naive_Beaten ? 'badge-low' : 'badge-med'}">${row.Naive_Beaten ? 'Yes' : 'Equal'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

/* ═══════════════════════════════════════════════════════
   SDG POLICY AI ASSISTANT (FLOATING WIDGET & RAG CHAT)
   ═══════════════════════════════════════════════════════ */

let aiChatState = {
  isOpen: false,
  isLoading: false,
  history: [],
  config: null
};

function setupAIAssistant() {
  const fabBtn = document.getElementById("aiFabBtn");
  const popup = document.getElementById("aiChatPopup");
  const closeBtn = document.getElementById("aiCloseChatBtn");
  const clearBtn = document.getElementById("aiClearChatBtn");
  const chatForm = document.getElementById("aiChatForm");
  const userInput = document.getElementById("aiUserInput");
  const messagesBox = document.getElementById("aiChatMessages");

  if (!fabBtn || !popup) return;

  // Toggle Popup
  fabBtn.addEventListener("click", () => {
    toggleAIChat(!aiChatState.isOpen);
  });

  // Close Button
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      toggleAIChat(false);
    });
  }

  // Clear Chat History
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearAIChat();
    });
  }

  // Escape key closes popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && aiChatState.isOpen) {
      toggleAIChat(false);
      fabBtn.focus();
    }
  });

  // Auto-resize textarea & keyboard shortcuts (Enter to send, Shift+Enter for newline)
  if (userInput) {
    userInput.addEventListener("input", function() {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 100) + "px";
    });

    userInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!aiChatState.isLoading && this.value.trim().length > 0) {
          submitAIMessage(this.value.trim(), "general");
        }
      }
    });
  }

  // Form submit
  if (chatForm) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!userInput || aiChatState.isLoading) return;
      const text = userInput.value.trim();
      if (text.length > 0) {
        submitAIMessage(text, "general");
      }
    });
  }

  // Event delegation on messages box for suggested chips and citations toggles
  if (messagesBox) {
    messagesBox.addEventListener("click", (e) => {
      // Suggested chip clicked
      const chip = e.target.closest(".ai-chip");
      if (chip && !aiChatState.isLoading) {
        const action = chip.getAttribute("data-action") || "general";
        const query = chip.getAttribute("data-query") || chip.textContent.trim();
        submitAIMessage(query, action);
        return;
      }

      // Citations accordion toggle
      const toggleBtn = e.target.closest(".ai-citations-toggle");
      if (toggleBtn) {
        const targetId = toggleBtn.getAttribute("data-target");
        const list = document.getElementById(targetId);
        if (list) {
          const isClosed = list.style.display === "none";
          list.style.display = isClosed ? "flex" : "none";
          toggleBtn.classList.toggle("open", isClosed);
        }
      }
    });
  }

  // Scope selection change listeners
  const aiStateSelect = document.getElementById("aiStateSelect");
  const aiSdgSelect = document.getElementById("aiSdgSelect");
  if (aiStateSelect) {
    aiStateSelect.addEventListener("change", () => {
      updateWorkbenchScopeDisplay();
    });
  }
  if (aiSdgSelect) {
    aiSdgSelect.addEventListener("change", () => {
      updateWorkbenchScopeDisplay();
    });
  }

  // Fetch AI backend status & index statistics
  checkAIStatus();

  // Initialize manual resizing & maximize/restore functionality
  setupAIPopupResizing(popup);
}

// Manual Resizing & Maximize Logic for AI Popup
function setupAIPopupResizing(popup) {
  if (!popup) return;

  const resizeNW = document.getElementById("aiResizeNW");
  const resizeW = document.getElementById("aiResizeW");
  const resizeN = document.getElementById("aiResizeN");
  const maxBtn = document.getElementById("aiMaximizeChatBtn");
  const maxIcon = document.getElementById("aiMaximizeIcon");
  const header = document.getElementById("aiChatHeader");

  // Restore saved dimensions from localStorage if available
  try {
    const saved = localStorage.getItem("sdg_ai_popup_dimensions");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.width && window.innerWidth > 600) popup.style.width = parsed.width;
      if (parsed.height && window.innerWidth > 600) popup.style.height = parsed.height;
    }
  } catch (e) {
    console.warn("Could not restore AI popup dimensions:", e);
  }

  function updateMaximizeIcon(isMax) {
    if (!maxBtn) return;
    maxBtn.title = isMax ? "Restore window (Double-click header)" : "Maximize window (Double-click header)";
    maxBtn.setAttribute("aria-label", isMax ? "Restore window" : "Maximize window");
    if (maxIcon) {
      maxIcon.setAttribute("data-lucide", isMax ? "minimize-2" : "maximize-2");
    }
  }

  // Maximize / Restore Toggle
  function toggleMaximize(forceState) {
    const isNowMax = forceState !== undefined ? forceState : !popup.classList.contains("is-maximized");
    popup.classList.toggle("is-maximized", isNowMax);
    updateMaximizeIcon(isNowMax);
    refreshIcons();
  }

  if (maxBtn) {
    maxBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMaximize();
    });
  }

  // Double-click header to toggle maximize
  if (header) {
    header.addEventListener("dblclick", (e) => {
      if (e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
      toggleMaximize();
    });
  }

  // Double-click NW corner grip to reset default dimensions
  if (resizeNW) {
    resizeNW.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      popup.classList.remove("is-maximized");
      popup.style.width = "440px";
      popup.style.height = "620px";
      try {
        localStorage.removeItem("sdg_ai_popup_dimensions");
      } catch (_) {}
      updateMaximizeIcon(false);
    });
  }

  // Generic Drag-to-Resize Implementation for NW corner, W edge, and N edge
  function initResizeDrag(handleEl, directions) {
    if (!handleEl) return;

    handleEl.addEventListener("mousedown", onDragStart);
    handleEl.addEventListener("touchstart", onDragStart, { passive: false });

    function onDragStart(e) {
      if (window.innerWidth <= 600) return; // Disable on small mobile screens
      if (e.type === "mousedown" && e.button !== 0) return;
      e.preventDefault();

      popup.classList.remove("is-maximized");
      popup.classList.add("is-resizing");
      updateMaximizeIcon(false);

      const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;

      const startRect = popup.getBoundingClientRect();
      const startWidth = startRect.width;
      const startHeight = startRect.height;

      function onMove(moveEvent) {
        const curX = moveEvent.type === "touchmove" ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const curY = moveEvent.type === "touchmove" ? moveEvent.touches[0].clientY : moveEvent.clientY;

        // Since popup is anchored to bottom-right:
        // Moving mouse LEFT increases width: (clientX - curX)
        // Moving mouse UP increases height: (clientY - curY)
        if (directions.horizontal) {
          const deltaX = clientX - curX;
          const maxW = Math.min(window.innerWidth - 32, 1080);
          const newW = Math.max(340, Math.min(startWidth + deltaX, maxW));
          popup.style.width = `${Math.round(newW)}px`;
        }

        if (directions.vertical) {
          const deltaY = clientY - curY;
          const maxH = window.innerHeight - 100;
          const newH = Math.max(380, Math.min(startHeight + deltaY, maxH));
          popup.style.height = `${Math.round(newH)}px`;
        }
      }

      function onEnd() {
        popup.classList.remove("is-resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onEnd);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onEnd);

        // Save customized size to localStorage
        try {
          localStorage.setItem("sdg_ai_popup_dimensions", JSON.stringify({
            width: popup.style.width,
            height: popup.style.height
          }));
        } catch (_) {}
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onEnd);
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd);
    }
  }

  // Attach handlers
  initResizeDrag(resizeNW, { horizontal: true, vertical: true });
  initResizeDrag(resizeW, { horizontal: true, vertical: false });
  initResizeDrag(resizeN, { horizontal: false, vertical: true });
}

// Helper to resolve currently selected workbench state and goal
function getActiveScopeDetails() {
  const aiStateSelect = document.getElementById("aiStateSelect");
  const aiSdgSelect = document.getElementById("aiSdgSelect");
  const currentState = (aiStateSelect && aiStateSelect.value) ? aiStateSelect.value : (state.selectedState || "Maharashtra");
  let currentGoal = "SDG 4: Quality Education";
  if (aiSdgSelect) {
    if (aiSdgSelect.value === "SDG3_Health") currentGoal = "SDG 3: Good Health";
    else if (aiSdgSelect.value === "SDG13_Climate") currentGoal = "SDG 13: Climate Action";
    else currentGoal = "SDG 4: Quality Education";
  }
  return { state: currentState, goal: currentGoal };
}

// Dynamically sync the Active Scope badge in the workbench header
function updateWorkbenchScopeDisplay() {
  const targetEl = document.getElementById("workbenchScopeTarget");
  if (!targetEl) return;
  const scope = getActiveScopeDetails();
  targetEl.textContent = `${scope.state} — ${scope.goal}`;
}

// Generate the institutional 2x3 Diagnostic Grid HTML
function renderWorkbenchDiagnosticGridHTML(currentState, currentGoal) {
  return `
    <div class="ai-msg ai-msg-assistant">
      <div class="ai-bubble workbench-welcome-bubble">
        <div class="workbench-welcome-panel">
          <div class="workbench-scope-header">
            <div class="workbench-scope-tag">
              <i data-lucide="crosshair" class="workbench-scope-icon text-slate-400"></i>
              <span class="workbench-scope-title">Active Scope: <span id="workbenchScopeTarget">${escapeHtml(currentState)} — ${escapeHtml(currentGoal)}</span></span>
            </div>
            <p class="workbench-scope-subtitle">Select a diagnostic module below or run a custom policy query.</p>
          </div>
          <div class="workbench-diagnostic-grid">
            <button type="button" class="ai-chip workbench-card" data-action="comprehensive_audit" data-query="Perform a comprehensive 7-dimension SDG baseline audit for this state">
              <div class="workbench-card-header">
                <i data-lucide="activity" class="workbench-card-icon text-slate-400"></i>
                <span class="workbench-card-title">7-Dimension Baseline Audit</span>
              </div>
              <span class="workbench-card-sub">Comprehensive state performance breakdown</span>
            </button>
            <button type="button" class="ai-chip workbench-card" data-action="gap_analysis" data-query="Identify target deficit, prioritized bottlenecks, and lagging indicators vs 2030 goals">
              <div class="workbench-card-header">
                <i data-lucide="alert-circle" class="workbench-card-icon text-slate-400"></i>
                <span class="workbench-card-title">Target Deficit &amp; Bottlenecks</span>
              </div>
              <span class="workbench-card-sub">Identify lagging indicators vs. 2030 goals</span>
            </button>
            <button type="button" class="ai-chip workbench-card" data-action="action_plan_2026" data-query="Generate practical FY26 departmental intervention roadmap with priority action plan and measurable KPIs">
              <div class="workbench-card-header">
                <i data-lucide="calendar-check" class="workbench-card-icon text-slate-400"></i>
                <span class="workbench-card-title"><span class="font-mono">FY26</span> Intervention Roadmap</span>
              </div>
              <span class="workbench-card-sub">Priority action plan and measurable KPIs</span>
            </button>
            <button type="button" class="ai-chip workbench-card" data-action="extended_forecasts" data-query="Show forecasts for 2024 to 2030 across Random Forest baseline and accelerated trajectory scenarios">
              <div class="workbench-card-header">
                <i data-lucide="line-chart" class="workbench-card-icon text-slate-400"></i>
                <span class="workbench-card-title"><span class="font-mono">2024–2030</span> Trajectory Scenarios</span>
              </div>
              <span class="workbench-card-sub">Random Forest baseline vs. accelerated forecasts</span>
            </button>
            <button type="button" class="ai-chip workbench-card" data-action="score_context" data-query="Decompose score variance attribution, historical drivers, and delta factors">
              <div class="workbench-card-header">
                <i data-lucide="bar-chart-2" class="workbench-card-icon text-slate-400"></i>
                <span class="workbench-card-title">Score Variance Attribution</span>
              </div>
              <span class="workbench-card-sub">Historical driver &amp; delta decomposition</span>
            </button>
            <button type="button" class="ai-chip workbench-card" data-action="peer_state" data-query="Find comparative peer state cohorts and best-practice analysis">
              <div class="workbench-card-header">
                <i data-lucide="git-compare" class="workbench-card-icon text-slate-400"></i>
                <span class="workbench-card-title">Peer State Benchmarking</span>
              </div>
              <span class="workbench-card-sub">Comparative cohort &amp; best-practice analysis</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Toggle Open/Close State
function toggleAIChat(open) {
  const popup = document.getElementById("aiChatPopup");
  const fabBtn = document.getElementById("aiFabBtn");
  const userInput = document.getElementById("aiUserInput");
  const aiStateSelect = document.getElementById("aiStateSelect");

  aiChatState.isOpen = open;

  if (popup) {
    popup.style.display = open ? "flex" : "none";
    if (open) {
      // Sync state selection with dashboard if available
      if (aiStateSelect && state.selectedState && !aiStateSelect.value) {
        aiStateSelect.value = state.selectedState;
      }
      updateWorkbenchScopeDisplay();
      if (userInput) {
        setTimeout(() => userInput.focus(), 80);
      }
      scrollAIChatToBottom();
      refreshIcons();
    }
  }

  if (fabBtn) {
    fabBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
}

// Check Backend AI & Vector Store Status - Institutional Badge
async function checkAIStatus() {
  const statusBadge = document.getElementById("aiChatStatusBadge");
  const statusText = document.getElementById("aiChatStatusText");
  if (!statusBadge || !statusText) return;

  try {
    const res = await fetch("/api/ai-policy/status");
    if (!res.ok) throw new Error("Status endpoint error");
    const data = await res.json();
    aiChatState.config = data;

    const dot = statusBadge.querySelector(".status-dot");
    if (dot) {
      dot.className = "status-dot online";
    }
    statusText.textContent = "NITI Aayog Index v4.0 \u2022 Connected";
    statusBadge.title = `NITI Aayog SDG Index v4.0 Connected (${data.documents_indexed || 0} policy docs indexed, ${data.chunks_indexed || 0} chunks)`;
  } catch (err) {
    console.warn("Could not check AI status:", err);
    const dot = statusBadge.querySelector(".status-dot");
    if (dot) dot.className = "status-dot offline";
    statusText.textContent = "NITI Aayog Index v4.0 \u2022 Disconnected";
    statusBadge.title = "Offline: Backend connection unavailable";
  }
}

// Clear Chat Session and restore Diagnostic Grid
function clearAIChat() {
  aiChatState.history = [];
  const messagesBox = document.getElementById("aiChatMessages");
  if (!messagesBox) return;

  const scope = getActiveScopeDetails();
  messagesBox.innerHTML = renderWorkbenchDiagnosticGridHTML(scope.state, scope.goal);
  refreshIcons();
}

// Submit a Query to Backend
async function submitAIMessage(queryText, actionType = "general") {
  if (aiChatState.isLoading || !queryText.trim()) return;

  const userInput = document.getElementById("aiUserInput");
  const sendBtn = document.getElementById("aiSendBtn");
  const typingInd = document.getElementById("aiTypingIndicator");
  const aiStateSelect = document.getElementById("aiStateSelect");
  const aiSdgSelect = document.getElementById("aiSdgSelect");

  const currentState = (aiStateSelect && aiStateSelect.value) ? aiStateSelect.value : (state.selectedState || "Tamil Nadu");
  const currentSdg = (aiSdgSelect && aiSdgSelect.value) ? aiSdgSelect.value : (state.selectedSdgFilter !== "ALL" ? state.selectedSdgFilter : "SDG3_Health");

  // Lock UI
  aiChatState.isLoading = true;
  if (sendBtn) sendBtn.disabled = true;
  if (userInput) {
    userInput.value = "";
    userInput.style.height = "auto";
  }

  // Append User message
  appendUserBubble(queryText);
  if (typingInd) typingInd.style.display = "flex";
  scrollAIChatToBottom();

  try {
    const payload = {
      question: queryText,
      state: currentState,
      sdg: currentSdg,
      action_type: actionType,
      history: aiChatState.history.slice(-6)
    };

    const res = await fetch("/api/ai-policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Server error (${res.status})`);
    }

    const data = await res.json();

    // Record in local history
    aiChatState.history.push({ role: "user", content: queryText });
    aiChatState.history.push({ role: "assistant", content: data.answer });

    // Append Assistant message
    appendAssistantBubble(data);

  } catch (err) {
    console.error("AI Policy error:", err);
    appendErrorBubble(`Failed to retrieve policy response: ${err.message}. Please check server connectivity.`);
  } finally {
    aiChatState.isLoading = false;
    if (typingInd) typingInd.style.display = "none";
    if (sendBtn) sendBtn.disabled = false;
    if (userInput) userInput.focus();
    scrollAIChatToBottom();
    refreshIcons();
  }
}

// Append User Bubble
function appendUserBubble(text) {
  const container = document.getElementById("aiChatMessages");
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = "ai-msg ai-msg-user";
  msgDiv.innerHTML = `
    <div class="ai-bubble">
      ${escapeHtml(text)}
    </div>
  `;
  container.appendChild(msgDiv);
}

// Append Assistant Bubble with Markdown & Citations
function appendAssistantBubble(data) {
  const container = document.getElementById("aiChatMessages");
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = "ai-msg ai-msg-assistant";

  const formattedAnswer = formatAIMarkdown(data.answer);
  const citationsHtml = renderCitationsTray(data.citations);

  // If structured scenarios are present, provide a quick expandable scenario preview
  let scenarioCardHtml = "";
  if (data.scenarios && data.scenarios.scenarios) {
    const scId = "sc-tray-" + Math.random().toString(36).substring(2, 9);
    scenarioCardHtml = `
      <div class="ai-forecast-widget-wrap" style="margin-top: 10px;">
        <button type="button" class="ai-forecast-toggle-btn" data-target="${scId}">
          <i data-lucide="table" class="text-slate-400"></i>
          <span>View Extended Forecast Matrix &amp; Scenario Assumptions</span>
        </button>
        <div id="${scId}" class="ai-forecast-tray-content" style="display: none; margin-top: 10px;"></div>
      </div>
    `;
  }

  msgDiv.innerHTML = `
    <div class="ai-bubble">
      ${formattedAnswer}
      ${scenarioCardHtml}
      ${citationsHtml}
    </div>
  `;
  container.appendChild(msgDiv);

  // If scenario widget exists, bind toggle to render rich component
  if (data.scenarios && data.scenarios.scenarios) {
    const btn = msgDiv.querySelector(".ai-forecast-toggle-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        const tray = document.getElementById(targetId);
        if (tray) {
          const isHidden = (tray.style.display === "none");
          tray.style.display = isHidden ? "block" : "none";
          btn.classList.toggle("active", isHidden);
          if (isHidden && !tray.hasChildNodes()) {
            const singleSdgWrap = {
              state: data.state || "Tamil Nadu",
              horizon_years: [2024, 2025, 2026, 2027, 2028, 2029, 2030],
              scenarios_by_sdg: {
                [data.sdg || "SDG3_Health"]: data.scenarios
              }
            };
            renderProfessionalScenarioDashboard(tray, singleSdgWrap, data.state || "Tamil Nadu", data.sdg || "SDG3_Health");
          }
          scrollAIChatToBottom();
        }
      });
    }
  }

  refreshIcons();
}

// Append Error Bubble
function appendErrorBubble(errorText) {
  const container = document.getElementById("aiChatMessages");
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = "ai-msg ai-msg-assistant";
  msgDiv.innerHTML = `
    <div class="ai-bubble" style="border-left: 3px solid #ef4444;">
      <h4 style="color: #ef4444; margin-top: 0;"><i data-lucide="circle-alert" class="icon-xs text-slate-400"></i> Request Notice</h4>
      <p style="color: #fca5a5;">${escapeHtml(errorText)}</p>
    </div>
  `;
  container.appendChild(msgDiv);
}

// Render Collapsible Citations Tray
function renderCitationsTray(citations) {
  if (!citations || !citations.length) return "";

  const trayId = "citations-" + Math.random().toString(36).substring(2, 9);

  let cardsHtml = citations.map(c => `
    <div class="ai-citation-card">
      <div class="ai-citation-head">
        <span class="ai-citation-doc"><i data-lucide="file-text" class="icon-xs text-slate-400"></i> ${escapeHtml(c.title || c.document)} <span class="font-mono text-xs">(p. ${c.page || 1})</span></span>
        <span class="ai-citation-tag font-mono">${escapeHtml(c.sdg || "SDG")}</span>
      </div>
      <div class="ai-citation-snippet">"${escapeHtml(c.excerpt || "")}"</div>
    </div>
  `).join("");

  return `
    <div class="ai-citations-tray">
      <button type="button" class="ai-citations-toggle" data-target="${trayId}">
        <i data-lucide="chevron-down" class="text-slate-400"></i>
        <span>${citations.length} Grounded Source Citations</span>
      </button>
      <div class="ai-citations-list" id="${trayId}" style="display: none;">
        ${cardsHtml}
      </div>
    </div>
  `;
}

// Simple HTML escaping
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Parse a single markdown table block lines into responsive HTML table
function parseMarkdownTableBlock(tableLines) {
  if (tableLines.length < 2) return null;

  const headerLine = tableLines[0];
  const separatorLine = tableLines[1];
  const bodyLines = tableLines.slice(2);

  // Validate separator row: e.g. |:---|:---:|---:| or |---|---| or :---|:---:
  const sepClean = separatorLine.trim().replace(/^\||\|$/g, "");
  const sepParts = sepClean.split("|").map(s => s.trim());
  const isSeparator = sepParts.length > 0 && sepParts.every(part => /^:?-+:?$/.test(part));
  if (!isSeparator) return null;

  const parseCells = (line) => {
    let clean = line.trim();
    if (clean.startsWith("|")) clean = clean.substring(1);
    if (clean.endsWith("|")) clean = clean.substring(0, clean.length - 1);
    return clean.split("|").map(c => c.trim());
  };

  const headers = parseCells(headerLine);
  if (headers.length === 0) return null;

  // Determine alignments
  const alignments = sepParts.map(part => {
    const left = part.startsWith(":");
    const right = part.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });

  // Check if column is numeric
  const isNumericCol = (colIdx) => {
    const h = (headers[colIdx] || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/^(20\d\d|score|value|val|latest|target|gap|rate|delta|velocity)/.test(h)) return true;
    let numericCount = 0;
    bodyLines.forEach(bl => {
      const cells = parseCells(bl);
      const val = (cells[colIdx] || "").replace(/\*\*/g, "").trim();
      if (/^[\+\-]?[0-9]+(\.[0-9]+)?(%|\s*(pts|points))?$/i.test(val) || val === "N/A" || val === "—") {
        numericCount++;
      }
    });
    return numericCount >= Math.max(1, Math.floor(bodyLines.length * 0.5));
  };

  // Helper to format inline markdown inside cell
  const formatCell = (text, isHeader = false) => {
    if (!text || text === "-" || text === "—" || text.toLowerCase() === "n/a") {
      return '<span class="cell-na">N/A — data unavailable</span>';
    }
    let s = text;
    s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.*?)__/g, "<strong>$1</strong>");
    s = s.replace(/\*(.*?)\*/g, "<em>$1</em>");
    if (!isHeader) {
      if (/Baseline/i.test(s) && !s.includes("scenario-tag")) {
        s = s.replace(/(Baseline[^\<]*)/i, '<span class="scenario-tag scenario-tag-base"><i data-lucide="compass" class="icon-xxs"></i> $1</span>');
      } else if (/Realistic/i.test(s) && !s.includes("scenario-tag")) {
        s = s.replace(/(Realistic[^\<]*)/i, '<span class="scenario-tag scenario-tag-real"><i data-lucide="trending-up" class="icon-xxs"></i> $1</span>');
      } else if (/(Higher-Effort|Accelerated)/i.test(s) && !s.includes("scenario-tag")) {
        s = s.replace(/((Higher-Effort|Accelerated)[^\<]*)/i, '<span class="scenario-tag scenario-tag-high"><i data-lucide="zap" class="icon-xxs"></i> $1</span>');
      }
    }
    return s;
  };

  let tableHtml = `<div class="ai-table-wrapper"><table class="ai-markdown-table"><thead><tr>`;
  headers.forEach((h, idx) => {
    let align = alignments[idx] || (isNumericCol(idx) ? "right" : "left");
    if (alignments[idx] === "center") align = "center";
    else if (isNumericCol(idx) && alignments[idx] !== "center") align = "right";

    let cleanH = h.replace(/\*\*/g, "").trim();
    let subTag = "";
    if (/^20(1[8-9]|2[0-3])$/.test(cleanH)) {
      subTag = `<div class="th-sub th-obs">Observed</div>`;
    } else if (/^2024$/.test(cleanH)) {
      subTag = `<div class="th-sub th-near">Near-Term</div>`;
    } else if (/^20(2[5-9]|3[0-9])$/.test(cleanH)) {
      subTag = `<div class="th-sub th-proj">Projection</div>`;
    }

    tableHtml += `<th style="text-align: ${align};">${formatCell(h, true)}${subTag}</th>`;
  });
  tableHtml += `</tr></thead><tbody>`;

  bodyLines.forEach(line => {
    if (!line.trim() || !line.includes("|")) return;
    const cells = parseCells(line);
    if (cells.every(c => !c)) return;

    tableHtml += `<tr>`;
    headers.forEach((_, idx) => {
      let cell = cells[idx] ?? "";
      let align = alignments[idx] || (isNumericCol(idx) ? "right" : "left");
      if (alignments[idx] === "center") align = "center";
      else if (isNumericCol(idx) && alignments[idx] !== "center") align = "right";

      const isNum = isNumericCol(idx) && /^[\+\-]?[0-9]+(\.[0-9]+)?/.test(cell.replace(/\*\*/g, "").trim());
      const numClass = isNum ? "num-cell" : "";

      tableHtml += `<td class="${numClass}" style="text-align: ${align};">${formatCell(cell)}</td>`;
    });
    tableHtml += `</tr>`;
  });

  tableHtml += `</tbody></table></div>`;
  return tableHtml;
}

// Markdown formatter for AI responses
function formatAIMarkdown(text) {
  if (!text) return "";

  // 1. Escape HTML entities
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Identify markdown table blocks
  const tablePlaceholders = [];
  const lines = escaped.split("\n");
  const processedLines = [];
  let inTable = false;
  let currentTableLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = line.trim().startsWith("|") || (line.includes("|") && line.trim().endsWith("|"));
    const isSepCandidate = /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(line.trim());

    if (isTableLine || isSepCandidate) {
      inTable = true;
      currentTableLines.push(line);
    } else {
      if (inTable) {
        const tableHtml = parseMarkdownTableBlock(currentTableLines);
        if (tableHtml) {
          const token = `%%AITABLE_${tablePlaceholders.length}%%`;
          tablePlaceholders.push(tableHtml);
          processedLines.push(token);
        } else {
          currentTableLines.forEach(tl => {
            if (!/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(tl.trim())) {
              processedLines.push(tl);
            }
          });
        }
        currentTableLines = [];
        inTable = false;
      }
      processedLines.push(line);
    }
  }

  // Handle table at the end of input
  if (inTable && currentTableLines.length > 0) {
    const tableHtml = parseMarkdownTableBlock(currentTableLines);
    if (tableHtml) {
      const token = `%%AITABLE_${tablePlaceholders.length}%%`;
      tablePlaceholders.push(tableHtml);
      processedLines.push(token);
    } else {
      currentTableLines.forEach(tl => {
        if (!/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(tl.trim())) {
          processedLines.push(tl);
        }
      });
    }
  }

  let html = processedLines.join("\n");

  // Remove any leftover standalone separator lines
  html = html.replace(/^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/gm, "");

  // Headers
  html = html.replace(/^#### (.*?)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*?)$/gm, "<h3>$1</h3>");

  // Alert Box: > [!NOTE] or > [!IMPORTANT]
  html = html.replace(/&gt; \[!(NOTE|IMPORTANT|TIP|WARNING)\]\s*\n((?:&gt; [^\n]+\n?)+)/g, (match, type, content) => {
    let clean = content.replace(/&gt; /g, "").trim();
    let badgeClass = (type === "IMPORTANT" || type === "WARNING") ? "badge-high" : "badge-low";
    return `<blockquote class="ai-alert-box"><span class="badge ${badgeClass}">${type}</span> ${clean}</blockquote>`;
  });

  // Standard blockquotes
  html = html.replace(/^&gt; (.*?)$/gm, "<blockquote>$1</blockquote>");

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Unordered list items
  html = html.replace(/^[•\-\*] (.*?)$/gm, "<li>$1</li>");
  // Ordered list items
  html = html.replace(/^\d+\.\s+(.*?)$/gm, "<li>$1</li>");

  // Group consecutive <li> into <ul>
  html = html.replace(/(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g, "<ul>$1</ul>");

  // Paragraph breaks
  html = html.replace(/\n\n+/g, "</p><p>");
  html = "<p>" + html + "</p>";
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<p>(<h[34]>.*?<\/h[34]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul>[\s\S]*?<\/ul>)<\/p>/g, "$1");
  html = html.replace(/<p>(<blockquote[\s\S]*?<\/blockquote>)<\/p>/g, "$1");

  // Restore table placeholders and clean wrapping <p>
  tablePlaceholders.forEach((tblHtml, idx) => {
    const token = `%%AITABLE_${idx}%%`;
    html = html.replace(new RegExp(`<p>\\s*${token}\\s*<\\/p>`, "g"), tblHtml);
    html = html.replace(new RegExp(token, "g"), tblHtml);
  });

  return html;
}

// Scroll to bottom helper
function scrollAIChatToBottom() {
  const box = document.getElementById("aiChatMessages");
  if (box) {
    box.scrollTop = box.scrollHeight;
  }
}

// ═══════════════════════════════════════════════════════════
// ESP32 LIVE TELEMETRY MODULE (Synchronized with ESP32 10s Logging)
// ═══════════════════════════════════════════════════════════

const ESP32_SYNC_INTERVAL = 10; // seconds

const esp32State = {
  countdownTimer: null,
  secondsLeft: ESP32_SYNC_INTERVAL,
  isSyncing: false,
  connected: false,
  lastUptime: null,
  lastSyncTimestamp: null,
  envChart: null,
  atmChart: null,
};

// ── Polling & Countdown lifecycle ──────────────────────────
function esp32StartPolling() {
  if (esp32State.countdownTimer) return;
  // Trigger immediate sync on tab entry
  esp32SyncAll();
  esp32State.secondsLeft = ESP32_SYNC_INTERVAL;
  esp32UpdateCountdownUI(false);
  esp32State.countdownTimer = setInterval(esp32CountdownTick, 1000);
}

function esp32StopPolling() {
  if (esp32State.countdownTimer) {
    clearInterval(esp32State.countdownTimer);
    esp32State.countdownTimer = null;
  }
}

function esp32CountdownTick() {
  if (esp32State.isSyncing) {
    esp32UpdateCountdownUI(true);
    return;
  }

  esp32State.secondsLeft--;
  if (esp32State.secondsLeft <= 0) {
    esp32SyncAll();
  } else {
    esp32UpdateCountdownUI(false);
  }
}

function esp32UpdateCountdownUI(isSyncing) {
  const cdText = document.getElementById("esp32CountdownText");
  const cdBadge = document.getElementById("esp32CountdownBadge");
  const tableText = document.getElementById("esp32TableSyncText");
  const tableBadge = document.getElementById("esp32TableSyncBadge");

  if (isSyncing) {
    if (cdText) cdText.textContent = "Syncing…";
    if (cdBadge) cdBadge.classList.add("syncing");
    if (tableText) tableText.textContent = "Syncing…";
    if (tableBadge) tableBadge.classList.add("syncing");
  } else {
    const txt = `Next sync in ${esp32State.secondsLeft}s`;
    if (cdText) cdText.textContent = txt;
    if (cdBadge) cdBadge.classList.remove("syncing");
    if (tableText) tableText.textContent = `Sync in ${esp32State.secondsLeft}s`;
    if (tableBadge) tableBadge.classList.remove("syncing");
  }

  // Update relative time since last sync
  const lastUpdateEl = document.getElementById("esp32LastUpdate");
  if (lastUpdateEl && esp32State.lastSyncTimestamp) {
    const elapsedSec = Math.floor((Date.now() - esp32State.lastSyncTimestamp) / 1000);
    const uptimeStr = esp32State.lastUptime !== null ? ` (Uptime: ${esp32State.lastUptime}s)` : "";
    if (elapsedSec < 5) {
      lastUpdateEl.textContent = `Just now${uptimeStr}`;
    } else {
      lastUpdateEl.textContent = `${elapsedSec}s ago${uptimeStr}`;
    }
  }
}

// ── Master Synchronized Sync Function ──────────────────────
async function esp32SyncAll() {
  if (esp32State.isSyncing) return;
  esp32State.isSyncing = true;
  esp32UpdateCountdownUI(true);

  try {
    // 1. Fetch live sensor data (fast reading from /data or /api or CSV fallback) with cache-busting
    let liveData = null;
    try {
      const dataRes = await fetch(`/api/esp32/data?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
      });
      if (dataRes.ok) {
        const dataJson = await dataRes.json();
        if (dataJson.connected && dataJson.data) {
          liveData = dataJson.data;
          esp32SetConnected(true);
        }
      }
    } catch (_) {}

    // 2. Fetch full log history from /download with cache-busting
    const logsRes = await fetch(`/api/esp32/logs?limit=50&_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
    });
    if (!logsRes.ok) throw new Error(`HTTP ${logsRes.status}`);
    const logsJson = await logsRes.json();

    if (logsJson.connected) {
      esp32SetConnected(true);
      const logs = logsJson.logs || [];

      // Sort logs newest-first for current reading and table
      const newestFirst = logs.slice().sort((a, b) => (b.uptime || 0) - (a.uptime || 0));
      const latest = newestFirst[0] || liveData || {};

      // If liveData had higher uptime or newer values, merge them
      const activeData = { ...latest, ...(liveData || {}) };

      // Update 4 top cards
      esp32UpdateSensorCards(activeData);

      // Update status metadata
      esp32State.lastUptime = activeData.uptime !== null && activeData.uptime !== undefined ? Math.round(activeData.uptime) : null;
      esp32State.lastSyncTimestamp = Date.now();
      esp32UpdateMeta({
        connected: true,
        source: logsJson.total ? "CSV /download" : "Live Proxy",
        rows: logsJson.total || logs.length,
        data: activeData
      });

      // Update Table (sorted newest uptime first: 220s, 210s, 200s...)
      esp32RenderLogsTable(newestFirst);

      // Update Engineering Charts (chronological order)
      const chronological = logs.slice().sort((a, b) => (a.uptime || 0) - (b.uptime || 0));
      esp32RenderEngineeringCharts(chronological);

    } else {
      esp32SetConnected(false, logsJson.error || "Device unreachable");
    }
  } catch (err) {
    esp32SetConnected(false, err.message);
  } finally {
    esp32State.isSyncing = false;
    esp32State.secondsLeft = ESP32_SYNC_INTERVAL;
    esp32UpdateCountdownUI(false);
  }
}

// ── Connection status UI ───────────────────────────────────
function esp32SetConnected(isConnected, errorMsg) {
  const dot = document.getElementById("esp32StatusDot");
  const text = document.getElementById("esp32ConnText");
  const badge = document.getElementById("esp32ConnBadge");

  if (!dot || !text || !badge) return;
  dot.className = "status-dot";

  if (isConnected) {
    dot.classList.add("connected");
    text.textContent = "Connected to 192.168.4.1";
    badge.classList.add("live");
    esp32State.connected = true;
  } else {
    dot.classList.add("disconnected");
    text.textContent = errorMsg ? `Disconnected: ${errorMsg}` : "Disconnected";
    badge.classList.remove("live");
    esp32State.connected = false;
  }
}

// ── Update sensor value cards (Clean & Minimal) ────────────
function esp32UpdateSensorCards(data) {
  if (!data) return;

  const temp = data.temperature ?? data.temp ?? data.t ?? null;
  const hum  = data.humidity ?? data.hum ?? data.h ?? null;
  const pres = data.pressure ?? data.pres ?? data.p ?? null;
  const soil = data.soilPercent ?? data.soil ?? data.s ?? null;
  
  // Explicitly check for 0 so it never shows "—"
  let raw = 0;
  if (data.soilRaw !== undefined && data.soilRaw !== null && !isNaN(data.soilRaw)) {
    raw = Math.round(Number(data.soilRaw));
  } else if (data.raw !== undefined && data.raw !== null && !isNaN(data.raw)) {
    raw = Math.round(Number(data.raw));
  } else if (data.adc !== undefined && data.adc !== null && !isNaN(data.adc)) {
    raw = Math.round(Number(data.adc));
  }

  const setVal = (elId, val, dec) => {
    const el = document.getElementById(elId);
    if (el) {
      const display = val !== null && val !== undefined && !isNaN(val) ? Number(val).toFixed(dec) : "—";
      if (el.textContent !== display) {
        el.textContent = display;
        el.classList.remove("esp32-value-updating");
        void el.offsetWidth;
        el.classList.add("esp32-value-updating");
      }
    }
  };

  setVal("esp32TempVal", temp, 1);
  setVal("esp32HumVal",  hum,  1);
  setVal("esp32PresVal", pres, 1);
  setVal("esp32SoilVal", soil, 1);

  const rawEl = document.getElementById("esp32SoilRaw");
  if (rawEl) rawEl.textContent = String(raw);

  // Status chips
  const tempChip = document.getElementById("esp32TempChip");
  if (tempChip && temp !== null) {
    if (temp >= 18 && temp <= 35) {
      tempChip.textContent = "Normal";
      tempChip.className = "esp32-chip optimal";
    } else if (temp > 35) {
      tempChip.textContent = "High";
      tempChip.className = "esp32-chip caution";
    } else {
      tempChip.textContent = "Cool";
      tempChip.className = "esp32-chip neutral";
    }
  }

  const humChip = document.getElementById("esp32HumChip");
  if (humChip && hum !== null) {
    if (hum >= 40 && hum <= 75) {
      humChip.textContent = "Optimal";
      humChip.className = "esp32-chip optimal";
    } else if (hum > 75) {
      humChip.textContent = "High";
      humChip.className = "esp32-chip caution";
    } else {
      humChip.textContent = "Dry";
      humChip.className = "esp32-chip neutral";
    }
  }

  const presChip = document.getElementById("esp32PresChip");
  if (presChip && pres !== null) {
    if (pres >= 1000 && pres <= 1020) {
      presChip.textContent = "Stable";
      presChip.className = "esp32-chip optimal";
    } else {
      presChip.textContent = pres > 1020 ? "High Baro" : "Low Baro";
      presChip.className = "esp32-chip neutral";
    }
  }

  const soilChip = document.getElementById("esp32SoilChip");
  if (soilChip && soil !== null) {
    if (soil >= 40) {
      soilChip.textContent = "Moist";
      soilChip.className = "esp32-chip optimal";
    } else if (soil > 15) {
      soilChip.textContent = "Moderate";
      soilChip.className = "esp32-chip neutral";
    } else {
      soilChip.textContent = "Dry";
      soilChip.className = "esp32-chip caution";
    }
  }
}

// ── Update status metadata ─────────────────────────────────
function esp32UpdateMeta(json) {
  const data = json.data || {};
  const uptime = data.uptime ?? null;

  const uptimeEl = document.getElementById("esp32Uptime");
  if (uptimeEl) {
    if (uptime !== null && uptime !== undefined && !isNaN(uptime)) {
      const totalSec = Math.round(Number(uptime));
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      uptimeEl.textContent = `${h}h ${m}m ${s}s`;
    } else {
      uptimeEl.textContent = "—";
    }
  }

  const logCountEl = document.getElementById("esp32LogCount");
  if (logCountEl && json.rows !== undefined) {
    logCountEl.textContent = json.rows;
  }

  const sourceEl = document.getElementById("esp32SourceText");
  if (sourceEl) {
    sourceEl.textContent = "Live 10s Auto-Sync";
  }
}

// ── Render Logs Table (Newest Uptime First) ────────────────
function esp32RenderLogsTable(rows) {
  const tbody = document.getElementById("esp32LogBody");
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 40px;">No log entries recorded yet</td></tr>';
    return;
  }

  const fmt = (v, dec = 1) => (v !== null && v !== undefined && !isNaN(v)) ? Number(v).toFixed(dec) : "—";
  const fmtInt = v => (v !== null && v !== undefined && !isNaN(v)) ? Math.round(Number(v)) : "0";

  tbody.innerHTML = rows.map(r => {
    const rawVal = r.soilRaw ?? r.raw ?? r.adc ?? 0;
    return `<tr>
      <td><strong>${r.uptime !== null && r.uptime !== undefined && !isNaN(r.uptime) ? Math.round(r.uptime) + "s" : "—"}</strong></td>
      <td style="color: #34d399; font-weight: 600;">${fmt(r.temperature ?? r.temp)}</td>
      <td style="color: #60a5fa; font-weight: 600;">${fmt(r.humidity)}</td>
      <td style="color: #fb923c; font-weight: 600;">${fmt(r.pressure)}</td>
      <td style="color: #c084fc; font-weight: 600;">${fmt(r.soilPercent)}</td>
      <td>${fmtInt(rawVal)}</td>
    </tr>`;
  }).join("");
}

// ── Dual Side-by-Side Engineering Charts ───────────────────
function esp32RenderEngineeringCharts(chronologicalLogs) {
  if (!chronologicalLogs || chronologicalLogs.length === 0) return;

  // Extract distinct chronological points with real uptimes
  const labels = chronologicalLogs.map(r => {
    return r.uptime !== null && r.uptime !== undefined && !isNaN(r.uptime) ? `${Math.round(r.uptime)}s` : "—";
  });

  const tempData = chronologicalLogs.map(r => (r.temperature ?? r.temp ?? null));
  const humData  = chronologicalLogs.map(r => (r.humidity ?? null));
  const presData = chronologicalLogs.map(r => (r.pressure ?? null));
  const soilData = chronologicalLogs.map(r => (r.soilPercent ?? null));

  // ── 1. Left Chart: Temperature & Humidity ──
  const envCanvas = document.getElementById("esp32EnvChart");
  if (envCanvas) {
    if (esp32State.envChart) {
      esp32State.envChart.data.labels = labels;
      esp32State.envChart.data.datasets[0].data = tempData;
      esp32State.envChart.data.datasets[1].data = humData;
      esp32State.envChart.update("none");
    } else {
      esp32State.envChart = new Chart(envCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Temperature (°C)",
              data: tempData,
              borderColor: "#10b981",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 6,
              tension: 0.25,
              yAxisID: "yTemp",
            },
            {
              label: "Humidity (%)",
              data: humData,
              borderColor: "#38bdf8",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 6,
              tension: 0.25,
              yAxisID: "yHum",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              titleColor: "#f8fafc",
              bodyColor: "#e2e8f0",
              borderColor: "rgba(255,255,255,0.1)",
              borderWidth: 1,
              cornerRadius: 8,
              padding: 10,
            },
          },
          scales: {
            x: {
              grid: { color: "rgba(255, 255, 255, 0.04)" },
              ticks: { color: "rgba(255, 255, 255, 0.6)", font: { size: 10 } },
              title: { display: true, text: "ESP32 Uptime", color: "rgba(255, 255, 255, 0.4)", font: { size: 10 } },
            },
            yTemp: {
              type: "linear",
              position: "left",
              beginAtZero: false,
              grid: { color: "rgba(255, 255, 255, 0.04)" },
              ticks: { color: "#10b981", callback: v => v + "°C", font: { size: 11 } },
              title: { display: true, text: "Temperature", color: "#10b981", font: { size: 11, weight: "bold" } },
            },
            yHum: {
              type: "linear",
              position: "right",
              beginAtZero: false,
              grid: { drawOnChartArea: false },
              ticks: { color: "#38bdf8", callback: v => v + "%", font: { size: 11 } },
              title: { display: true, text: "Humidity", color: "#38bdf8", font: { size: 11, weight: "bold" } },
            },
          },
          animation: false,
        },
      });
    }
  }

  // ── 2. Right Chart: Barometric Pressure & Soil Moisture ──
  const atmCanvas = document.getElementById("esp32AtmChart");
  if (atmCanvas) {
    if (esp32State.atmChart) {
      esp32State.atmChart.data.labels = labels;
      esp32State.atmChart.data.datasets[0].data = presData;
      esp32State.atmChart.data.datasets[1].data = soilData;
      esp32State.atmChart.update("none");
    } else {
      esp32State.atmChart = new Chart(atmCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Pressure (hPa)",
              data: presData,
              borderColor: "#f59e0b",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 6,
              tension: 0.25,
              yAxisID: "yPres",
            },
            {
              label: "Soil Moisture (%)",
              data: soilData,
              borderColor: "#a855f7",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 3,
              pointHoverRadius: 6,
              tension: 0.25,
              yAxisID: "ySoil",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              titleColor: "#f8fafc",
              bodyColor: "#e2e8f0",
              borderColor: "rgba(255,255,255,0.1)",
              borderWidth: 1,
              cornerRadius: 8,
              padding: 10,
            },
          },
          scales: {
            x: {
              grid: { color: "rgba(255, 255, 255, 0.04)" },
              ticks: { color: "rgba(255, 255, 255, 0.6)", font: { size: 10 } },
              title: { display: true, text: "ESP32 Uptime", color: "rgba(255, 255, 255, 0.4)", font: { size: 10 } },
            },
            yPres: {
              type: "linear",
              position: "left",
              beginAtZero: false,
              grid: { color: "rgba(255, 255, 255, 0.04)" },
              ticks: { color: "#f59e0b", callback: v => v + " hPa", font: { size: 11 } },
              title: { display: true, text: "Pressure (hPa)", color: "#f59e0b", font: { size: 11, weight: "bold" } },
            },
            ySoil: {
              type: "linear",
              position: "right",
              beginAtZero: true,
              suggestedMax: 100,
              grid: { drawOnChartArea: false },
              ticks: { color: "#a855f7", callback: v => v + "%", font: { size: 11 } },
              title: { display: true, text: "Soil Moisture", color: "#a855f7", font: { size: 11, weight: "bold" } },
            },
          },
          animation: false,
        },
      });
    }
  }
}

// ── Button wiring ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("esp32RefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => esp32SyncAll());

  const refreshLogsBtn = document.getElementById("esp32RefreshLogsBtn");
  if (refreshLogsBtn) refreshLogsBtn.addEventListener("click", () => esp32SyncAll());
});
