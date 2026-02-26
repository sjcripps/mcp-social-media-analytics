/**
 * OAuth 2.0 Authorization Code + PKCE for MCP servers.
 * Implements the subset required by the MCP authorization spec:
 * - Protected Resource Metadata (RFC 9728)
 * - Authorization Server Metadata (RFC 8414)
 * - Dynamic Client Registration (RFC 7591)
 * - Authorization Code flow with PKCE (OAuth 2.1)
 *
 * The "authorization" step shows a branded page where users enter their API key.
 * The token returned IS the API key, so existing Bearer auth works seamlessly.
 */

import { randomBytes, createHash } from "crypto";

// --- In-memory stores (ephemeral — fine for auth codes with short TTL) ---

interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  apiKey: string; // the validated API key
  scope: string;
  resource?: string;
  expiresAt: number;
}

interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  clientName: string;
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
}

const authCodes = new Map<string, AuthCode>();
const registeredClients = new Map<string, RegisteredClient>();

// Clean expired codes every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes) {
    if (now > data.expiresAt) authCodes.delete(code);
  }
}, 5 * 60 * 1000);

// --- Config ---

export interface OAuthConfig {
  /** e.g. "https://mcp.ezbizservices.com" */
  issuerUrl: string;
  /** e.g. "EzBiz Business Intelligence" */
  serverName: string;
  /** Function to validate an API key — reuse existing auth.ts logic */
  validateKey: (key: string | null) => Promise<{ valid: boolean; error?: string; tier?: string; name?: string }>;
  /** CORS headers to include */
  corsHeaders: Record<string, string>;
}

// --- Metadata endpoints ---

export function protectedResourceMetadata(config: OAuthConfig): Response {
  return Response.json({
    resource: config.issuerUrl,
    authorization_servers: [config.issuerUrl],
    scopes_supported: ["mcp:tools"],
    bearer_methods_supported: ["header"],
  }, { headers: config.corsHeaders });
}

export function authorizationServerMetadata(config: OAuthConfig): Response {
  return Response.json({
    issuer: config.issuerUrl,
    authorization_endpoint: `${config.issuerUrl}/authorize`,
    token_endpoint: `${config.issuerUrl}/token`,
    registration_endpoint: `${config.issuerUrl}/register`,
    scopes_supported: ["mcp:tools"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256", "plain"],
    client_id_metadata_document_supported: true,
  }, { headers: config.corsHeaders });
}

// --- Dynamic Client Registration ---

export async function handleRegister(req: Request, config: OAuthConfig): Promise<Response> {
  try {
    const body = await req.json();
    const clientId = body.client_id || `client_${randomBytes(16).toString("hex")}`;
    const client: RegisteredClient = {
      clientId,
      redirectUris: body.redirect_uris || ["http://127.0.0.1/callback", "http://localhost/callback"],
      clientName: body.client_name || "MCP Client",
      grantTypes: body.grant_types || ["authorization_code"],
      responseTypes: body.response_types || ["code"],
      tokenEndpointAuthMethod: body.token_endpoint_auth_method || "none",
    };
    registeredClients.set(clientId, client);

    return Response.json({
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    }, { status: 201, headers: config.corsHeaders });
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: config.corsHeaders });
  }
}

// --- Authorization endpoint ---

