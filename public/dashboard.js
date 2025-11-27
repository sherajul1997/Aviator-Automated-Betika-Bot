/**
 * Aviator Analytics Dashboard JavaScript
 * Fetches analytics data from API endpoints and renders comprehensive charts
 */

// API Configuration
const API_BASE = '';

// Chart instances
let distributionChart = null;
let timelineChart = null;
let performanceChart = null;
let winRateChart = null;
let volatilityChart = null;

// Current filters
let currentFilters = {
    fromDate: null,
    toDate: null,
    source: 'memory',
    interval: 'day'
};

// Analytics data cache
let analyticsData = {
    distribution: null,
    trends: null,
    performance: null
};

/**
 * Initialize the dashboard
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Analytics Dashboard initialized');

    // Set default date range (last 7 days)
    setDefaultDateRange();

    // Initialize empty charts
    initializeCharts();

    // Load analytics data
    loadAllAnalytics();
});

/**
 * Set default date range to last 7 days
 */
function setDefaultDateRange() {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);

    document.getElementById('toDate').valueAsDate = today;
    document.getElementById('fromDate').valueAsDate = sevenDaysAgo;

    currentFilters.fromDate = sevenDaysAgo.toISOString().split('T')[0];
    currentFilters.toDate = today.toISOString().split('T')[0];
}

/**
 * Reset all filters to defaults
 */
function resetFilters() {
    setDefaultDateRange();
    document.getElementById('dataSource').value = 'memory';
    document.getElementById('intervalSelect').value = 'day';

    currentFilters = {
        fromDate: document.getElementById('fromDate').value,
        toDate: document.getElementById('toDate').value,
        source: 'memory',
        interval: 'day'
    };

    loadAllAnalytics();
}

/**
 * Show loading indicator
 */
