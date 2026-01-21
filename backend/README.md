# TabsAI Backend

**Current Status**: Not production-ready due to SQLite usage in serverless environment.

## Issues

1. **SQLite incompatible with Vercel** - Serverless functions are read-only and stateless
2. **Missing environment variables** - Requires GROQ_API_KEY, JWT_SECRET, STRIPE_SECRET_KEY

## Solutions

### For Development/Testing
Run locally:
```bash
npm install
npm run dev
```

### For Production
Replace SQLite with a proper database:
- **Recommended**: Vercel Postgres
- **Alternatives**: PlanetScale, MongoDB Atlas, Supabase

## Environment Variables Required
- `GROQ_API_KEY` - Your Groq API key
- `JWT_SECRET` - Secret for JWT token generation
- `STRIPE_SECRET_KEY` - Stripe secret key (optional for testing)
- `DATABASE_URL` - Connection string for database

## Note
The extension works **without the backend** - users can use their own Groq API keys directly. The backend is only needed for:
- Freemium usage limits
- User accounts
- Stripe billing
