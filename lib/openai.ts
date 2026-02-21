const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export async function analyze(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2000
): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function analyzeJSON<T = any>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2000
): Promise<T> {
  const result = await analyze(
    systemPrompt + "\n\nRespond ONLY with valid JSON. No markdown, no code blocks.",
    userPrompt,
    maxTokens
  );

  // Strip markdown code blocks if present
  const cleaned = result
    .replace(/^```json?\n?/gm, "")
    .replace(/^```\n?/gm, "")
    .trim();

  return JSON.parse(cleaned);
}