function showLoading(show = true) {
    const indicator = document.getElementById('loadingIndicator');
    if (show) {
        indicator.classList.add('active');
    } else {
        indicator.classList.remove('active');
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.classList.add('active');

    setTimeout(() => {
        errorElement.classList.remove('active');
    }, 5000);
}

/**
 * Update current filters from form inputs
 */
function updateFiltersFromForm() {
    currentFilters = {
        fromDate: document.getElementById('fromDate').value || null,
        toDate: document.getElementById('toDate').value || null,
        source: document.getElementById('dataSource').value || 'memory',
        interval: document.getElementById('intervalSelect').value || 'day'
    };
}

/**
 * Load all analytics data
 */
async function loadAllAnalytics() {
    updateFiltersFromForm();
    showLoading(true);

    try {
        // Load all analytics in parallel
        const [distribution, trends, performance] = await Promise.all([
            fetchDistributionData(),
            fetchTrendsData(),
            fetchPerformanceData()
        ]);

        // Store in cache
        analyticsData.distribution = distribution;
        analyticsData.trends = trends;
        analyticsData.performance = performance;

        // Update all visualizations
        updateStatsSummary();
        updateDistributionChart();
        updateTimelineChart();
        updatePerformanceChart();
        updateWinRateChart();
        updateVolatilityChart();

        console.log('All analytics loaded successfully');
    } catch (error) {
        console.error('Error loading analytics:', error);
        showError('Failed to load analytics data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Fetch distribution data from API
 */
async function fetchDistributionData() {
    const params = new URLSearchParams();
    if (currentFilters.fromDate) params.append('fromDate', currentFilters.fromDate);
    if (currentFilters.toDate) params.append('toDate', currentFilters.toDate);
    params.append('source', currentFilters.source);

    const response = await fetch(`${API_BASE}/api/analytics/distribution?${params}`);
    if (!response.ok) throw new Error('Failed to fetch distribution data');

    const data = await response.json();
    console.log('Distribution data:', data);
    return data;
}

/**
 * Fetch trends data from API
 */
async function fetchTrendsData() {
    const params = new URLSearchParams();
    if (currentFilters.fromDate) params.append('fromDate', currentFilters.fromDate);
    if (currentFilters.toDate) params.append('toDate', currentFilters.toDate);
    params.append('source', currentFilters.source);
    params.append('interval', currentFilters.interval);
    params.append('limit', '50');

    const response = await fetch(`${API_BASE}/api/analytics/trends?${params}`);
    if (!response.ok) throw new Error('Failed to fetch trends data');

    const data = await response.json();
    console.log('Trends data:', data);
    return data;
}

/**
 * Fetch performance data from API
 */
async function fetchPerformanceData() {
    const params = new URLSearchParams();
    if (currentFilters.fromDate) params.append('fromDate', currentFilters.fromDate);
    if (currentFilters.toDate) params.append('toDate', currentFilters.toDate);
    params.append('source', currentFilters.source);
    params.append('includeVolatility', 'true');
    params.append('includePatterns', 'true');

    const response = await fetch(`${API_BASE}/api/analytics/performance?${params}`);
    if (!response.ok) throw new Error('Failed to fetch performance data');

    const data = await response.json();
    console.log('Performance data:', data);
    return data;
}

/**
 * Update statistics summary cards
 */
function updateStatsSummary() {
    const dist = analyticsData.distribution;
    const perf = analyticsData.performance;

    if (dist && dist.distribution) {
        document.getElementById('totalGamesAnalyzed').textContent =
            dist.dataCount.toLocaleString();
        document.getElementById('avgMultiplierStat').textContent =
            dist.distribution.overall.mean.toFixed(2) + 'x';
    }

    if (perf && perf.report) {
        const report = perf.report;

        // Win Rate
        if (report.winRateByMultiplier && report.winRateByMultiplier.overall) {
            const winRate = report.winRateByMultiplier.overall.winRate;
            document.getElementById('winRateStat').textContent = winRate.toFixed(1) + '%';
        }

        // ROI
        if (report.roi && report.roi.overall) {
            const roi = report.roi.overall.roi;
            document.getElementById('roiStat').textContent = roi.toFixed(1) + '%';

            // Color code based on ROI
            const roiElement = document.getElementById('roiStat');
            if (roi > 0) {
                roiElement.style.color = '#10b981';
            } else if (roi < 0) {
                roiElement.style.color = '#ef4444';
            } else {
                roiElement.style.color = '#f59e0b';
            }
        }
    }
}

/**
 * Initialize all chart instances with empty data
 */
function initializeCharts() {
    // Distribution Chart
    const distCtx = document.getElementById('distributionChart').getContext('2d');
    distributionChart = new Chart(distCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Frequency',
                data: [],
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2
            }]
        },
        options: getBarChartOptions('Multiplier Range', 'Count')
    });

    // Timeline Chart
    const timelineCtx = document.getElementById('timelineChart').getContext('2d');
    timelineChart = new Chart(timelineCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Average Multiplier',
                data: [],
                borderColor: 'rgba(59, 130, 246, 1)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: getLineChartOptions('Time', 'Multiplier')
    });

    // Performance Chart (Multi-axis)
    const perfCtx = document.getElementById('performanceChart').getContext('2d');
    performanceChart = new Chart(perfCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Average Multiplier',
                    data: [],
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Cumulative Profit',
                    data: [],
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: getMultiAxisChartOptions()
    });

    // Win Rate Chart
    const winRateCtx = document.getElementById('winRateChart').getContext('2d');
    winRateChart = new Chart(winRateCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Win Rate (%)',
                data: [],
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 2
            }]
        },
        options: getBarChartOptions('Target Multiplier', 'Win Rate (%)')
    });

    // Volatility Chart
    const volatilityCtx = document.getElementById('volatilityChart').getContext('2d');
    volatilityChart = new Chart(volatilityCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Volatility',
                data: [],
                borderColor: 'rgba(245, 158, 11, 1)',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: getLineChartOptions('Period', 'Volatility')
    });
}

/**
 * Update distribution chart with data
 */
