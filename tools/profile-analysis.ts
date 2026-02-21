import { searchWeb, fetchPage } from "../lib/scraper";
import { analyze } from "../lib/openai";
import { log } from "../lib/logger";

export interface AnalyzeProfileInput {
  username: string;
  platform?: string;
  business_name?: string;
}

export async function analyzeProfile(
  input: AnalyzeProfileInput
): Promise<string> {
  const { username, platform, business_name } = input;
  await log("info", "Starting profile analysis", { username, platform });

  const platformStr = platform || "social media";
  const brandStr = business_name || username;

  // Step 1: Search for the profile across platforms
  const queries = [
    `${username} ${platformStr} profile`,
    `"${username}" ${platform ? `site:${getPlatformDomain(platform)}` : "social media"}`,
    `${brandStr} ${platformStr} followers engagement`,
    `${brandStr} social media presence review`,
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

  // Step 2: Fetch profile pages and mentions
  const pagesToFetch = unique.slice(0, 6);
  const pages = await Promise.all(
    pagesToFetch.map(async (r) => {
      const page = await fetchPage(r.url).catch(() => null);
      return {
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        pageData: page
          ? {
              title: page.title,
              description: page.description,
              textPreview: page.textContent.slice(0, 800),
              ogTags: page.ogTags,
              images: page.images,
            }
          : null,
      };
    })
  );

  // Step 3: Search for recent content/posts
  const recentQueries = [
    `${brandStr} latest posts ${platformStr} 2026`,
    `${username} content strategy`,
  ];

  const recentResults: { title: string; url: string; snippet: string }[] = [];
  for (const q of recentQueries) {
    const results = await searchWeb(q, 5);
    recentResults.push(...results);
  }

  // Step 4: AI analysis
  const searchContext = unique
    .slice(0, 15)
    .map((r) => `- ${r.title}: ${r.snippet}`)
    .join("\n");

  const recentContext = recentResults
    .slice(0, 8)
    .map((r) => `- ${r.title}: ${r.snippet}`)
    .join("\n");

  const report = await analyze(
    `You are a social media analyst. Analyze the social media profile and presence of this brand/person.

Structure your report as:
## Social Media Profile Analysis: @${username}
${platform ? `**Platform:** ${platform}` : "**Cross-platform analysis**"}

### Profile Overview
- Platform presence (which platforms they're on)
- Bio/description quality assessment
- Profile completeness score (1-10)
- Branding consistency across platforms

### Content Analysis
- Primary content types (images, videos, text, stories, reels)
- Posting frequency estimate
- Content themes and pillars
- Content quality assessment
- Tone and voice analysis

### Audience Indicators
- Estimated audience size/growth indicators
- Audience engagement quality
- Community building efforts
- Response to audience (comments, DMs)

### Strengths
Top 3-5 things they're doing well

### Weaknesses
Top 3-5 areas for improvement

### Competitive Position
- How they compare to similar accounts in the space
- Unique differentiators
- Market positioning

### Growth Recommendations
Numbered list of specific, actionable recommendations:
1. [Highest impact]
2. [Next highest]
...

Be specific and data-driven. Reference patterns you observe in the search results.`,
    `Username: @${username}
${platform ? `Platform: ${platform}` : "Platform: Cross-platform"}
${business_name ? `Business: ${business_name}` : ""}

Search Results & Profile Data:
${searchContext}

Recent Content/Posts Found:
${recentContext}

Fetched Page Data:
${JSON.stringify(pages.filter((p) => p.pageData), null, 2)}

Provide a comprehensive social media profile analysis.`,
    3000
  );

  await log("info", "Profile analysis complete", {
    username,
    platform,
    sources_found: unique.length,
  });

  return report;
}

function getPlatformDomain(platform: string): string {
  const domains: Record<string, string> = {
    twitter: "x.com",
    instagram: "instagram.com",
    linkedin: "linkedin.com",
    facebook: "facebook.com",
    tiktok: "tiktok.com",
    youtube: "youtube.com",
  };
  return domains[platform.toLowerCase()] || platform;
}
