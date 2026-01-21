# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TabsAI is a Firefox browser extension that provides AI-powered tab summarization and intelligent clustering using Groq's inference API. The extension helps users organize their browser tabs by automatically grouping related content.

## Development Commands

- `npm install` - Install dependencies (web-ext CLI tool)
- `npm run dev` - Run extension in development mode with Firefox
- `npm run build` - Build extension for production  
- `npm run lint` - Lint extension code using web-ext
- `npm run package` - Create distributable ZIP file
- `web-ext run --source-dir .` - Alternative development command

## Architecture

### Core Components

1. **Background Script** (`src/background.js`)
   - Manages tab data extraction and storage
   - Handles communication between popup/sidebar and content scripts
   - Implements TabManager class for tab lifecycle management

2. **AI Service** (`src/utils/ai-service.js`)  
   - Groq API integration for summarization and clustering
   - Fallback clustering algorithms when API unavailable
   - Handles API key management and error recovery

3. **Popup Interface** (`src/popup/`)
   - Primary user interface for quick actions
   - API key configuration and status display
   - Trigger analysis and view cluster summaries

4. **Sidebar Panel** (`src/sidebar/`)
   - Detailed cluster management interface
   - Tab actions (focus, close, bookmark)
   - Export functionality (bookmarks, text, JSON)

### Data Flow

1. Background script extracts content from all open tabs
2. AI service sends tab content to Groq API for summarization
3. Clustering algorithm groups tabs by semantic similarity
4. Results stored in browser.storage.local for persistence
5. UI components display clusters and enable management actions

### Storage Schema

- `groqApiKey` - Encrypted user API key
- `tabSummaries` - Array of tab objects with AI-generated summaries
- `clusters` - Array of cluster objects with tab groupings
- `lastAnalyzed` - Timestamp of last analysis

## Firefox Extension Specifics

- Manifest v2 format (Firefox standard)
- Permissions: tabs, storage, activeTab
- Uses browser.* API namespace (Firefox-specific)
- Content Security Policy restricts inline scripts

## AI Integration

- Primary: Groq API with llama-3.1-70b-versatile model
- Fallback: Domain-based clustering when API unavailable
- Summarization prompt optimized for 2-3 sentence summaries
- Clustering prompt returns structured JSON with tab groupings

## Testing

- Manual testing via `npm run dev` 
- Load temporary extension in Firefox developer mode
- Test with various tab combinations and content types
- Verify API key handling and error states

## Common Issues

- API rate limits: Implement request throttling
- Content script injection failures: Handle gracefully with fallbacks
- Cross-origin restrictions: Use background script for API calls
- Tab focus/close race conditions: Add proper error handling