-- Aviator Bot Database Schema
-- This schema stores comprehensive game data for the Aviator bot including:
-- - Game rounds (all multiplier values from every game)
-- - Betting history (details of all bets placed)
-- - Session statistics (aggregated performance metrics per session)

-- Database creation
CREATE DATABASE IF NOT EXISTS aviatorBot;
USE aviatorBot;

-- ============================================================================
-- Table: game_rounds
-- Stores data for every aviator game round including crash multiplier and timing
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_rounds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    multiplier DECIMAL(10, 2) NOT NULL COMMENT 'The crash multiplier where the game ended',
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the game round occurred',
    game_duration INT UNSIGNED NULL COMMENT 'Duration of the game in milliseconds',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When this record was inserted',

    INDEX idx_timestamp (timestamp),
    INDEX idx_multiplier (multiplier),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Stores all aviator game rounds with crash multipliers';

-- ============================================================================
-- Table: bet_history
-- Stores detailed information about every bet placed by the bot
-- ============================================================================
CREATE TABLE IF NOT EXISTS bet_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    game_round_id BIGINT UNSIGNED NULL COMMENT 'Foreign key to game_rounds table (nullable if game data not recorded)',
    bet_amount DECIMAL(10, 2) NOT NULL COMMENT 'Amount wagered on this bet',
    target_multiplier DECIMAL(10, 2) NOT NULL COMMENT 'The multiplier target for auto-cashout',
    actual_multiplier DECIMAL(10, 2) NOT NULL COMMENT 'The actual multiplier achieved (crash point)',
    profit_loss DECIMAL(10, 2) NOT NULL COMMENT 'Net profit or loss from this bet (negative for losses)',
    won BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether the bet was won (true) or lost (false)',
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the bet was placed',

    INDEX idx_game_round_id (game_round_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_won (won),
    INDEX idx_profit_loss (profit_loss),
    INDEX idx_target_multiplier (target_multiplier),

    FOREIGN KEY (game_round_id) REFERENCES game_rounds(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Stores complete betting history with outcomes and profitability';

-- ============================================================================
-- Table: session_stats
-- Stores aggregated statistics for bot running sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_stats (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_start DATETIME NOT NULL COMMENT 'When the bot session started',
    session_end DATETIME NULL COMMENT 'When the bot session ended (NULL if still running)',
    total_games INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Total number of game rounds observed',
    total_bets INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Total number of bets placed',
    net_profit DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT 'Total net profit/loss for the session',
    win_rate DECIMAL(5, 2) NULL COMMENT 'Percentage of bets won (0-100)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When this record was created',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When this record was last updated',

    INDEX idx_session_start (session_start),
    INDEX idx_session_end (session_end),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Stores aggregated session statistics for performance tracking';

-- ============================================================================
-- Additional Indexes for Complex Queries
-- ============================================================================

-- Composite index for date range queries on game rounds
CREATE INDEX idx_timestamp_multiplier ON game_rounds(timestamp, multiplier);

-- Composite index for bet analysis by time and outcome
CREATE INDEX idx_timestamp_won ON bet_history(timestamp, won);

-- Composite index for profitability analysis over time
CREATE INDEX idx_timestamp_profit ON bet_history(timestamp, profit_loss);

-- ============================================================================
-- Views for Common Queries (Optional but useful)
-- ============================================================================

-- View: Recent game rounds with bet information
CREATE OR REPLACE VIEW v_recent_games_with_bets AS
SELECT
    gr.id AS game_id,
    gr.multiplier AS crash_multiplier,
    gr.timestamp AS game_time,
    gr.game_duration,
    bh.id AS bet_id,
    bh.bet_amount,
    bh.target_multiplier,
    bh.won,
    bh.profit_loss
FROM game_rounds gr
LEFT JOIN bet_history bh ON gr.id = bh.game_round_id
ORDER BY gr.timestamp DESC;

-- View: Session summary statistics
CREATE OR REPLACE VIEW v_session_summary AS
SELECT
    id,
    session_start,
    session_end,
    total_games,
    total_bets,
    net_profit,
    win_rate,
    TIMESTAMPDIFF(MINUTE, session_start, COALESCE(session_end, NOW())) AS duration_minutes,
    CASE
        WHEN session_end IS NULL THEN 'ACTIVE'
        ELSE 'COMPLETED'
    END AS status
FROM session_stats
ORDER BY session_start DESC;

-- View: Daily performance summary
CREATE OR REPLACE VIEW v_daily_performance AS
SELECT
    DATE(timestamp) AS date,
    COUNT(*) AS total_bets,
    SUM(CASE WHEN won = TRUE THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN won = FALSE THEN 1 ELSE 0 END) AS losses,
    ROUND(AVG(CASE WHEN won = TRUE THEN 1 ELSE 0 END) * 100, 2) AS win_rate_pct,
    SUM(profit_loss) AS daily_profit,
    AVG(bet_amount) AS avg_bet_amount,
    MIN(bet_amount) AS min_bet_amount,
    MAX(bet_amount) AS max_bet_amount
FROM bet_history
GROUP BY DATE(timestamp)
ORDER BY date DESC;

-- ============================================================================
-- Sample Queries (Documentation)
-- ============================================================================

-- Get last 100 game rounds:
-- SELECT * FROM game_rounds ORDER BY timestamp DESC LIMIT 100;

-- Get all winning bets:
-- SELECT * FROM bet_history WHERE won = TRUE ORDER BY timestamp DESC;

-- Get profitability by target multiplier:
-- SELECT target_multiplier, COUNT(*) as bets, SUM(profit_loss) as total_profit, AVG(profit_loss) as avg_profit
-- FROM bet_history GROUP BY target_multiplier ORDER BY target_multiplier;

-- Get games in a specific date range:
-- SELECT * FROM game_rounds
-- WHERE timestamp BETWEEN '2024-01-01' AND '2024-01-31'
-- ORDER BY timestamp;

-- Get session performance:
-- SELECT * FROM v_session_summary;

-- Get multiplier distribution:
-- SELECT
--   FLOOR(multiplier) as multiplier_range,
--   COUNT(*) as frequency
-- FROM game_rounds
-- GROUP BY FLOOR(multiplier)
-- ORDER BY multiplier_range;
