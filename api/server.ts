import type { Response } from "express";
import express from "express";
import {
  formatDuration,
  getPlaybackState,
  nextTrack,
  pausePlayback,
  playTrack,
  previousTrack,
  resumePlayback,
  searchTracks,
  seekPlayback,
  setVolume,
  type SpotifyTrack,
} from "./spotify.ts";

type SearchSong = Pick<
  SpotifyTrack,
  "id" | "uri" | "title" | "artist" | "album" | "durationMs" | "duration" | "imageUrl"
> & {
  playId: string;
};

type QueueItem = SearchSong & {
  queueId: string;
};

type SpotifyPlayerResponse = {
  is_playing: boolean;
  progress_ms: number | null;
  device: {
    volume_percent: number | null;
  } | null;
  item: SpotifyPlayerItem | null;
};

type SpotifyPlayerItem =
  | {
      type: "track";
      id: string;
      uri: string;
      name: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album: { name: string; images: Array<{ url: string }> };
    }
  | { type: string };

type PlayerSnapshot = {
  isPlaying: boolean;
  repeatEnabled: boolean;
  volumePercent: number;
  progressMs: number;
  progressPercent: number;
  updatedAt: number;
  track: SearchSong | null;
};

type StreamClient = {
  playerPayload: string;
  queuePayload: string;
  response: Response;
};

const playerClients = new Set<StreamClient>();
let queueItems: QueueItem[] = [];
let repeatEnabled = false;
let playerSnapshot: PlayerSnapshot = {
  isPlaying: false,
  repeatEnabled,
  volumePercent: 1,
  progressMs: 0,
  progressPercent: 0,
  updatedAt: Date.now(),
  track: null,
};

function isSpotifyTrackItem(item: SpotifyPlayerItem | null): item is Extract<SpotifyPlayerItem, { type: "track" }> {
  return item?.type === "track" && "duration_ms" in item;
}

function toSearchSong(track: SpotifyTrack): SearchSong {
  return {
    id: track.id,
    playId: track.uri,
    uri: track.uri,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    duration: track.duration,
    imageUrl: track.imageUrl,
  };
}

function toPlayerSnapshot(player: SpotifyPlayerResponse | undefined): PlayerSnapshot {
  if (!player || !isSpotifyTrackItem(player.item)) {
    return {
      isPlaying: false,
      repeatEnabled,
      volumePercent: player?.device?.volume_percent ?? playerSnapshot.volumePercent,
      progressMs: 0,
      progressPercent: 0,
      updatedAt: Date.now(),
      track: null,
    };
  }

  const progressMs = player.progress_ms ?? 0;
  const track = player.item;
  const durationMs = track.duration_ms;

  return {
    isPlaying: player.is_playing,
    repeatEnabled,
    volumePercent: player.device?.volume_percent ?? playerSnapshot.volumePercent,
    progressMs,
    progressPercent: durationMs > 0 ? Math.min((progressMs / durationMs) * 100, 100) : 0,
    updatedAt: Date.now(),
    track: {
      id: track.id,
      playId: track.uri,
      uri: track.uri,
      title: track.name,
      artist: track.artists.map((artist) => artist.name).join(", "),
      album: track.album.name,
      durationMs,
      duration: formatDuration(durationMs),
      imageUrl: track.album.images[0]?.url ?? null,
    },
  };
}