export function buildAuthorizePageHtml(
  config: OAuthConfig,
  params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    scope: string;
    resource?: string;
  }
): string {
  // Encode params into hidden fields so the form POST can carry them
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize — ${config.serverName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #171717; border: 1px solid #262626; border-radius: 16px; padding: 40px; max-width: 420px; width: 100%; }
    h2 { font-size: 1.4rem; margin-bottom: 8px; color: #fff; }
    .subtitle { color: #a3a3a3; font-size: 0.9rem; margin-bottom: 24px; }
    label { display: block; font-size: 0.85rem; color: #a3a3a3; margin-bottom: 6px; }
    input[type="text"] { width: 100%; padding: 10px 14px; background: #0a0a0a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 0.95rem; font-family: monospace; outline: none; }
    input[type="text"]:focus { border-color: #3b82f6; }
    .btn { display: block; width: 100%; padding: 12px; margin-top: 16px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #2563eb; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { color: #ef4444; font-size: 0.85rem; margin-top: 8px; display: none; }
    .info { color: #a3a3a3; font-size: 0.8rem; margin-top: 16px; text-align: center; }
    .info a { color: #3b82f6; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Authorize ${config.serverName}</h2>
    <p class="subtitle">Enter your API key to connect this MCP server to your client.</p>
    <form id="authForm" method="POST" action="/authorize/submit">
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
      <input type="hidden" name="state" value="${escapeHtml(params.state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}">
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}">
      <input type="hidden" name="resource" value="${escapeHtml(params.resource || "")}">
      <label for="api_key">API Key</label>
      <input type="text" id="api_key" name="api_key" placeholder="sk_biz_..." required autofocus>
      <div class="error" id="errorMsg"></div>
      <button type="submit" class="btn" id="submitBtn">Authorize</button>
    </form>
    <p class="info">Don't have a key? <a href="${config.issuerUrl}/signup">Get a free API key</a></p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Handle GET /authorize — show the API key entry form */
export function handleAuthorizeGet(req: Request, config: OAuthConfig): Response {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const codeChallenge = url.searchParams.get("code_challenge") || "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";
  const scope = url.searchParams.get("scope") || "mcp:tools";
  const resource = url.searchParams.get("resource") || undefined;

  if (!redirectUri) {
    return new Response("Missing redirect_uri", { status: 400 });
  }

  const html = buildAuthorizePageHtml(config, {
    clientId, redirectUri, state, codeChallenge, codeChallengeMethod, scope, resource,
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html", ...config.corsHeaders },
  });
}

/** Handle POST /authorize/submit — validate API key, issue auth code, redirect */
export async function handleAuthorizePost(req: Request, config: OAuthConfig): Promise<Response> {
  const formData = await req.formData();
  const apiKey = formData.get("api_key") as string;
  const clientId = formData.get("client_id") as string;
  const redirectUri = formData.get("redirect_uri") as string;
  const state = formData.get("state") as string;
  const codeChallenge = formData.get("code_challenge") as string;
  const codeChallengeMethod = formData.get("code_challenge_method") as string || "S256";
  const scope = formData.get("scope") as string || "mcp:tools";
  const resource = formData.get("resource") as string || undefined;

  // Validate the API key
  const authResult = await config.validateKey(apiKey);
  if (!authResult.valid) {
    // Re-show the form with error
    const html = buildAuthorizePageHtml(config, {
      clientId, redirectUri, state, codeChallenge, codeChallengeMethod, scope, resource,
    }).replace(
      '<div class="error" id="errorMsg"></div>',
      `<div class="error" id="errorMsg" style="display:block">${escapeHtml(authResult.error || "Invalid API key")}</div>`
    );
    return new Response(html, {
      headers: { "Content-Type": "text/html", ...config.corsHeaders },
    });
  }

  // Generate auth code
  const code = randomBytes(32).toString("hex");
  authCodes.set(code, {
    code,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    apiKey,
    scope,
    resource,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
  });

  // Redirect back to client
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  return Response.redirect(redirectUrl.toString(), 302);
}

// --- Token endpoint ---

export async function handleToken(req: Request, config: OAuthConfig): Promise<Response> {
  let params: URLSearchParams;
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    params = new URLSearchParams(body);
  } else if (contentType.includes("application/json")) {
    const body = await req.json();
    params = new URLSearchParams(body);
  } else {
    // Try form-urlencoded as default
    const body = await req.text();
    params = new URLSearchParams(body);
  }

  const grantType = params.get("grant_type");
  const code = params.get("code");
  const codeVerifier = params.get("code_verifier");
  const redirectUri = params.get("redirect_uri");

  if (grantType !== "authorization_code") {
    return Response.json(
      { error: "unsupported_grant_type" },
      { status: 400, headers: config.corsHeaders }
    );
  }

  if (!code || !codeVerifier) {
    return Response.json(
      { error: "invalid_request", error_description: "code and code_verifier are required" },
      { status: 400, headers: config.corsHeaders }
    );
  }

  // Look up auth code
  const authCode = authCodes.get(code);
  if (!authCode) {
    return Response.json(
      { error: "invalid_grant", error_description: "Authorization code not found or expired" },
      { status: 400, headers: config.corsHeaders }
    );
  }

  // Auth codes are single-use
  authCodes.delete(code);

  // Check expiry
  if (Date.now() > authCode.expiresAt) {
    return Response.json(
      { error: "invalid_grant", error_description: "Authorization code expired" },
      { status: 400, headers: config.corsHeaders }
    );
  }

  // Verify redirect_uri matches
  if (redirectUri && redirectUri !== authCode.redirectUri) {
    return Response.json(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400, headers: config.corsHeaders }
    );
  }

  // Verify PKCE
  let computedChallenge: string;
  if (authCode.codeChallengeMethod === "S256") {
    computedChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
  } else {
    // plain
    computedChallenge = codeVerifier;
  }

  if (computedChallenge !== authCode.codeChallenge) {
    console.error(`[PKCE] Mismatch — method: ${authCode.codeChallengeMethod}, stored challenge: ${authCode.codeChallenge?.slice(0, 12)}..., computed: ${computedChallenge?.slice(0, 12)}..., verifier len: ${codeVerifier?.length}`);
    return Response.json(
      { error: "invalid_grant", error_description: "code_verifier does not match the challenge" },
      { status: 400, headers: config.corsHeaders }
    );
  }

  // Success — return the API key as the access token
  return Response.json({
    access_token: authCode.apiKey,
    token_type: "Bearer",
    expires_in: 86400, // 24 hours (API keys don't expire, but OAuth spec recommends this field)
    scope: authCode.scope,
  }, { headers: config.corsHeaders });
}

// --- 401 response helper ---

export function unauthorizedResponse(config: OAuthConfig): Response {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Authorization required" },
    id: null,
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${config.issuerUrl}/.well-known/oauth-protected-resource"`,
      ...config.corsHeaders,
    },
  });
}

// --- Route handler: call this from server.ts for OAuth-related paths ---

export async function handleOAuthRoute(
  req: Request,
  url: URL,
  config: OAuthConfig
): Promise<Response | null> {
  // Protected Resource Metadata
  if (url.pathname === "/.well-known/oauth-protected-resource" ||
      url.pathname === "/.well-known/oauth-protected-resource/mcp") {
    return protectedResourceMetadata(config);
  }

  // Authorization Server Metadata
  if (url.pathname === "/.well-known/oauth-authorization-server" ||
      url.pathname === "/.well-known/openid-configuration") {
    return authorizationServerMetadata(config);
  }

  // Dynamic Client Registration
  if (url.pathname === "/register" && req.method === "POST") {
    return handleRegister(req, config);
  }

  // Authorization endpoint
  if (url.pathname === "/authorize" && req.method === "GET") {
    return handleAuthorizeGet(req, config);
  }

  // Authorization form submission
  if (url.pathname === "/authorize/submit" && req.method === "POST") {
    return handleAuthorizePost(req, config);
  }

  // Token endpoint
  if (url.pathname === "/token" && req.method === "POST") {
    return handleToken(req, config);
  }

  // Not an OAuth route
  return null;
}
