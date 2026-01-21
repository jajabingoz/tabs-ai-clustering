# TabsAI - Smart Tab Clustering

An AI-powered Firefox extension that automatically summarizes and intelligently clusters your open tabs using Groq's fast inference API.

## 🚀 Features

- **AI Summarization**: Extract key insights from each tab's content
- **Smart Clustering**: Group related tabs by topic using advanced AI
- **Clean Interface**: Popup and sidebar views for easy management  
- **Export Options**: Save clusters as bookmarks, text, or JSON
- **Privacy First**: All processing uses your own Groq API key
- **Fast Performance**: Powered by Groq's lightning-fast inference

## 📈 Market Opportunity

**Target Users**: Knowledge workers, researchers, developers managing 20+ tabs daily
**Value Proposition**: Transform tab chaos into organized insights in seconds
**Business Model**: Freemium (Free: 50 tabs/month, Pro: $4.99/month unlimited)

## ⚡ Getting Started

### Prerequisites
- Firefox Browser
- Groq API key (free at [groq.com](https://groq.com))

### Installation
1. Clone this repository
2. Run `npm install` 
3. Run `npm run build`
4. Load the extension in Firefox developer mode

### Usage
1. Install the extension
2. Enter your Groq API key in the popup
3. Click "Analyze & Cluster Tabs"
4. View organized clusters in the sidebar

## 🛠 Development

### Commands
- `npm run dev` - Run extension in development mode
- `npm run build` - Build for production
- `npm run lint` - Check code quality
- `npm run package` - Create distribution package

### Architecture
- **Background Script**: Tab data extraction and management
- **AI Service**: Groq API integration for summarization and clustering  
- **Popup Interface**: Quick analysis and status view
- **Sidebar Panel**: Detailed cluster management and export

### Tech Stack
- Vanilla JavaScript (no frameworks for minimal bundle size)
- Groq API for AI inference
- Firefox WebExtensions API
- Local IndexedDB storage

## 📊 Monetization Strategy

### Free Tier
- 50 tab analyses per month
- Basic clustering
- Export to bookmarks

### Pro Tier ($4.99/month)
- Unlimited tab analyses  
- Advanced clustering algorithms
- Export to multiple formats
- Priority support
- Custom clustering rules

## 🔧 Configuration

The extension stores minimal data locally:
- Groq API key (encrypted)
- Tab summaries (temporary)
- User preferences

## 📦 Distribution

Ready for:
- Firefox Add-ons Store
- Direct distribution
- Enterprise deployment

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Run tests and linting
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Groq API Documentation](https://console.groq.com/docs)
- [Firefox Extension Development](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions)
- [Web-ext CLI Tool](https://github.com/mozilla/web-ext)