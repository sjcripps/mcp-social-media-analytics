# Social Media Analytics MCP Server

[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/runtime-Bun-black)](https://bun.sh)

AI-powered social media analytics tools via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Give your AI assistant the ability to analyze profiles, score engagement, detect trends, and research hashtags across major platforms — all in real time.

## Tools

| Tool | Description |
|------|-------------|
| `analyze_profile` | Profile & brand analysis — posting patterns, content themes, audience indicators, growth recommendations |
| `score_engagement` | Engagement scoring — engagement rate estimates, content effectiveness, posting time analysis, benchmarks |
| `detect_trends` | Trend detection — viral content patterns, emerging topics, sentiment shifts, opportunity alerts |
| `research_hashtags` | Hashtag research — popularity estimates, related hashtags, niche classification, recommended sets |

## Quick Start (Hosted)

**No installation required.** Use the hosted version:

1. Get a free API key at [social.ezbizservices.com/signup](https://social.ezbizservices.com/signup)
2. Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "social-media-analytics": {
      "url": "https://social.ezbizservices.com/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

3. Ask your AI assistant to analyze any social media presence!

### Example Prompts

- "Analyze the social media presence of @hubspot on LinkedIn"
- "Score the engagement for Nike on Instagram"
- "What's trending in AI marketing this week?"
- "Research the best hashtags for real estate content on Instagram"

## Self-Hosting

```bash
git clone https://github.com/ezbiz-services/mcp-social-media.git
cd mcp-social-media
bun install

cp .env.example .env
# Edit .env with your OpenAI API key and admin secret

bun run server.ts
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for AI-powered analysis |
| `ADMIN_SECRET` | Yes | Secret for admin API endpoints |
| `MCP_PORT` | No | Server port (default: 4202) |

## Pricing

| Tier | Price | Requests/Month |
|------|-------|----------------|
| **Free** | $0 | 10 |
| Starter | $19/mo | 200 |
| Pro | $49/mo | 1,000 |
| Business | $99/mo | 5,000 |

Start free at [social.ezbizservices.com](https://social.ezbizservices.com)

## Architecture

- **Runtime:** [Bun](https://bun.sh)
- **Protocol:** [MCP SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (Streamable HTTP transport)
- **AI:** OpenAI GPT-4o for analysis
- **Scraping:** Cheerio for web data extraction
- **Auth:** API key-based with tiered rate limiting

## Links

- **Homepage:** [social.ezbizservices.com](https://social.ezbizservices.com)
- **API Docs:** [social.ezbizservices.com/docs](https://social.ezbizservices.com/docs)
- **Sign Up:** [social.ezbizservices.com/signup](https://social.ezbizservices.com/signup)
- **Server Card:** [social.ezbizservices.com/.well-known/mcp/server-card.json](https://social.ezbizservices.com/.well-known/mcp/server-card.json)

## License

MIT — see [LICENSE](LICENSE)
