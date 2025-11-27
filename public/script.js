// Socket.IO connection
const socket = io();

// API base URL (can be configured)
const API_BASE = '';

// Chart elements
const chartElement = document.getElementById('lineChart').getContext('2d');
const distributionChartElement = document.getElementById('distributionChart').getContext('2d');

// Chart data structures
const chartData = {
  labels: [],
  datasets: [{
    label: 'Multiplier Values',
    data: [],
    borderColor: 'rgba(102, 126, 234, 1)',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderWidth: 2,
    pointRadius: 3,
    pointBackgroundColor: 'rgba(255, 255, 255, 1)',
    pointBorderColor: 'rgba(102, 126, 234, 1)',
    pointBorderWidth: 1,
    tension: 0.4
  }]
};

const distributionData = {
  labels: [],
  datasets: [{
    label: 'Frequency',
    data: [],
    backgroundColor: [
      'rgba(239, 68, 68, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(34, 197, 94, 0.8)',
      'rgba(59, 130, 246, 0.8)',
      'rgba(168, 85, 247, 0.8)'
    ],
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1
  }]
};

// Initialize charts
const lineChart = new Chart(chartElement, {
  type: 'line',
  data: chartData,
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          displayFormats: {
            minute: 'HH:mm',
            hour: 'HH:mm'
          }
        },
        grid: {
          color: 'rgba(102, 126, 234, 0.1)'
        },
        ticks: {
          color: 'rgba(224, 224, 224, 0.8)',
          maxTicksLimit: 10
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(102, 126, 234, 0.1)'
        },
        ticks: {
          color: 'rgba(224, 224, 224, 0.8)',
          callback: function(value) {
            return value.toFixed(2) + 'x';
          }
        }
      }
    },
    plugins: {
      legend: {
        labels: {
          color: 'rgba(224, 224, 224, 0.9)'
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return 'Multiplier: ' + context.parsed.y.toFixed(2) + 'x';
          }
        }
      }
    }
  }
});

const distributionChart = new Chart(distributionChartElement, {
  type: 'bar',
  data: distributionData,
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: 'rgba(224, 224, 224, 0.8)'
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(102, 126, 234, 0.1)'
        },
        ticks: {
          color: 'rgba(224, 224, 224, 0.8)',
          stepSize: 1
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return 'Count: ' + context.parsed.y;
          }
        }
      }
    }
  }
});

// Global state
let currentFilters = {
  startDate: null,
  endDate: null,
  betStatus: 'all',
  limit: 100
};

let allGamesData = [];
let statsData = {};

// Prediction tracking (legacy)
let lastValue = null;
let currentPrediction = null;
let correctPredictions = 0;
let totalPredictions = 0;
const latestPredictions = [];

// Connection status management
function updateConnectionStatus(connected) {
  const statusElement = document.getElementById('connectionStatus');
  if (connected) {
    statusElement.textContent = 'Connected';
    statusElement.className = 'connection-status connected';
  } else {
    statusElement.textContent = 'Disconnected';
    statusElement.className = 'connection-status disconnected';
  }
}

// Socket.IO event handlers
socket.on('connect', () => {
  console.log('Connected to server');
  updateConnectionStatus(true);

  // Request initial data
  socket.emit('requestStats');
  socket.emit('requestHistory', { limit: currentFilters.limit });
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  updateConnectionStatus(false);
});

socket.on('initialData', (data) => {
  console.log('Received initial data:', data);
  if (data.stats) {
    updateStatistics(data.stats);
  }
  if (data.recentGames) {
    updateGameHistory(data.recentGames);
  }
});

socket.on('statsUpdate', (stats) => {
  console.log('Received stats update:', stats);
  updateStatistics(stats);
});

socket.on('gameRound', (gameData) => {
  console.log('Received new game round:', gameData);
  addGameToHistory(gameData);

  // Legacy prediction handling
  handleLegacyPrediction(gameData);
});

socket.on('newGameRound', (gameData) => {
  console.log('Received new game round (broadcast):', gameData);
  addGameToHistory(gameData);

  // Legacy prediction handling
  handleLegacyPrediction(gameData);
});

socket.on('stats', (stats) => {
  console.log('Received stats:', stats);
  updateStatistics(stats);
});

socket.on('history', (history) => {
  console.log('Received history:', history);
  updateGameHistory(history);
});

socket.on('newData', (dataPoint) => {
  // Legacy support for old prediction system
  handleLegacyPrediction(dataPoint);
});

