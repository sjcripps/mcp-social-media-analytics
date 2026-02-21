import { searchWeb, fetchPage } from "../lib/scraper";
import { analyze } from "../lib/openai";
import { log } from "../lib/logger";

export interface DetectTrendsInput {
  niche: string;
  timeframe?: string;
}

export async function detectTrends(
  input: DetectTrendsInput
): Promise<string> {
  const { niche, timeframe } = input;
  const tf = timeframe || "this_week";
  await log("info", "Starting trend detection", { niche, timeframe: tf });

  const timeframeLabel =
    tf === "today" ? "today" : tf === "this_month" ? "this month" : "this week";

  // Step 1: Search for trending content in the niche
  const queries = [
    `${niche} trending ${timeframeLabel} 2026`,
    `${niche} viral social media ${timeframeLabel}`,
    `${niche} latest news trends`,
    `${niche} trending topics discussion`,
    `${niche} what's new popular ${timeframeLabel}`,
  ];

  const allResults: { title: string; url: string; snippet: string }[] = [];
  for (const q of queries) {
    const results = await searchWeb(q, 8);
    allResults.push(...results);
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // Step 2: Fetch key trend pages for deeper analysis
  const trendPages = await Promise.all(
    unique.slice(0, 6).map(async (r) => {
      const page = await fetchPage(r.url).catch(() => null);
      return {
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        textPreview: page ? page.textContent.slice(0, 800) : null,
        h2: page ? page.h2.slice(0, 6) : [],
      };
    })
  );

  // Step 3: Search for related hashtags and discussions
  const socialQueries = [
    `#${niche.replace(/\s+/g, "")} trending`,
    `${niche} social media conversation ${timeframeLabel}`,
  ];

  const socialResults: { title: string; url: string; snippet: string }[] = [];
  for (const q of socialQueries) {
    const results = await searchWeb(q, 5);
    socialResults.push(...results);
  }

  // Step 4: AI analysis
  const searchContext = unique
    .slice(0, 20)
    .map((r) => `- ${r.title}: ${r.snippet}`)
    .join("\n");

  const socialContext = socialResults
    .map((r) => `- ${r.title}: ${r.snippet}`)
    .join("\n");

  const report = await analyze(
    `You are a social media trend analyst. Detect and analyze trending topics, conversations, and opportunities in a specific niche.

Structure your report as:
## Trend Detection: ${niche}
**Timeframe:** ${timeframeLabel}

### Top Trending Topics
For each trend (identify 5-8):
**1. [Trend Name]**
- What it is (1-2 sentence description)
- Why it's trending (catalyst/event)
- Platforms where it's most active
- Estimated momentum (rising/peaking/declining)
- Relevance score for ${niche} (1-10)

### Viral Content Patterns
- What content formats are going viral
- Common elements of viral posts in this niche
- Emotional triggers being used
- Hooks and patterns that drive shares

### Sentiment Analysis
- Overall sentiment in the niche (positive/neutral/negative)
- Key sentiment drivers
- Controversy or debate topics
- Opportunities in sentiment gaps

### Emerging Topics
Topics that aren't mainstream yet but showing early growth signals:
- [Topic 1] — why it matters, early indicators
- [Topic 2] — why it matters, early indicators
- [Topic 3] — why it matters, early indicators

### Content Opportunities
Specific content ideas based on current trends:
1. [Content idea] — format, platform, timing, expected resonance
2. [Content idea] — format, platform, timing, expected resonance
3. [Content idea] — format, platform, timing, expected resonance
4. [Content idea] — format, platform, timing, expected resonance
5. [Content idea] — format, platform, timing, expected resonance

### Trend Alerts
- Topics to avoid (oversaturated or risky)
- Upcoming events that may generate trends
- Platform algorithm changes affecting content

Be specific and reference actual patterns from the search data.`,
    `Niche: ${niche}
Timeframe: ${timeframeLabel}

Trending Content Search Results (${unique.length} sources):
${searchContext}

Social Discussion Data:
${socialContext}

Detailed Page Analysis:
${JSON.stringify(trendPages.filter((p) => p.textPreview), null, 2)}

Detect current trends and provide actionable content opportunities.`,
    3500
  );

  await log("info", "Trend detection complete", {
    niche,
    timeframe: tf,
    sources_found: unique.length,
  });

  return report;
}
