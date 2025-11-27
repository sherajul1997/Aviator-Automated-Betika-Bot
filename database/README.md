# Database Schema Documentation

## Overview

This directory contains the MySQL database schema for the Aviator Bot. The schema is designed to store comprehensive game data, betting history, and session statistics for analysis and reporting.

## Files

- **schema.sql** - Complete database schema with tables, indexes, views, and sample queries
- **database.js** - Database connection and operations module

## Database Tables

### 1. game_rounds
Stores data for every aviator game round, including the crash multiplier and timing information.

**Columns:**
- `id` - Primary key (auto-increment)
- `multiplier` - The crash multiplier where the game ended (DECIMAL 10,2)
- `timestamp` - When the game round occurred (DATETIME)
- `game_duration` - Duration of the game in milliseconds (INT)
- `created_at` - When this record was inserted (TIMESTAMP)

**Indexes:**
- Primary key on `id`
- Index on `timestamp` for date range queries
- Index on `multiplier` for filtering by crash value
- Composite index on `timestamp, multiplier` for combined queries

### 2. bet_history
Stores detailed information about every bet placed by the bot, including outcomes and profitability.

**Columns:**
- `id` - Primary key (auto-increment)
- `game_round_id` - Foreign key to game_rounds (nullable)
- `bet_amount` - Amount wagered (DECIMAL 10,2)
- `target_multiplier` - Target for auto-cashout (DECIMAL 10,2)
- `actual_multiplier` - Actual crash point (DECIMAL 10,2)
- `profit_loss` - Net profit/loss (DECIMAL 10,2, negative for losses)
- `won` - Whether the bet won (BOOLEAN)
- `timestamp` - When the bet was placed (DATETIME)

**Indexes:**
- Primary key on `id`
- Foreign key index on `game_round_id`
- Index on `timestamp` for date range queries
- Index on `won` for win/loss filtering
- Index on `profit_loss` for profitability queries
- Index on `target_multiplier` for strategy analysis
- Composite indexes for common query patterns

### 3. session_stats
Stores aggregated statistics for bot running sessions.

**Columns:**
- `id` - Primary key (auto-increment)
- `session_start` - When the session started (DATETIME)
- `session_end` - When the session ended (DATETIME, NULL if active)
- `total_games` - Total game rounds observed (INT)
- `total_bets` - Total bets placed (INT)
- `net_profit` - Total net profit/loss (DECIMAL 10,2)
- `win_rate` - Percentage of bets won 0-100 (DECIMAL 5,2)
- `created_at` - Record creation timestamp (TIMESTAMP)
- `updated_at` - Record update timestamp (TIMESTAMP)

**Indexes:**
- Primary key on `id`
- Index on `session_start` for chronological queries
- Index on `session_end` for active session filtering

## Database Views

The schema includes several convenient views for common queries:

### v_recent_games_with_bets
Shows recent game rounds with associated bet information (if any).

### v_session_summary
Provides a summary of all sessions including duration and status (ACTIVE/COMPLETED).

### v_daily_performance
Aggregates betting performance by day with win rates and profitability.

## Installation

### Prerequisites
- MySQL 5.7+ or MariaDB 10.2+
- Database credentials configured in `/code/util/config.js`

### Setup Instructions

1. **Create the database and tables:**
   ```bash
   mysql -u root -p < /code/database/schema.sql
   ```

2. **Verify installation:**
   ```bash
   mysql -u root -p aviatorBot -e "SHOW TABLES;"
   ```

   You should see:
   - bet_history
   - game_rounds
   - session_stats

3. **Check views:**
   ```bash
   mysql -u root -p aviatorBot -e "SHOW FULL TABLES WHERE Table_type = 'VIEW';"
   ```

4. **Update database configuration:**
   Edit `/code/util/config.js` and update the DATABASE section:
   ```javascript
   DATABASE: {
       host: 'localhost',
       user: 'root',
       password: 'your_password',
       database: 'aviatorBot'
   }
   ```

## Usage Examples

### Query recent games
```sql
SELECT * FROM game_rounds
ORDER BY timestamp DESC
LIMIT 100;
```

### Get winning bets
```sql
SELECT * FROM bet_history
WHERE won = TRUE
ORDER BY timestamp DESC;
```

### Analyze profitability by target multiplier
```sql
SELECT
    target_multiplier,
    COUNT(*) as total_bets,
    SUM(profit_loss) as total_profit,
    AVG(profit_loss) as avg_profit,
    SUM(CASE WHEN won = TRUE THEN 1 ELSE 0 END) as wins
FROM bet_history
GROUP BY target_multiplier
ORDER BY target_multiplier;
```

### Get games in date range
```sql
SELECT * FROM game_rounds
WHERE timestamp BETWEEN '2024-01-01' AND '2024-01-31'
ORDER BY timestamp;
```

### View active sessions
```sql
SELECT * FROM v_session_summary
WHERE status = 'ACTIVE';
```

### Daily performance report
```sql
SELECT * FROM v_daily_performance
ORDER BY date DESC
LIMIT 30;
```

### Multiplier distribution
```sql
SELECT
    FLOOR(multiplier) as multiplier_range,
    COUNT(*) as frequency,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM game_rounds), 2) as percentage
FROM game_rounds
GROUP BY FLOOR(multiplier)
ORDER BY multiplier_range;
```

## Maintenance

### Backup database
```bash
mysqldump -u root -p aviatorBot > aviatorBot_backup_$(date +%Y%m%d).sql
```

### Restore from backup
```bash
mysql -u root -p aviatorBot < aviatorBot_backup_20240101.sql
```

### Archive old data
```sql
-- Archive games older than 90 days
DELETE FROM game_rounds
WHERE timestamp < DATE_SUB(NOW(), INTERVAL 90 DAY);

-- Archive bet history older than 90 days
DELETE FROM bet_history
WHERE timestamp < DATE_SUB(NOW(), INTERVAL 90 DAY);
```

### Check table sizes
```sql
SELECT
    table_name AS 'Table',
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.TABLES
WHERE table_schema = 'aviatorBot'
ORDER BY (data_length + index_length) DESC;
```

## Performance Considerations

- All timestamp columns are indexed for efficient date range queries
- Composite indexes are created for common query patterns
- Foreign key constraints ensure referential integrity
- InnoDB engine provides ACID compliance and row-level locking
- Views are not materialized - they're computed on query (consider materialized views for large datasets)

## Next Steps

After setting up the database schema:
1. Update `/code/database/database.js` with new methods (Step 3.2)
2. Integrate database operations into game monitoring (Step 3.3)
3. Test database operations with the bot
4. Monitor performance and add additional indexes as needed

## Troubleshooting

### Connection issues
- Verify MySQL service is running: `systemctl status mysql`
- Check credentials in config.js
- Ensure user has proper permissions: `GRANT ALL ON aviatorBot.* TO 'root'@'localhost';`

### Schema errors
- Drop and recreate database if needed: `DROP DATABASE IF EXISTS aviatorBot;`
- Check MySQL version compatibility
- Review error logs: `/var/log/mysql/error.log`

### Performance issues
- Run `EXPLAIN` on slow queries to analyze execution plan
- Consider adding more specific indexes based on query patterns
- Archive old data regularly to keep table sizes manageable
