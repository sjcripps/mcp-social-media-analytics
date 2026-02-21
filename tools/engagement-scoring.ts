import { searchWeb, fetchPage } from "../lib/scraper";
import { analyze } from "../lib/openai";
import { log } from "../lib/logger";

export interface ScoreEngagementInput {
  brand_or_topic: string;
  platform?: string;
}

export async function scoreEngagement(
  input: ScoreEngagementInput
): Promise<string> {
  const { brand_or_topic, platform } = input;
  await log("info", "Starting engagement scoring", { brand_or_topic, platform });

  const platformStr = platform || "social media";

  // Step 1: Search for engagement data
  const queries = [
    `${brand_or_topic} ${platformStr} engagement rate`,
    `${brand_or_topic} ${platformStr} likes comments shares`,
    `${brand_or_topic} social media analytics metrics`,
    `${brand_or_topic} ${platformStr} best posts viral content`,
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

  // Step 2: Fetch analytics-related pages
  const pages = await Promise.all(
    unique.slice(0, 5).map(async (r) => {
      const page = await fetchPage(r.url).catch(() => null);
      return {
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        textPreview: page ? page.textContent.slice(0, 600) : null,
      };
    })
  );

  // Step 3: Search for industry benchmarks
  const benchmarkResults = await searchWeb(
    `${platformStr} engagement rate benchmarks 2026 by industry`,
    5
  );

  const benchmarkPages = await Promise.all(
    benchmarkResults.slice(0, 2).map(async (r) => {
      const page = await fetchPage(r.url).catch(() => null);
      return {
        url: r.url,
        title: r.title,
        textPreview: page ? page.textContent.slice(0, 800) : r.snippet,
      };
    })
  );

  // Step 4: AI analysis
  const searchContext = unique
    .slice(0, 15)
    .map((r) => `- ${r.title}: ${r.snippet}`)
    .join("\n");

  const report = await analyze(
    `You are a social media engagement analyst. Score and analyze social media engagement for a brand or topic.

Structure your report as:
## Engagement Analysis: ${brand_or_topic}
${platform ? `**Platform:** ${platform}` : "**Cross-platform analysis**"}

### Overall Engagement Score: X/100
Based on available data, provide a composite engagement score.

### Engagement Metrics Breakdown
- Estimated engagement rate (vs industry average)
- Content interaction patterns (likes, comments, shares, saves)
- Audience responsiveness indicators
- Engagement trend (growing/stable/declining)

### Content Type Performance
Rank by estimated engagement:
1. [Best performing content type] — estimated engagement
2. [Second best]
3. [Third best]
Include specific examples where available.

### Posting Optimization
- Best estimated posting times (based on platform data and industry)
- Optimal posting frequency
- Content length/format recommendations

### Audience Engagement Quality
- Comment quality (substantive vs emoji-only)
- Share/save ratio indicators
- Community building evidence
- Brand advocate indicators

### Industry Benchmarks
- How this brand compares to industry average engagement rates
- Platform-specific benchmarks
- Top performer comparison

### Engagement Improvement Plan
Numbered, specific recommendations:
1. [Quick win — immediate impact]
2. [Content strategy change]
3. [Community building tactic]
4. [Platform-specific optimization]
5. [Long-term engagement strategy]

Be specific and reference actual data patterns from the research.`,
    `Brand/Topic: ${brand_or_topic}
${platform ? `Platform: ${platform}` : "Platforms: All major platforms"}

Search Results:
${searchContext}

Fetched Page Data:
${JSON.stringify(pages.filter((p) => p.textPreview), null, 2)}

Industry Benchmarks Data:
${JSON.stringify(benchmarkPages, null, 2)}

Provide a detailed engagement scoring and analysis report.`,
    3000
  );

  await log("info", "Engagement scoring complete", {
    brand_or_topic,
    sources_found: unique.length,
  });

  return report;
}
