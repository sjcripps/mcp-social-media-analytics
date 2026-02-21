import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (compatible; EzBizBot/1.0; +https://social.ezbizservices.com)";

export interface PageData {
  url: string;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  links: { text: string; href: string }[];
  images: number;
  hasSSL: boolean;
  loadTimeMs: number;
  metaTags: Record<string, string>;
  schemaOrg: any[];
  textContent: string;
  ogTags: Record<string, string>;
  error?: string;
}

export async function fetchPage(url: string): Promise<PageData> {
  const start = Date.now();
  const result: PageData = {
    url,
    title: "",
    description: "",
    h1: [],
    h2: [],
    links: [],
    images: 0,
    hasSSL: url.startsWith("https"),
    loadTimeMs: 0,
    metaTags: {},
    schemaOrg: [],
    textContent: "",
    ogTags: {},
  };

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    result.loadTimeMs = Date.now() - start;

    if (!resp.ok) {
      result.error = `HTTP ${resp.status}`;
      return result;
    }

    const html = await resp.text();
    const $ = cheerio.load(html);

    result.title = $("title").first().text().trim();
    result.description =
      $('meta[name="description"]').attr("content") || "";

    $("h1").each((_, el) => result.h1.push($(el).text().trim()));
    $("h2").each((_, el) => {
      if (result.h2.length < 10) result.h2.push($(el).text().trim());
    });

    $("a[href]").each((_, el) => {
      if (result.links.length < 50) {
        result.links.push({
          text: $(el).text().trim().slice(0, 100),
          href: $(el).attr("href") || "",
        });
      }
    });

    result.images = $("img").length;

    // Meta tags
    $("meta[name]").each((_, el) => {
      const name = $(el).attr("name") || "";
      const content = $(el).attr("content") || "";
      if (name && content) result.metaTags[name] = content.slice(0, 200);
    });

    // OG tags
    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr("property") || "";
      const content = $(el).attr("content") || "";
      if (prop && content) result.ogTags[prop] = content.slice(0, 200);
    });

    // Schema.org JSON-LD
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || "");
        result.schemaOrg.push(data);
      } catch {}
    });

    // Extract visible text (truncated)
    result.textContent = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
  } catch (err: any) {
    result.loadTimeMs = Date.now() - start;
    result.error = err.message;
  }

  return result;
}

export async function searchWeb(
  query: string,
  maxResults = 10
): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const encoded = encodeURIComponent(query);
    const resp = await fetch(
      `https://html.duckduckgo.com/html/?q=${encoded}`,
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000),
      }
    );
    const html = await resp.text();
    const $ = cheerio.load(html);
    const results: { title: string; url: string; snippet: string }[] = [];

    $(".result").each((_, el) => {
      if (results.length >= maxResults) return;
      const titleEl = $(el).find(".result__title a");
      const snippetEl = $(el).find(".result__snippet");
      const href = titleEl.attr("href") || "";

      let url = href;
      const uddgMatch = href.match(/uddg=([^&]+)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);

      if (url && url.startsWith("http")) {
        results.push({
          title: titleEl.text().trim(),
          url,
          snippet: snippetEl.text().trim(),
        });
      }
    });

    return results;
  } catch (err: any) {
    return [];
  }
}
