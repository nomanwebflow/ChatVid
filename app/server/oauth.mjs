// Minimal OAuth 2.1 authorization server for the ChatVid MCP connector.
// ChatVid is single-tenant, so there is no login UI or user DB: the authorize
// step auto-approves one logical user. The full handshake (discovery, DCR,
// PKCE, bearer validation) is still implemented because Claude requires it.
//
// ponytail: HMAC-signed opaque tokens via node:crypto, no JWT lib and no token
// store — stateless verify. Secret from env; add per-user identity + a real
// consent screen only if ChatVid becomes multi-tenant.
import crypto from "node:crypto";

const SECRET = process.env.CHATVID_OAUTH_SECRET || "chatvid-dev-secret-change-me";
const TOKEN_TTL_SEC = 30 * 24 * 3600; // 30 days
const CODE_TTL_MS = 5 * 60 * 1000;

// base64url helpers
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const b64uJson = (obj) => b64u(JSON.stringify(obj));
const unb64uJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString());

function sign(data) {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

// ── signed bearer token ──
function issueToken() {
  const payload = { sub: "chatvid-user", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC };
  const body = b64uJson(payload);
  return `${body}.${sign(body)}`;
}
export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  if (sign(body) !== mac) return null;
  try {
    const p = unb64uJson(body);
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

// ── short-lived auth codes (in-memory; fine for a single small instance) ──
const codes = new Map(); // code -> { challenge, method, redirectUri, exp }
function newCode(challenge, method, redirectUri) {
  const code = b64u(crypto.randomBytes(24));
  codes.set(code, { challenge, method, redirectUri, exp: Date.now() + CODE_TTL_MS });
  return code;
}
function takeCode(code) {
  const c = codes.get(code);
  if (!c) return null;
  codes.delete(code);
  if (c.exp < Date.now()) return null;
  return c;
}

function pkceOk(verifier, challenge, method) {
  if (!challenge) return true; // no PKCE requested
  if (method === "S256") return b64u(crypto.createHash("sha256").update(verifier).digest()) === challenge;
  return verifier === challenge; // plain
}

// Register all OAuth routes + discovery on the Express app. `base` is the public
// origin, e.g. https://chatvid.nomanahmed.io.
export function mountOAuth(app, base) {
  // RFC 9728 — protected resource metadata (what /mcp points to on 401)
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({ resource: `${base}/mcp`, authorization_servers: [base] });
  });
  // also answer the path-suffixed form some clients probe
  app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
    res.json({ resource: `${base}/mcp`, authorization_servers: [base] });
  });

  // RFC 8414 — authorization server metadata
  const asMeta = {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none"],
  };
  app.get("/.well-known/oauth-authorization-server", (_req, res) => res.json(asMeta));
  app.get("/.well-known/openid-configuration", (_req, res) => res.json(asMeta));

  // RFC 7591 — dynamic client registration (accept anything; we don't gate clients)
  app.post("/oauth/register", (req, res) => {
    res.status(201).json({
      client_id: `chatvid-${b64u(crypto.randomBytes(6))}`,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: req.body?.redirect_uris || [],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    });
  });

  // Authorization endpoint: single-tenant, so auto-approve and redirect back
  // with a code. PKCE challenge is remembered and enforced at the token step.
  app.get("/oauth/authorize", (req, res) => {
    const { redirect_uri, state, code_challenge, code_challenge_method } = req.query;
    if (!redirect_uri) return res.status(400).send("missing redirect_uri");
    const code = newCode(code_challenge, code_challenge_method || "plain", String(redirect_uri));
    const u = new URL(String(redirect_uri));
    u.searchParams.set("code", code);
    if (state) u.searchParams.set("state", String(state));
    res.redirect(u.toString());
  });

  // Token endpoint: verify the code + PKCE, issue a signed bearer token.
  // Body is parsed by express.urlencoded + express.json mounted in render.mjs.
  app.post("/oauth/token", (req, res) => {
    const { grant_type, code, code_verifier } = req.body || {};
    if (grant_type !== "authorization_code") return res.status(400).json({ error: "unsupported_grant_type" });
    const entry = takeCode(code);
    if (!entry) return res.status(400).json({ error: "invalid_grant" });
    if (!pkceOk(code_verifier, entry.challenge, entry.method)) return res.status(400).json({ error: "invalid_grant", error_description: "PKCE failed" });
    res.json({ access_token: issueToken(), token_type: "Bearer", expires_in: TOKEN_TTL_SEC });
  });
}

// Middleware for /mcp: require a valid bearer token, else 401 pointing at the
// protected-resource metadata (RFC 9728 WWW-Authenticate).
export function requireAuth(base) {
  return (req, res, next) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (verifyToken(token)) return next();
    res
      .status(401)
      .set("WWW-Authenticate", `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`)
      .json({ error: "invalid_token" });
  };
}
