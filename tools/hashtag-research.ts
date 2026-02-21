import { searchWeb, fetchPage } from "../lib/scraper";
import { analyze } from "../lib/openai";
import { log } from "../lib/logger";

export interface ResearchHashtagsInput {
  topic: string;
  platform?: string;
  count?: number;
}

export async function researchHashtags(
  input: ResearchHashtagsInput
): Promise<string> {
  const { topic, platform, count } = input;
  const targetCount = Math.min(count || 20, 30);
  const platformStr = platform || "social media";
  await log("info", "Starting hashtag research", { topic, platform, targetCount });

  // Step 1: Search for popular hashtags in this topic
  const queries = [
    `best ${platformStr} hashtags for ${topic} 2026`,
    `#${topic.replace(/\s+/g, "")} popular hashtags`,
    `${topic} trending hashtags ${platformStr}`,
    `${topic} hashtag strategy niche hashtags`,
    `top ${platformStr} hashtags ${topic} engagement`,
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

  // Step 2: Fetch hashtag guide pages for deeper data
  const hashtagPages = await Promise.all(
    unique.slice(0, 6).map(async (r) => {
      const page = await fetchPage(r.url).catch(() => null);
      return {
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        textPreview: page ? page.textContent.slice(0, 1000) : null,
        h2: page ? page.h2.slice(0, 8) : [],
      };
    })
  );

  // Step 3: Search for hashtag performance data
  const performanceQueries = [
    `${platformStr} hashtag analytics ${topic} posts volume`,
    `${topic} hashtag reach engagement rate`,
  ];

  const perfResults: { title: string; url: string; snippet: string }[] = [];
  for (const q of performanceQueries) {
    const results = await searchWeb(q, 5);
    perfResults.push(...results);
  }

  // Step 4: Extract hashtags from search snippets and page content
  const allText = [
    ...unique.map((r) => r.snippet),
    ...hashtagPages.filter((p) => p.textPreview).map((p) => p.textPreview!),
  ].join(" ");

  const hashtagRegex = /#[a-zA-Z][a-zA-Z0-9_]{1,29}/g;
  const foundHashtags = [...new Set(allText.match(hashtagRegex) || [])];

  // Step 5: AI analysis
  const searchContext = unique
    .slice(0, 15)
    .map((r) => `- ${r.title}: ${r.snippet}`)
    .join("\n");

  const perfContext = perfResults
    .slice(0, 8)
    .map((r) => `- ${r.title}: ${r.snippet}`)
    .join("\n");

  const report = await analyze(
    `You are a social media hashtag strategist. Research and recommend hashtags for a topic.

Structure your report as:
## Hashtag Research: ${topic}
${platform ? `**Platform:** ${platform}` : "**Cross-platform recommendations**"}

### Top ${targetCount} Recommended Hashtags

Organize into tiers:

**High-Volume (broad reach, high competition):**
List 5-7 hashtags with:
- Hashtag name
- Estimated popularity (high/medium/low based on available data)
- Best use case

**Medium-Volume (balanced reach & discoverability):**
List 5-7 hashtags with same format

**Niche/Low-Volume (targeted, highly relevant):**
List 5-7 hashtags with same format

**Branded/Unique:**
List 2-3 suggested branded hashtag ideas

### Hashtag Sets
Pre-built copy-paste sets for different content types:

**Educational content:** [10 hashtags]
**Promotional content:** [10 hashtags]
**Community engagement:** [10 hashtags]

### Platform-Specific Recommendations
${platform ? `- Optimal number of hashtags for ${platform}` : "- Optimal hashtag counts by platform (Instagram, Twitter, TikTok, LinkedIn)"}
- Placement strategy (caption vs comment, inline vs end)
- Hashtag rotation strategy to avoid shadowban

### Hashtags to Avoid
- Banned or restricted hashtags in this niche
- Overused/spam-associated hashtags
- Irrelevant trending hashtags to skip

### Performance Tips
- Best practices for hashtag usage
- How to test hashtag effectiveness
- Rotation schedule recommendations

Be specific — provide actual hashtag recommendations, not just categories.`,
    `Topic: ${topic}
${platform ? `Platform: ${platform}` : "Platforms: All major platforms"}
Requested count: ${targetCount}

Hashtags Found in Search Data:
${foundHashtags.slice(0, 30).join(", ") || "None extracted directly"}

Search Results:
${searchContext}

Performance Data:
${perfContext}

Detailed Page Analysis:
${JSON.stringify(hashtagPages.filter((p) => p.textPreview), null, 2)}

Provide ${targetCount} specific hashtag recommendations organized by tier.`,
    3500
  );

  await log("info", "Hashtag research complete", {
    topic,
    platform,
    hashtags_found: foundHashtags.length,
    sources_analyzed: unique.length,
  });

  return report;
}