function updateDistributionChart() {
    const data = analyticsData.distribution;
    if (!data || !data.distribution || !data.distribution.ranges) {
        console.warn('No distribution data available');
        return;
    }

    const ranges = data.distribution.ranges;

    distributionChart.data.labels = ranges.map(r => r.range);
    distributionChart.data.datasets[0].data = ranges.map(r => r.count);

    // Color code bars based on multiplier range
    distributionChart.data.datasets[0].backgroundColor = ranges.map(r => {
        const avgMultiplier = (r.min + r.max) / 2;
        if (avgMultiplier < 1.5) return 'rgba(239, 68, 68, 0.8)';
        if (avgMultiplier < 2.5) return 'rgba(245, 158, 11, 0.8)';
        if (avgMultiplier < 4.0) return 'rgba(59, 130, 246, 0.8)';
        return 'rgba(16, 185, 129, 0.8)';
    });

    distributionChart.update();

    document.getElementById('distributionInfo').textContent =
        `${data.dataCount} games`;
}

/**
 * Update timeline chart with trends data
 */
function updateTimelineChart() {
    const data = analyticsData.trends;
    if (!data || !data.analysis || !data.analysis.periods) {
        console.warn('No trends data available');
        return;
    }

    const periods = data.analysis.periods;

    timelineChart.data.labels = periods.map(p => new Date(p.period));
    timelineChart.data.datasets[0].data = periods.map(p => p.avgMultiplier);

    // Update to use time scale
    timelineChart.options.scales.x.type = 'time';
    timelineChart.options.scales.x.time = {
        unit: currentFilters.interval === 'hour' ? 'hour' :
              currentFilters.interval === 'day' ? 'day' :
              currentFilters.interval === 'week' ? 'week' : 'month',
        displayFormats: {
            hour: 'MMM d HH:mm',
            day: 'MMM d',
            week: 'MMM d',
            month: 'MMM yyyy'
        }
    };

    timelineChart.update();

    document.getElementById('timelineInfo').textContent =
        `${periods.length} ${currentFilters.interval}s`;
}

/**
 * Update performance chart with betting data over time
 */
function updatePerformanceChart() {
    const trendsData = analyticsData.trends;
    const perfData = analyticsData.performance;

    if (!trendsData || !trendsData.analysis || !trendsData.analysis.periods) {
        console.warn('No trends data for performance chart');
        return;
    }

    const periods = trendsData.analysis.periods;

    // Calculate cumulative profit if bet data is available
    let cumulativeProfit = 0;
    const profitData = periods.map(p => {
        // This is a simplified calculation - in reality you'd get this from bet history
        cumulativeProfit += (p.avgMultiplier - 2.0) * 10; // Simplified profit simulation
        return cumulativeProfit;
    });

    performanceChart.data.labels = periods.map(p => new Date(p.period));
    performanceChart.data.datasets[0].data = periods.map(p => p.avgMultiplier);
    performanceChart.data.datasets[1].data = profitData;

    // Update to use time scale
    performanceChart.options.scales.x.type = 'time';
    performanceChart.options.scales.x.time = {
        unit: currentFilters.interval === 'hour' ? 'hour' :
              currentFilters.interval === 'day' ? 'day' :
              currentFilters.interval === 'week' ? 'week' : 'month'
    };

    performanceChart.update();

    let betCount = 0;
    if (perfData && perfData.report && perfData.report.dataCount) {
        betCount = perfData.report.dataCount.bets || 0;
    }

    document.getElementById('performanceInfo').textContent =
        `${betCount} bets placed`;
}

/**
 * Update win rate chart
 */
function updateWinRateChart() {
    const data = analyticsData.performance;
    if (!data || !data.report || !data.report.winRateByMultiplier) {
        console.warn('No win rate data available');
        return;
    }

    const segments = data.report.winRateByMultiplier.segments;
    if (!segments || segments.length === 0) {
        console.warn('No win rate segments available');
        return;
    }

    winRateChart.data.labels = segments.map(s => s.multiplierRange);
    winRateChart.data.datasets[0].data = segments.map(s => s.winRate);

    // Color code based on win rate
    winRateChart.data.datasets[0].backgroundColor = segments.map(s => {
        if (s.winRate >= 60) return 'rgba(16, 185, 129, 0.8)';
        if (s.winRate >= 40) return 'rgba(245, 158, 11, 0.8)';
        return 'rgba(239, 68, 68, 0.8)';
    });

    winRateChart.update();

    document.getElementById('winRateInfo').textContent =
        `${segments.length} multiplier ranges`;
}

/**
 * Update volatility chart
 */
