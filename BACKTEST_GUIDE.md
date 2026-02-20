# Backtest Mode Guide

## Overview

The trading application now supports two modes:
- **Live Mode**: Real-time trading with live market data
- **Backtest Mode**: Historical strategy testing over a date range

## Using Backtest Mode

### From the Dashboard

1. **Select Mode**
   - Toggle between "Live" and "Backtest" buttons in the control panel
   - Live mode is selected by default

2. **Configure Backtest Parameters**
   - When Backtest mode is selected, two date inputs appear:
     - **Start Date**: Beginning of the backtest period
     - **End Date**: End of the backtest period

3. **Select Instruments**
   - Choose which instruments to backtest (NIFTY, BANKNIFTY, etc.)
   - Multiple instruments can be selected

4. **Set Capital**
   - Define the capital to use for position sizing
   - Uses the same capital selector as live mode

5. **Start Backtest**
   - Click "Proceed" to start the backtest
   - The system will:
     - Validate date range
     - Load historical data
     - Run strategies on historical data
     - Generate signals and track P&L
     - Create performance report

## Backtest Features

### Current Implementation

✅ **Mode Toggle UI** - Switch between Live and Backtest modes
✅ **Date Range Selection** - Pick custom start and end dates
✅ **Backend Validation** - Ensures valid date ranges
✅ **Backtest Engine Structure** - Framework for running backtests
✅ **Logging** - Comprehensive logging of backtest activities

### Backtest Metrics

The backtest engine calculates:
- Total number of trades
- Winning vs losing trades
- Win rate percentage
- Total P&L
- Average win and average loss
- Profit factor (gross profit / gross loss)
- Max drawdown (TODO)
- Sharpe ratio (TODO)

### Planned Enhancements

🔲 **Historical Data Loading**
   - Integration with data providers (AngelOne, Alpha Vantage, etc.)
   - Local CSV file support
   - Data caching for faster reruns

🔲 **Market Replay**
   - Day-by-day data replay
   - Realistic order execution simulation
   - Slippage and commission modeling

🔲 **Strategy Optimization**
   - Parameter grid search
   - Walk-forward analysis
   - Out-of-sample validation

🔲 **Performance Visualization**
   - Equity curve charts
   - Drawdown charts
   - Monthly/yearly returns heatmap
   - Strategy comparison

🔲 **Risk Analytics**
   - Value at Risk (VaR)
   - Conditional VaR
   - Maximum Adverse Excursion (MAE)
   - Maximum Favorable Excursion (MFE)

## API Endpoints

### Start Engine with Backtest

```bash
POST /api/engine/start
Content-Type: application/json

{
  "instruments": ["NIFTY", "BANKNIFTY"],
  "capital": 100000,
  "mode": "backtest",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

**Response:**
```json
{
  "message": "Engine started in backtest (2024-01-01 to 2024-12-31) mode for NIFTY, BANKNIFTY",
  "status": {
    "running": true,
    "instruments": ["NIFTY", "BANKNIFTY"],
    "mode": "backtest",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }
}
```

## Implementation Details

### File Structure

```
server/
├── backtest-engine.ts      # Backtest engine implementation
├── strategies.ts           # Main engine with mode support
└── routes.ts               # API endpoints with validation

client/src/pages/
└── dashboard.tsx          # UI with mode toggle and date inputs
```

### Backtest Flow

1. **User Selection**
   - User selects Backtest mode and date range
   - Frontend validates inputs before submission

2. **Backend Validation**
   - Validates date format (YYYY-MM-DD)
   - Ensures end date is after start date
   - Checks for required parameters

3. **Backtest Execution**
   - Creates BacktestEngine instance
   - Loads historical data
   - Replays market data
   - Generates signals
   - Tracks performance

4. **Results**
   - Calculates metrics
   - Stores results in logs
   - Returns summary to user

### Database Integration

Backtest results are stored in the `logs` table with:
- Source: "backtest"
- Message: Summary of results
- Data: JSON-encoded detailed metrics

Backtest signals can be stored in the `signals` table with a flag to differentiate from live signals.

## Best Practices

### Date Range Selection

- **Short Range (1-7 days)**: Quick validation of strategy logic
- **Medium Range (1-3 months)**: Strategy parameter tuning
- **Long Range (6-12+ months)**: Comprehensive performance evaluation

### Data Quality

- Ensure historical data quality before backtesting
- Account for corporate actions (splits, dividends)
- Include realistic transaction costs

### Overfitting Prevention

- Use walk-forward analysis
- Validate on out-of-sample data
- Avoid excessive parameter optimization

## Troubleshooting

### Issue: "Backtest mode requires startDate and endDate"
**Solution**: Ensure both dates are selected before starting

### Issue: "Start date must be before end date"
**Solution**: Check that the start date is earlier than the end date

### Issue: "Invalid date format"
**Solution**: Use YYYY-MM-DD format (e.g., 2024-01-15)

## Future Enhancements

1. **Historical Data API Integration**
   - Connect to AngelOne historical data API
   - Support for multiple data providers
   - Data quality checks and cleanup

2. **Advanced Analytics**
   - Monte Carlo simulation
   - Strategy stress testing
   - Correlation analysis

3. **Report Generation**
   - PDF reports with charts
   - Email delivery of results
   - Comparison with benchmarks

4. **Multi-Strategy Comparison**
   - Run multiple strategies side-by-side
   - Compare performance metrics
   - Portfolio allocation optimization

## Technical Notes

### Performance Considerations

- Large date ranges may take time to process
- Consider implementing progress indicators
- Cache historical data for repeated backtests

### Memory Management

- Process data in chunks for large datasets
- Clean up resources after backtest completion
- Limit concurrent backtest runs

### Accuracy

- Current implementation is a framework
- Full implementation requires:
  - Accurate historical data
  - Realistic order execution model
  - Proper slippage and commission calculation

---

**Status**: Framework implemented, ready for historical data integration
**Last Updated**: February 20, 2026
