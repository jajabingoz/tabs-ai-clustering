# TabsAI Copilot Instructions

## Project Overview
TabsAI is a Firefox browser extension that uses Groq's AI to summarize, prioritize, and cluster open tabs. The extension extracts tab content, analyzes it with AI for learning/utility value, assigns priority scores (1-5), and organizes tabs into logical groups sorted by priority. A separate Node.js backend provides user authentication, rate limiting, and Stripe integration for freemium monetization.

## Architecture
- **Extension**: Firefox WebExtension (manifest v2) with background script, popup, and sidebar
- **Backend**: Express.js API with PostgreSQL (Supabase) database, JWT auth, and Stripe webhooks
- **AI Service**: Direct Groq API calls from extension (client-side) for summarization and priority scoring

## Key Components
- `src/background.js`: TabManager class handles tab extraction, analysis orchestration, and tab organization
- `src/utils/ai-service.js`: GroqAIService class for AI-powered summarization, priority scoring, and clustering
- `src/popup/popup.js`: Main UI for API key setup, analysis triggering, and cluster overview
- `src/sidebar/sidebar.js`: Detailed cluster view with priority indicators and tab management
- `backend/server.js`: REST API with auth and usage tracking endpoints
- `backend/services/groq.js`: Server-side AI processing with usage tracking

## Priority Scoring System
Each tab receives a Priority Score (1-5, where 1 = highest priority) based on:

**Learning Value Factors:**
- Depth of content (comprehensive vs superficial)
- Uniqueness of knowledge (rare insights vs common info)
- Longevity (evergreen vs ephemeral content)
- Technical rigor (well-researched vs casual)

**Utility Value Factors:**
- Practical applicability (can be applied immediately)
- Reusability (code, frameworks, APIs, papers, templates)
- Actionability (clear next steps vs passive reading)
- Educational value (teaches skills vs entertains)

**Sorting Order:** Priority Score ASC → Cluster → Title

## Development Workflow
- `npm run dev`: Launches extension in Firefox dev mode via web-ext
- `npm run build`: Creates production build in `./dist/`
- `npm run lint`: Validates extension code
- Backend: `npm run dev` in `backend/` directory

## Firefox-Specific Patterns
- Use `browser.*` APIs instead of `chrome.*` (WebExtensions standard)
- Manifest v2 with `browser_specific_settings.gecko` for Firefox store
- Content scripts inject via `browser.tabs.executeScript()`
- Storage via `browser.storage.local` with schema: `groqApiKey`, `tabSummaries`, `clusters`, `lastAnalysis`
- Tab organization via `browser.tabs.move()` to group related tabs adjacently

## AI Integration
- Model: `llama-3.1-70b-versatile`
- Summarization: Returns JSON with summary, priorityScore, priorityRationale, and topics
- Clustering: Groups tabs semantically, sorts by average priority within clusters
- Fallback: Domain-based grouping when API unavailable

## Message Types
- `analyze-tabs`: Triggers full analysis with priority scoring
- `get-tabs`: Returns analyzed tab summaries with priorities
- `get-clusters`: Returns sorted clusters
- `get-sorted-results`: Returns flat list sorted by priority
- `organize-tabs`: Moves tabs in browser to group by cluster
- `focus-tab`, `close-tab`: Tab management actions

## Data Flow
1. Background extracts content from all tabs (excluding chrome://, about:, moz-extension://)
2. AI service analyzes each tab individually for summary and priority score
3. Clustering groups tabs by semantic similarity
4. Results sorted: clusters by avg priority, tabs within clusters by individual priority
5. Results stored locally; UI displays with color-coded priority indicators

## Conventions
- Vanilla JavaScript (no frameworks for minimal bundle size)
- Async/await with Promise-based APIs
- Class-based architecture (TabManager, GroqAIService, SidebarManager, PopupManager)
- Environment variables for backend config (POSTGRES_URL, JWT_SECRET, GROQ_API_KEY, STRIPE_SECRET)
- Rate limiting: 10 requests/15min for analysis endpoint

## Deployment
- Extension: Firefox Add-ons store submission
- Backend: Vercel serverless with Supabase PostgreSQL; handles Stripe webhooks for subscriptions