function updateVolatilityChart() {
    const data = analyticsData.performance;
    if (!data || !data.report || !data.report.volatility) {
        console.warn('No volatility data available');
        return;
    }

    const volatility = data.report.volatility;

    // If rolling window volatility is available, show it over time
    if (volatility.rollingVolatility && volatility.rollingVolatility.length > 0) {
        const rolling = volatility.rollingVolatility;

        volatilityChart.data.labels = rolling.map((_, i) => `Period ${i + 1}`);
        volatilityChart.data.datasets[0].data = rolling.map(r => r.volatility);
        volatilityChart.update();

        document.getElementById('volatilityInfo').textContent =
            `${rolling.length} periods`;
    } else {
        // Show overall volatility metrics as single bar
        volatilityChart.data.labels = ['Coefficient of Variation', 'Std Dev'];
        volatilityChart.data.datasets[0].data = [
            volatility.overall.coefficientOfVariation || 0,
            volatility.overall.standardDeviation || 0
        ];
        volatilityChart.update();

        document.getElementById('volatilityInfo').textContent =
            'Overall metrics';
    }
}

/**
 * Export current chart data as JSON
 */
function exportChartData() {
    const exportData = {
        filters: currentFilters,
        timestamp: new Date().toISOString(),
        analytics: analyticsData
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aviator_analytics_${Date.now()}.json`;
    link.click();

    URL.revokeObjectURL(url);
    console.log('Analytics data exported');
}

/**
 * Get standard bar chart options
 */
function getBarChartOptions(xLabel, yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                grid: {
                    display: false,
                    color: 'rgba(255, 255, 255, 0.05)'
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11 }
                },
                title: {
                    display: true,
                    text: xLabel,
                    color: '#cbd5e1',
                    font: { size: 12, weight: 'bold' }
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(102, 126, 234, 0.1)'
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11 }
                },
                title: {
                    display: true,
                    text: yLabel,
                    color: '#cbd5e1',
                    font: { size: 12, weight: 'bold' }
                }
            }
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#f1f5f9',
                bodyColor: '#e2e8f0',
                borderColor: '#667eea',
                borderWidth: 1,
                padding: 12,
                displayColors: false
            }
        }
    };
}

/**
 * Get standard line chart options
 */
function getLineChartOptions(xLabel, yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                grid: {
                    color: 'rgba(102, 126, 234, 0.1)'
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11 }
                },
                title: {
                    display: true,
                    text: xLabel,
                    color: '#cbd5e1',
                    font: { size: 12, weight: 'bold' }
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(102, 126, 234, 0.1)'
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11 }
                },
                title: {
                    display: true,
                    text: yLabel,
                    color: '#cbd5e1',
                    font: { size: 12, weight: 'bold' }
                }
            }
        },
        plugins: {
            legend: {
                display: true,
                labels: {
                    color: '#e2e8f0',
                    font: { size: 12 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#f1f5f9',
                bodyColor: '#e2e8f0',
                borderColor: '#667eea',
                borderWidth: 1,
                padding: 12
            }
        }
    };
}

/**
 * Get multi-axis chart options for performance chart
 */
function getMultiAxisChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(102, 126, 234, 0.1)'
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11 }
                },
                title: {
                    display: true,
                    text: 'Time',
                    color: '#cbd5e1',
                    font: { size: 12, weight: 'bold' }
                }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                beginAtZero: true,
                grid: {
                    color: 'rgba(102, 126, 234, 0.1)'
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11 }
                },
                title: {
                    display: true,
                    text: 'Multiplier',
                    color: '#cbd5e1',
                    font: { size: 12, weight: 'bold' }
                }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                grid: {
                    drawOnChartArea: false
                },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11 }
                },
                title: {
                    display: true,
                    text: 'Cumulative Profit ($)',
                    color: '#cbd5e1',
                    font: { size: 12, weight: 'bold' }
                }
            }
        },
        plugins: {
            legend: {
                display: true,
                labels: {
                    color: '#e2e8f0',
                    font: { size: 12 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#f1f5f9',
                bodyColor: '#e2e8f0',
                borderColor: '#667eea',
                borderWidth: 1,
                padding: 12
            }
        }
    };
}