// Fetch data from REST API
async function fetchRecentGames(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.betStatus && filters.betStatus !== 'all') {
      params.append('betPlaced', filters.betStatus === 'with-bet' ? 'true' : 'false');
    }
    if (filters.limit) params.append('limit', filters.limit);

    const response = await fetch(`${API_BASE}/api/data/recent?${params}`);
    if (!response.ok) throw new Error('Failed to fetch games');

    const data = await response.json();
    console.log('Fetched recent games:', data);

    return data.data || [];
  } catch (error) {
    console.error('Error fetching games:', error);
    return [];
  }
}

async function fetchStatistics() {
  try {
    const response = await fetch(`${API_BASE}/api/stats`);
    if (!response.ok) throw new Error('Failed to fetch statistics');

    const data = await response.json();
    console.log('Fetched statistics:', data);

    return data;
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return null;
  }
}

// Update statistics dashboard
function updateStatistics(stats) {
  statsData = stats;

  // Handle both old format (direct stats) and new format (with tradingStats and gameStats)
  const tradingStats = stats.tradingStats || stats;
  const gameStats = stats.gameStats || {};

  // Update stat cards
  document.getElementById('totalGames').textContent = gameStats.totalGames || 0;
  document.getElementById('totalBets').textContent = gameStats.gamesWithBets || tradingStats.totalTrades || 0;

  const wins = tradingStats.wins || 0;
  const totalBets = gameStats.gamesWithBets || tradingStats.totalTrades || 0;
  const winRate = totalBets > 0 ? (wins / totalBets * 100) : 0;
  document.getElementById('winRate').textContent = winRate.toFixed(1) + '%';
  document.getElementById('winRateDetails').textContent =
    `${wins} wins / ${totalBets} bets`;

  const netProfit = tradingStats.netProfit || 0;
  document.getElementById('netProfit').textContent = '$' + netProfit.toFixed(2);
  document.getElementById('netProfit').style.color = netProfit >= 0 ? '#10b981' : '#ef4444';
  document.getElementById('profitDetails').textContent =
    `${tradingStats.totalTrades || 0} trades`;

  const avgMultiplier = gameStats.averageMultiplier || 0;
  document.getElementById('avgMultiplier').textContent = avgMultiplier.toFixed(2) + 'x';
  document.getElementById('multiplierRange').textContent =
    `Min: ${(gameStats.minMultiplier || 0).toFixed(2)}x | Max: ${(gameStats.maxMultiplier || 0).toFixed(2)}x`;

  updateLastUpdateTime();
}

function updateLastUpdateTime() {
  const now = new Date();
  document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
}

// Update game history table and charts
function updateGameHistory(games) {
  allGamesData = games;

  // Update table
  renderGamesTable(games);

  // Update charts
  updateLineChart(games);
  updateDistributionChart(games);

  // Update game count
  document.getElementById('gamesCount').textContent = `(${games.length})`;
}

function addGameToHistory(game) {
  // Add to beginning of array
  allGamesData.unshift(game);

  // Keep only the limit amount
  if (allGamesData.length > currentFilters.limit) {
    allGamesData = allGamesData.slice(0, currentFilters.limit);
  }

  // Update display
  updateGameHistory(allGamesData);

  // Refresh stats
  fetchStatistics().then(stats => {
    if (stats) updateStatistics(stats);
  });
}

