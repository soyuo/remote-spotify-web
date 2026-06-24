import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type SpotifyConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  market: string;
  authBaseUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
};

export type SpotifyTokenStore = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresIn: number;
  expiresAt: number;
  savedAt: string;
};

export type SpotifyTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  duration: string;
  imageUrl: string | null;
};

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  scope: string;
  expires_in: number;
};

const rootDir = resolve(import.meta.dirname, "..");
const configPath = resolve(rootDir, "spotify.config.json");
const tokenPath = resolve(rootDir, "spotify.json");

export async function readSpotifyConfig() {
  const config = JSON.parse(await readFile(configPath, "utf8")) as SpotifyConfig;

  if (!config.clientId || !config.clientSecret) {
    throw new Error("spotify.config.json에 clientId/clientSecret 값을 먼저 입력해 주세요.");
  }

  return config;
}

export async function readSpotifyTokens() {
  return JSON.parse(await readFile(tokenPath, "utf8")) as SpotifyTokenStore;
}

export async function writeSpotifyTokens(tokens: SpotifyTokenStore) {
  await writeFile(tokenPath, `${JSON.stringify(tokens, null, 2)}\n`, "utf8");
}

export function createTokenStore(response: SpotifyTokenResponse) {
  const now = Date.now();

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? "",
    tokenType: response.token_type,
    scope: response.scope,
    expiresIn: response.expires_in,
    expiresAt: now + response.expires_in * 1000,
    savedAt: new Date(now).toISOString(),
  };
}

export async function refreshAccessToken(config: SpotifyConfig, currentTokens: SpotifyTokenStore) {
  if (!currentTokens.refreshToken) {
    throw new Error("spotify.json에 refreshToken이 없습니다. spotify:init을 다시 실행해 주세요.");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentTokens.refreshToken,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${toBasicAuth(config)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const body = (await response.json()) as SpotifyTokenResponse | { error?: unknown };

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${JSON.stringify(body)}`);
  }

  const tokenBody = body as SpotifyTokenResponse;
  const nextTokens = createTokenStore({
    ...tokenBody,
    refresh_token: tokenBody.refresh_token ?? currentTokens.refreshToken,
  });

  await writeSpotifyTokens(nextTokens);
  return nextTokens;
}

export async function getValidAccessToken() {
  const config = await readSpotifyConfig();
  const tokens = await readSpotifyTokens();
  const expiresSoon = tokens.expiresAt - Date.now() < 60_000;

  if (!expiresSoon) {
    return tokens.accessToken;
  }

  const refreshedTokens = await refreshAccessToken(config, tokens);
  return refreshedTokens.accessToken;
}

export async function spotifyRequest<T>(path: string, init: RequestInit = {}) {
  const config = await readSpotifyConfig();
  const accessToken = await getValidAccessToken();
  const url = path.startsWith("http") ? path : `${config.apiBaseUrl}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const body = text && contentType.includes("application/json") ? JSON.parse(text) : text || undefined;

  if (response.status === 204 || response.status === 202 || body === undefined) {
    if (!response.ok) {
      throw new Error(`Spotify API request failed: ${response.status} ${response.statusText}`);
    }

    return undefined as T;
  }

  if (!response.ok) {
    throw new Error(`Spotify API request failed: ${JSON.stringify(body)}`);
  }

  return body as T;
}

export async function searchTracks(query: string, limit = 10) {
  const config = await readSpotifyConfig();
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(limit),
    market: config.market,
  });

  const data = await spotifyRequest<{
    tracks: {
      items: Array<{
        id: string;
        uri: string;
        name: string;
        duration_ms: number;
        artists: Array<{ name: string }>;
        album: { name: string; images: Array<{ url: string }> };
      }>;
    };
  }>(`/search?${params}`);

  return data.tracks.items.map<SpotifyTrack>((track) => ({
    id: track.id,
    uri: track.uri,
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(", "),
    album: track.album.name,
    durationMs: track.duration_ms,
    duration: formatDuration(track.duration_ms),
    imageUrl: track.album.images[0]?.url ?? null,
  }));
}

export async function getPlaybackState() {
  return spotifyRequest("/me/player");
}

export async function playTrack(uri: string, deviceId?: string) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyRequest(`/me/player/play${query}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [uri] }),
  });
}

export async function resumePlayback(deviceId?: string) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyRequest(`/me/player/play${query}`, {
    method: "PUT",
  });
}

export async function pausePlayback(deviceId?: string) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyRequest(`/me/player/pause${query}`, {
    method: "PUT",
  });
}

export async function previousTrack(deviceId?: string) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyRequest(`/me/player/previous${query}`, {
    method: "POST",
  });
}

export async function nextTrack(deviceId?: string) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyRequest(`/me/player/next${query}`, {
    method: "POST",
  });
}

export async function setVolume(volumePercent: number, deviceId?: string) {
  const params = new URLSearchParams({
    volume_percent: String(volumePercent),
  });

  if (deviceId) {
    params.set("device_id", deviceId);
  }

  return spotifyRequest(`/me/player/volume?${params}`, {
    method: "PUT",
  });
}

export async function seekPlayback(positionMs: number, deviceId?: string) {
  const params = new URLSearchParams({
    position_ms: String(positionMs),
  });

  if (deviceId) {
    params.set("device_id", deviceId);
  }

  return spotifyRequest(`/me/player/seek?${params}`, {
    method: "PUT",
  });
}

export function toBasicAuth(config: Pick<SpotifyConfig, "clientId" | "clientSecret">) {
  return Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
}

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