function toQueueItem(body: Record<string, unknown>): QueueItem | null {
  const rawId = String(body.id ?? body.playId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const artist = String(body.artist ?? "").trim();
  const durationMs = Number(body.durationMs);

  if (!rawId || !title || !artist || !Number.isFinite(durationMs)) {
    return null;
  }

  const playId = rawId.startsWith("spotify:track:") ? rawId : `spotify:track:${rawId}`;
  const id = playId.replace("spotify:track:", "");
  const imageUrl = typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null;
  const album = typeof body.album === "string" ? body.album : "";

  return {
    id,
    playId,
    uri: playId,
    title,
    artist,
    album,
    durationMs,
    duration: formatDuration(durationMs),
    imageUrl,
    queueId: crypto.randomUUID(),
  };
}

function sendPlayer(client: StreamClient, snapshot: PlayerSnapshot, force = false) {
  const payload = JSON.stringify(snapshot);

  if (!force && payload === client.playerPayload) {
    client.response.write(": keep-alive\n\n");
    return;
  }

  client.playerPayload = payload;
  client.response.write(`event: player\ndata: ${payload}\n\n`);
}

function sendQueue(client: StreamClient, force = false) {
  const payload = JSON.stringify({ items: queueItems });

  if (!force && payload === client.queuePayload) {
    return;
  }

  client.queuePayload = payload;
  client.response.write(`event: queue\ndata: ${payload}\n\n`);
}

function broadcastPlayer(snapshot = playerSnapshot, force = true) {
  for (const client of playerClients) {
    sendPlayer(client, snapshot, force);
  }
}

function broadcastQueue(force = true) {
  for (const client of playerClients) {
    sendQueue(client, force);
  }
}

async function playQueueItem(item: QueueItem) {
  await playTrack(item.playId);
  setCurrentQueueItem(item);
  return refreshPlayerSnapshot(350);
}

async function playNextQueueItem() {
  if (!queueItems.length) {
    await nextTrack();
    const snapshot = await refreshPlayerSnapshot(350);
    setCurrentTrackFromSnapshot(snapshot);
    return snapshot;
  }

  const currentQueuedTrack = queueItems[0];
  const nextQueuedTrack = queueItems[1];

  if (repeatEnabled) {
    queueItems = nextQueuedTrack ? [...queueItems.slice(1), currentQueuedTrack] : [currentQueuedTrack];
  } else {
    queueItems = queueItems.slice(1);
  }

  broadcastQueue(true);

  if (!nextQueuedTrack) {
    if (repeatEnabled) {
      await playTrack(currentQueuedTrack.playId);
    } else {
      await nextTrack();
    }
    const snapshot = await refreshPlayerSnapshot(350);
    setCurrentTrackFromSnapshot(snapshot);
    return snapshot;
  }

  await playTrack(nextQueuedTrack.playId);
  return refreshPlayerSnapshot(350);
}

function isTrackAtEnd(snapshot: PlayerSnapshot) {
  if (!snapshot.track) {
    return false;
  }

  const remainingMs = snapshot.track.durationMs - snapshot.progressMs;
  return remainingMs <= 1500 || snapshot.progressPercent >= 99;
}

function stoppedAtEnd(previousSnapshot: PlayerSnapshot, nextSnapshot: PlayerSnapshot) {
  if (nextSnapshot.isPlaying) {
    return false;
  }

  const nextStoppedAtEnd = isTrackAtEnd(nextSnapshot);
  const previousWasAtEnd = isTrackAtEnd(previousSnapshot);
  const sameTrack =
    !previousSnapshot.track || !nextSnapshot.track || previousSnapshot.track.id === nextSnapshot.track.id;

  return sameTrack && (nextStoppedAtEnd || previousWasAtEnd);
}

async function maybePlayNextQueuedTrack(previousSnapshot: PlayerSnapshot, nextSnapshot: PlayerSnapshot) {
  if (queueItems.length < 2 || !stoppedAtEnd(previousSnapshot, nextSnapshot)) {
    return nextSnapshot;
  }

  return playNextQueueItem();
}

async function playSpotifyNextOrQueuedTrack() {
  if (queueItems.length) {
    return playNextQueueItem();
  }

  await nextTrack();
  const snapshot = await refreshPlayerSnapshot(350);
  setCurrentTrackFromSnapshot(snapshot);
  return snapshot;
}

async function refreshPlayerSnapshot(delayMs = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const previousSnapshot = playerSnapshot;
  const player = await getPlaybackState();
  const nextSnapshot = toPlayerSnapshot(player as SpotifyPlayerResponse | undefined);
  playerSnapshot = await maybePlayNextQueuedTrack(previousSnapshot, nextSnapshot);
  setCurrentTrackFromSnapshot(playerSnapshot);
  broadcastPlayer(playerSnapshot, true);
  return playerSnapshot;
}

function applyPlayerPatch(patch: Partial<PlayerSnapshot>) {
  playerSnapshot = {
    ...playerSnapshot,
    ...patch,
    updatedAt: Date.now(),
  };
  broadcastPlayer(playerSnapshot, true);
  return playerSnapshot;
}

function parseLimit(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

function parseVolume(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(Math.max(Math.round(parsed), 1), 100);
}

function parsePositionMs(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(Math.round(parsed), 0);
}

function findQueueItem(value: unknown) {
  const queueId = String(value ?? "");
  return queueItems.find((item) => item.queueId === queueId) ?? null;
}

function toQueueItemFromSearchSong(song: SearchSong, queueId = crypto.randomUUID()): QueueItem {
  return {
    ...song,
    queueId,
  };
}

function setCurrentQueueItem(item: QueueItem) {
  const currentQueueId = queueItems[0]?.queueId;
  queueItems = [
    item,
    ...queueItems.filter((queueItem) => queueItem.queueId !== item.queueId && queueItem.queueId !== currentQueueId),
  ];
  broadcastQueue(true);
}

function setCurrentTrackFromSnapshot(snapshot: PlayerSnapshot) {
  if (!snapshot.track) {
    return;
  }

  if (queueItems[0]?.playId === snapshot.track.playId) {
    return;
  }

  setCurrentQueueItem(toQueueItemFromSearchSong(snapshot.track));
}

function shuffleQueueItems(items: QueueItem[]) {
  const [currentItem, ...upcomingItems] = items;
  const shuffledItems = [...upcomingItems];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]];
  }

  return currentItem ? [currentItem, ...shuffledItems] : shuffledItems;
}

