# Deployment Guide

## Quick Fix for Deployment Error

The deployment is failing because the database password is not configured. Here's how to fix it:

### Option 1: Set Database URL (Recommended)

1. Get your Supabase database password from your Supabase project settings
2. Set the `DATABASE_URL` environment variable in your deployment:

```bash
DATABASE_URL=postgresql://postgres.neabxvlkgkuxaavtlumi:[YOUR-ACTUAL-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
```

Replace `[YOUR-ACTUAL-PASSWORD]` with your actual Supabase database password.

### Option 2: Deploy Without Database (Testing Only)

For testing the deployment without database features:

1. The application will start with a warning that database features are disabled
2. All API endpoints requiring database will return errors
3. **This is only for testing the deployment process**

---

## Full Deployment Instructions

### Prerequisites

1. **Supabase Account** - Already configured
2. **Angel One API Credentials** - For live trading
3. **Telegram Bot** (Optional) - For notifications

### Environment Variables Required

Set these in your deployment environment:

#### Required for Database

```bash
DATABASE_URL=postgresql://postgres.neabxvlkgkuxaavtlumi:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
VITE_SUPABASE_URL=https://neabxvlkgkuxaavtlumi.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Required for Trading (AngelOne)

```bash
ANGEL_API_KEY=your_angel_api_key
ANGEL_CLIENT_ID=your_client_id
ANGEL_PASSWORD=your_password
ANGEL_TOTP_SECRET=your_totp_secret
```

#### Optional for Notifications

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

### Deployment Steps

1. **Get Database Password**
   - Go to Supabase Dashboard
   - Navigate to Project Settings → Database
   - Copy the database password
   - Update DATABASE_URL environment variable

2. **Set Environment Variables**
   - In Replit: Go to Secrets (lock icon)
   - Add all required environment variables
   - Click "Save"

3. **Deploy**
   - Click "Deploy" button
   - Application will build and start
   - Check logs for any errors

4. **Verify Deployment**
   - Access your deployed URL
   - Check that UI loads
   - Verify API endpoints respond
   - Check logs for warnings

### Post-Deployment Checklist

- [ ] Database connection successful
- [ ] Frontend loads correctly
- [ ] API endpoints respond
- [ ] AngelOne authentication works
- [ ] Telegram notifications work (if configured)
- [ ] WebSocket connections work
- [ ] Strategies can be started/stopped

### Troubleshooting

#### Database Connection Error

**Error:** `Tenant or user not found`

**Solution:**
- Verify DATABASE_URL has correct password
- Check Supabase project is active
- Ensure IP is not blocked

#### Build Fails

**Error:** TypeScript errors

**Solution:**
```bash
npm run check
npm run build
```

#### Server Won't Start

**Error:** Port already in use

**Solution:**
- Application uses PORT environment variable (default: 5000)
- Change port if needed

### Production Checklist

Before going live with real trading:

- [ ] Test all strategies in paper trading mode
- [ ] Verify risk management settings
- [ ] Set appropriate capital limits
- [ ] Test circuit breaker functionality
- [ ] Monitor for 1 week in production
- [ ] Set up monitoring and alerts

### Security Notes

1. **Never commit API keys** to git
2. **Use environment variables** for all secrets
3. **Rotate credentials** regularly
4. **Monitor API usage** to detect anomalies
5. **Set capital limits** to prevent large losses

### Support

For issues:
1. Check application logs
2. Review STRATEGY_OPTIMIZATION_COMPLETE.md
3. Check BACKTEST_GUIDE.md for testing
4. Review DEVELOPER_GUIDE.md for technical details

---

## Quick Start After Deployment

1. **Login to Application**
   - Access your deployed URL
   - Login with AngelOne credentials

2. **Configure Strategies**
   - Go to Settings
   - Enable desired strategies
   - Set capital allocation

3. **Start Trading**
   - Click "Start Engine"
   - Monitor dashboard for signals
   - Check Telegram for notifications

---

**Remember:** Always test thoroughly before live trading with real money!
