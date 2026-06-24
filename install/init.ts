import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createTokenStore, readSpotifyConfig, toBasicAuth, writeSpotifyTokens } from "../api/spotify.ts";

type SpotifyTokenResponse = Parameters<typeof createTokenStore>[0];

const config = await readSpotifyConfig();
const redirectUrl = new URL(config.redirectUri);
const expectedState = crypto.randomUUID();

const authUrl = new URL(config.authBaseUrl);
authUrl.searchParams.set("client_id", config.clientId);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", config.redirectUri);
authUrl.searchParams.set("scope", config.scopes.join(" "));
authUrl.searchParams.set("state", expectedState);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", config.redirectUri);

    if (requestUrl.pathname !== redirectUrl.pathname) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const error = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");

    if (error) {
      throw new Error(`Spotify authorization failed: ${error}`);
    }

    if (!code || state !== expectedState) {
      throw new Error("Invalid Spotify callback.");
    }

    const tokens = await exchangeCodeForTokens(code);
    await writeSpotifyTokens(tokens);

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`
      <!doctype html>
      <html lang="ko">
        <head><meta charset="utf-8" /><title>Spotify connected</title></head>
        <body style="background:#0a0a0b;color:#e9e9ec;font-family:system-ui;padding:32px">
          <h1>Spotify 연결 완료</h1>
          <p>토큰이 spotify.json에 저장되었습니다. 이 창은 닫아도 됩니다.</p>
        </body>
      </html>
    `);

    console.log("Spotify token saved to spotify.json");
    server.close();
  } catch (callbackError) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(callbackError instanceof Error ? callbackError.message : "Unknown Spotify callback error");
    console.error(callbackError);
    server.close();
  }
});

await new Promise<void>((resolve) => {
  server.listen(Number(redirectUrl.port), redirectUrl.hostname, resolve);
});

console.log(`Spotify callback server listening on ${config.redirectUri}`);
console.log(`Open this URL to connect Spotify:\n${authUrl.toString()}`);
openBrowser(authUrl.toString());

async function exchangeCodeForTokens(code: string) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${toBasicAuth(config)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const body = (await tokenResponse.json()) as SpotifyTokenResponse | { error?: unknown };

  if (!tokenResponse.ok) {
    throw new Error(`Spotify token exchange failed: ${JSON.stringify(body)}`);
  }

  return createTokenStore(body as SpotifyTokenResponse);
}

function openBrowser(url: string) {
  const platform = process.platform;

  if (platform === "win32") {
    execFile("rundll32", ["url.dll,FileProtocolHandler", url]);
    return;
  }

  if (platform === "darwin") {
    execFile("open", [url]);
    return;
  }

  execFile("xdg-open", [url]);
}