export function createApiServer(): express.Application {
  const app = express();

  app.use(express.json());

  app.get("/api/player", async (request, response) => {
    const wantsStream = request.headers.accept?.includes("text/event-stream") ?? false;

    if (wantsStream) {
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      });
      response.write(": connected\n\n");

      const client: StreamClient = {
        playerPayload: "",
        queuePayload: "",
        response,
      };
      playerClients.add(client);
      sendPlayer(client, playerSnapshot, true);
      sendQueue(client, true);

      const intervalId = setInterval(async () => {
        try {
          await refreshPlayerSnapshot();
          sendQueue(client);
        } catch (error) {
          console.error(error);
          response.write(`event: error\ndata: ${JSON.stringify({ error: "spotify player request failed" })}\n\n`);
        }
      }, 1500);

      request.on("close", () => {
        clearInterval(intervalId);
        playerClients.delete(client);
      });
      return;
    }

    try {
      response.json(await refreshPlayerSnapshot());
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "spotify player request failed" });
    }
  });

  app.get("/api/search", async (request, response) => {
    const query = String(request.query.query ?? "").trim();

    if (!query) {
      response.status(400).json({ error: "query is required" });
      return;
    }

    try {
      const tracks = await searchTracks(query, parseLimit(request.query.limit));
      response.json({ songs: tracks.map(toSearchSong) });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "spotify search failed" });
    }
  });

  app.get("/api/queue", (_request, response) => {
    response.json({ items: queueItems });
  });

  app.post("/api/queue/add", (request, response) => {
    const item = toQueueItem(request.body ?? {});

    if (!item) {
      response.status(400).json({ error: "queue item is invalid" });
      return;
    }

    setCurrentTrackFromSnapshot(playerSnapshot);
    queueItems = [...queueItems, item];
    broadcastQueue(true);
    response.json({ ok: true, item, items: queueItems });
  });

  app.post("/api/queue/play", async (request, response) => {
    const item = findQueueItem(request.body?.queueId ?? request.query.queueId);

    if (!item) {
      response.status(404).json({ error: "queue item not found" });
      return;
    }

    try {
      const snapshot = await playQueueItem(item);
      response.json({ ok: true, player: snapshot, items: queueItems });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "queue play failed" });
    }
  });

  app.post("/api/queue/remove", (request, response) => {
    const item = findQueueItem(request.body?.queueId ?? request.query.queueId);

    if (!item) {
      response.status(404).json({ error: "queue item not found" });
      return;
    }

    queueItems = queueItems.filter((queueItem) => queueItem.queueId !== item.queueId);
    broadcastQueue(true);
    response.json({ ok: true, items: queueItems });
  });

  app.post("/api/shuffle", (_request, response) => {
    setCurrentTrackFromSnapshot(playerSnapshot);
    queueItems = shuffleQueueItems(queueItems);
    broadcastQueue(true);
    response.json({ ok: true, items: queueItems });
  });

  app.post("/api/repeat", (_request, response) => {
    repeatEnabled = !repeatEnabled;
    playerSnapshot = {
      ...playerSnapshot,
      repeatEnabled,
      updatedAt: Date.now(),
    };
    broadcastPlayer(playerSnapshot, true);
    response.json({ ok: true, repeatEnabled, player: playerSnapshot });
  });

  app.post("/api/play", async (request, response) => {
    const id = String(request.body?.id ?? request.query.id ?? "").trim();

    if (!id) {
      response.status(400).json({ error: "id is required" });
      return;
    }

    const trackUri = id.startsWith("spotify:track:") ? id : `spotify:track:${id}`;

    try {
      await playTrack(trackUri);
      const snapshot = await refreshPlayerSnapshot(350);
      setCurrentTrackFromSnapshot(snapshot);
      response.json({ ok: true, id: trackUri, player: snapshot, items: queueItems });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "spotify play failed" });
    }
  });

  app.post("/api/play/previous", async (_request, response) => {
    try {
      await previousTrack();
      const snapshot = await refreshPlayerSnapshot(350);
      response.json({ ok: true, player: snapshot, items: queueItems });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "spotify previous failed" });
    }
  });

  app.post("/api/play/next", async (_request, response) => {
    try {
      const snapshot = await playSpotifyNextOrQueuedTrack();
      response.json({ ok: true, player: snapshot, items: queueItems });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "spotify next failed" });
    }
  });

  app.post("/api/toggle", async (_request, response) => {
    try {
      const shouldPause = playerSnapshot.isPlaying;

      if (shouldPause) {
        await pausePlayback();
        applyPlayerPatch({ isPlaying: false });
      } else {
        await resumePlayback();
        applyPlayerPatch({ isPlaying: true });
      }

      const snapshot = await refreshPlayerSnapshot(150);
      response.json({ ok: true, player: snapshot });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "spotify toggle failed" });
    }
  });

  app.post("/api/volume", async (request, response) => {
    const volume = parseVolume(request.query.value);

    if (volume === null) {
      response.status(400).json({ error: "value is required" });
      return;
    }

    try {
      applyPlayerPatch({ volumePercent: volume });
      await setVolume(volume);
      response.json({ ok: true, volumePercent: volume, player: playerSnapshot });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "spotify volume failed" });
    }
  });

  app.post("/api/seek", async (request, response) => {
    const positionMs = parsePositionMs(request.query.position_ms ?? request.query.positionMs);

    if (positionMs === null) {
      response.status(400).json({ error: "position_ms is required" });
      return;
    }

    const durationMs = playerSnapshot.track?.durationMs ?? positionMs;
    const nextProgressMs = Math.min(positionMs, durationMs);

    try {
      applyPlayerPatch({
        progressMs: nextProgressMs,
        progressPercent: durationMs > 0 ? Math.min((nextProgressMs / durationMs) * 100, 100) : 0,
      });
      await seekPlayback(nextProgressMs);
      const snapshot = await refreshPlayerSnapshot(150);
      response.json({ ok: true, positionMs: nextProgressMs, player: snapshot });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "spotify seek failed" });
    }
  });

  return app;
}

const port = Number(process.env.PORT ?? 3000);

createApiServer().listen(port, "127.0.0.1", () => {
  console.log(`API server listening on http://127.0.0.1:${port}`);
});