function renderGamesTable(games) {
  const tbody = document.getElementById('gamesTableBody');

  if (games.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          <p>No game data available</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = games.map((game, index) => {
    const multiplierClass = game.multiplier >= 3 ? 'high' :
                           game.multiplier >= 1.5 ? 'medium' : 'low';

    const betStatus = game.betPlaced ?
      (game.won ? '<span class="badge win">Won</span>' : '<span class="badge loss">Loss</span>') :
      '<span class="badge no-bet">No Bet</span>';

    const betAmount = game.betPlaced ? `$${(game.betAmount || 0).toFixed(2)}` : '-';
    const targetMultiplier = game.betPlaced ? `${(game.targetMultiplier || 0).toFixed(2)}x` : '-';
    const profit = game.betPlaced ?
      `<span style="color: ${game.profit >= 0 ? '#10b981' : '#ef4444'}">$${(game.profit || 0).toFixed(2)}</span>` :
      '-';

    const timestamp = new Date(game.timestamp).toLocaleString();
    const duration = game.gameDuration ? `${(game.gameDuration / 1000).toFixed(1)}s` : '-';

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${timestamp}</td>
        <td><span class="multiplier ${multiplierClass}">${game.multiplier.toFixed(2)}x</span></td>
        <td>${duration}</td>
        <td>${betStatus}</td>
        <td>${betAmount}</td>
        <td>${targetMultiplier}</td>
        <td>${profit}</td>
      </tr>
    `;
  }).join('');
}

function updateLineChart(games) {
  // Show last 50 games on chart for readability
  const chartGames = games.slice(0, 50).reverse();

  chartData.labels = chartGames.map(g => new Date(g.timestamp));
  chartData.datasets[0].data = chartGames.map(g => g.multiplier);

  lineChart.update();
}

function updateDistributionChart(games) {
  // Create multiplier ranges
  const ranges = [
    { label: '1.0-1.5x', min: 1.0, max: 1.5, count: 0 },
    { label: '1.5-2.0x', min: 1.5, max: 2.0, count: 0 },
    { label: '2.0-3.0x', min: 2.0, max: 3.0, count: 0 },
    { label: '3.0-5.0x', min: 3.0, max: 5.0, count: 0 },
    { label: '5.0x+', min: 5.0, max: Infinity, count: 0 }
  ];

  games.forEach(game => {
    const range = ranges.find(r => game.multiplier >= r.min && game.multiplier < r.max);
    if (range) range.count++;
  });

  distributionData.labels = ranges.map(r => r.label);
  distributionData.datasets[0].data = ranges.map(r => r.count);

  distributionChart.update();
}

// Filter functions
function applyFilters() {
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;
  const betStatus = document.getElementById('filterBetStatus').value;
  const limit = parseInt(document.getElementById('filterLimit').value) || 100;

  currentFilters = {
    startDate: startDate || null,
    endDate: endDate || null,
    betStatus: betStatus,
    limit: limit
  };

  console.log('Applying filters:', currentFilters);
  refreshData();
}

function resetFilters() {
  document.getElementById('filterStartDate').value = '';
  document.getElementById('filterEndDate').value = '';
  document.getElementById('filterBetStatus').value = 'all';
  document.getElementById('filterLimit').value = '100';

  currentFilters = {
    startDate: null,
    endDate: null,
    betStatus: 'all',
    limit: 100
  };

  console.log('Filters reset');
  refreshData();
}

async function refreshData() {
  console.log('Refreshing data with filters:', currentFilters);

  // Fetch fresh data from API
  const games = await fetchRecentGames(currentFilters);
  const stats = await fetchStatistics();

  if (games) {
    updateGameHistory(games);
  }

  if (stats) {
    updateStatistics(stats);
  }
}

// Export functions
async function exportData(format) {
  try {
    console.log(`Exporting data as ${format}`);

    const params = new URLSearchParams();
    if (currentFilters.startDate) params.append('startDate', currentFilters.startDate);
    if (currentFilters.endDate) params.append('endDate', currentFilters.endDate);
    if (currentFilters.betStatus && currentFilters.betStatus !== 'all') {
      params.append('betPlaced', currentFilters.betStatus === 'with-bet' ? 'true' : 'false');
    }

    const url = `${API_BASE}/api/export/${format}?${params}`;

    // Open download in new window
    window.open(url, '_blank');

  } catch (error) {
    console.error(`Error exporting ${format}:`, error);
    alert(`Failed to export ${format.toUpperCase()}: ${error.message}`);
  }
}

// Legacy prediction handling
function handleLegacyPrediction(dataPoint) {
  const value = dataPoint.value || dataPoint.multiplier;
  const predictedValue = dataPoint.predictedValue;

  if (!value) return;

  // Check if the new value is different from the last value
  if (lastValue === null || lastValue !== value) {
    if (currentPrediction !== null && predictedValue) {
      const actualValue = value;
      const isCorrect = currentPrediction <= actualValue;
      correctPredictions += isCorrect ? 1 : 0;
      totalPredictions += 1;

      latestPredictions.push({
        predicted: currentPrediction,
        actual: actualValue,
        correct: isCorrect
      });

      if (latestPredictions.length > 10) {
        latestPredictions.shift();
      }

      updatePredictionTable(latestPredictions);
    }

    currentPrediction = predictedValue;
  }

  lastValue = value;
}

function updatePredictionTable(predictions) {
  const tableBody = document.getElementById('predictionTableBody');

  if (predictions.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          No prediction data available
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = predictions.map((prediction, index) => {
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${prediction.predicted.toFixed(2)}</td>
        <td>${prediction.actual.toFixed(2)}</td>
        <td>${prediction.correct ? 'Yes' : 'No'}</td>
      </tr>
    `;
  }).join('');
}

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard initialized');

  // Fetch initial data via REST API as backup
  refreshData();

  // Set up auto-refresh every 30 seconds
  setInterval(() => {
    if (!socket.connected) {
      console.log('Socket disconnected, fetching via REST API');
      refreshData();
    }
  }, 30000);
});
