import { useEffect, useRef, useState } from "react";
import { PlayerBar, type PlayerTrack } from "../components/PlayerBar";
import { QueuePanel, type QueueItem } from "../components/QueuePanel";
import { SearchEmptyState } from "../components/SearchEmptyState";
import { SearchInput } from "../components/SearchInput";
import { SearchLoadingPreview } from "../components/SearchLoadingPreview";
import { SearchResults, type Song } from "../components/SearchResults";

type SearchResponse = {
  songs: Song[];
};

type QueueResponse = {
  items: QueueItem[];
};

type PlayerResponse = {
  isPlaying: boolean;
  volumePercent: number;
  progressMs: number;
  progressPercent: number;
  updatedAt: number;
  track: (Song & PlayerTrack) | null;
};

type PlayerActionResponse = {
  items?: QueueItem[];
  player?: PlayerResponse;
};

const idlePlayer: PlayerResponse = {
  isPlaying: false,
  volumePercent: 1,
  progressMs: 0,
  progressPercent: 0,
  updatedAt: Date.now(),
  track: null,
};

function estimateProgressMs(player: PlayerResponse, now = Date.now()) {
  if (!player.isPlaying || !player.track) {
    return player.progressMs;
  }

  return Math.min(player.progressMs + Math.max(now - player.updatedAt, 0), player.track.durationMs);
}

function samePlaybackSecond(current: PlayerResponse, incoming: PlayerResponse) {
  if (!current.track || !incoming.track || current.track.id !== incoming.track.id) {
    return false;
  }

  if (!current.isPlaying || !incoming.isPlaying) {
    return false;
  }

  const now = Date.now();
  return Math.floor(estimateProgressMs(current, now) / 1000) === Math.floor(incoming.progressMs / 1000);
}

function reconcilePlayer(current: PlayerResponse, incoming: PlayerResponse): PlayerResponse {
  if (!samePlaybackSecond(current, incoming)) {
    return incoming;
  }

  return {
    ...incoming,
    progressMs: current.progressMs,
    progressPercent: current.progressPercent,
    updatedAt: current.updatedAt,
  };
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<Song[]>([]);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [playError, setPlayError] = useState("");
  const [isShuffling, setIsShuffling] = useState(false);
  const [player, setPlayer] = useState<PlayerResponse>(idlePlayer);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const searchTimerRef = useRef<number | null>(null);
  const searchRequestIdRef = useRef(0);
  const volumeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const playerEvents = new EventSource("/api/player");

    playerEvents.addEventListener("player", (event) => {
      const data = JSON.parse(event.data) as PlayerResponse;
      setPlayer((currentPlayer) => reconcilePlayer(currentPlayer, data));
    });

    playerEvents.addEventListener("queue", (event) => {
      const data = JSON.parse(event.data) as QueueResponse;
      setQueueItems(data.items);
    });

    return () => {
      playerEvents.close();

      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }

      if (volumeTimerRef.current) {
        window.clearTimeout(volumeTimerRef.current);
      }
    };
  }, []);

  async function postPlayerAction(path: string, optimisticPlayer?: PlayerResponse) {
    setPlayError("");

    if (optimisticPlayer) {
      setPlayer(optimisticPlayer);
    }

    try {
      const response = await fetch(path, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("player action failed");
      }

      const data = (await response.json()) as PlayerActionResponse;

      if (data.player) {
        setPlayer((currentPlayer) => reconcilePlayer(currentPlayer, data.player!));
      }

      if (data.items) {
        setQueueItems(data.items);
      }
    } catch (error) {
      console.error(error);
      setPlayError("재생 조작에 실패했어요. Spotify 앱과 활성 기기를 확인해 주세요.");
    }
  }

  async function handleSearch() {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return;
    }

    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    setIsSearching(true);
    setHasSearched(false);
    setSubmittedQuery(trimmedQuery);
    setSearchError("");
    setPlayError("");
    setResults([]);

    try {
      const minimumLoading = new Promise((resolve) => {
        searchTimerRef.current = window.setTimeout(resolve, 650);
      });
      const searchRequest = fetch(`/api/search?query=${encodeURIComponent(trimmedQuery)}`);
      const [response] = await Promise.all([searchRequest, minimumLoading]);

      if (searchRequestIdRef.current !== requestId) {
        return;
      }

      if (!response.ok) {
        throw new Error("search request failed");
      }

      const data = (await response.json()) as SearchResponse;
      setResults(data.songs);
    } catch (error) {
      if (searchRequestIdRef.current !== requestId) {
        return;
      }

      console.error(error);
      setSearchError("검색 요청에 실패했어요. 서버와 Spotify 연결을 확인해 주세요.");
      setResults([]);
    } finally {
      if (searchRequestIdRef.current === requestId) {
        setIsSearching(false);
        setHasSearched(true);
      }
    }
  }

  async function handleAddToQueue(song: Song) {
    try {
      const response = await fetch("/api/queue/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: song.playId,
          imageUrl: song.imageUrl,
          artist: song.artist,
          title: song.title,
          durationMs: song.durationMs,
          album: song.album,
        }),
      });

      if (!response.ok) {
        throw new Error("queue add failed");
      }

      const data = (await response.json()) as QueueResponse;
      setQueueItems(data.items);
    } catch (error) {
      console.error(error);
    }
  }

  async function handlePlay(song: Song) {
    setPlayError("");

    const optimisticPlayer: PlayerResponse = {
      isPlaying: true,
      volumePercent: player.volumePercent,
      progressMs: 0,
      progressPercent: 0,
      updatedAt: Date.now(),
      track: song,
    };

    setPlayer(optimisticPlayer);

    try {
      const response = await fetch("/api/play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: song.playId }),
      });

      if (!response.ok) {
        throw new Error("play request failed");
      }

      const data = (await response.json()) as PlayerActionResponse;

      if (data.player) {
        setPlayer((currentPlayer) => reconcilePlayer(currentPlayer, data.player!));
      }

      if (data.items) {
        setQueueItems(data.items);
      }
    } catch (error) {
      console.error(error);
      setPlayError("재생 요청에 실패했어요. Spotify 앱과 활성 기기를 확인해 주세요.");
    }
  }

  function handleQueuePlay(item: QueueItem) {
    setPlayError("");
    setPlayer({
      isPlaying: true,
      volumePercent: player.volumePercent,
      progressMs: 0,
      progressPercent: 0,
      updatedAt: Date.now(),
      track: item,
    });

    fetch("/api/queue/play", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ queueId: item.queueId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("queue play failed");
        }

        const data = (await response.json()) as PlayerActionResponse;
        if (data.player) {
          setPlayer((currentPlayer) => reconcilePlayer(currentPlayer, data.player!));
        }
        if (data.items) {
          setQueueItems(data.items);
        }
      })
      .catch((error) => {
        console.error(error);
        setPlayError("재생 조작에 실패했어요. Spotify 앱과 활성 기기를 확인해 주세요.");
      });
  }

  async function handleQueueRemove(item: QueueItem) {
    try {
      const response = await fetch("/api/queue/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queueId: item.queueId }),
      });

      if (!response.ok) {
        throw new Error("queue remove failed");
      }

      const data = (await response.json()) as QueueResponse;
      setQueueItems(data.items);
    } catch (error) {
      console.error(error);
    }
  }

  function handleToggle() {
    postPlayerAction("/api/toggle", {
      ...player,
      isPlaying: !player.isPlaying,
      progressMs: estimateProgressMs(player),
      updatedAt: Date.now(),
    });
  }

  function handlePrevious() {
    postPlayerAction("/api/play/previous");
  }

  function handleNext() {
    postPlayerAction("/api/play/next");
  }

  async function handleShuffle() {
    setPlayError("");
    setIsShuffling(true);

    try {
      const response = await fetch("/api/shuffle", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("shuffle request failed");
      }

      const data = (await response.json()) as QueueResponse;
      setQueueItems(data.items);
    } catch (error) {
      console.error(error);
      setPlayError("재생 목록을 섞지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setIsShuffling(false);
    }
  }

  function handleSeek(positionMs: number) {
    setPlayError("");

    setPlayer((currentPlayer) => {
      if (!currentPlayer.track) {
        return currentPlayer;
      }

      const nextProgressMs = Math.min(Math.max(positionMs, 0), currentPlayer.track.durationMs);

      return {
        ...currentPlayer,
        progressMs: nextProgressMs,
        progressPercent: (nextProgressMs / currentPlayer.track.durationMs) * 100,
        updatedAt: Date.now(),
      };
    });

    fetch(`/api/seek?position_ms=${Math.round(positionMs)}`, {
      method: "POST",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("seek request failed");
        }

        const data = (await response.json()) as PlayerActionResponse;

        if (data.player) {
          setPlayer((currentPlayer) => reconcilePlayer(currentPlayer, data.player!));
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }

  function handleVolumeChange(value: number) {
    const volume = Math.min(Math.max(Math.round(value), 1), 100);

    setPlayer((currentPlayer) => ({
      ...currentPlayer,
      volumePercent: volume,
    }));

    if (volumeTimerRef.current) {
      window.clearTimeout(volumeTimerRef.current);
    }

    volumeTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/volume?value=${volume}`, {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("volume request failed");
        }

        const data = (await response.json()) as PlayerActionResponse;

        if (data.player) {
          setPlayer((currentPlayer) => reconcilePlayer(currentPlayer, data.player!));
        }
      } catch (error) {
        console.error(error);
      }
    }, 180);
  }

  const hasQueue = queueItems.length > 0;

  return (
    <main className={`app-shell${hasQueue ? " has-queue" : ""}${isQueueOpen ? " queue-open" : ""}`}>
      {hasQueue ? (
        <button
          aria-label={isQueueOpen ? "재생 목록 닫기" : "재생 목록 열기"}
          className={`queue-toggle-button${isQueueOpen ? " is-open" : ""}`}
          onClick={() => setIsQueueOpen((open) => !open)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
      ) : null}
      {hasQueue ? <div className="queue-backdrop" onClick={() => setIsQueueOpen(false)} /> : null}
      {hasQueue ? (
        <QueuePanel
          isOpen={isQueueOpen}
          items={queueItems}
          onClose={() => setIsQueueOpen(false)}
          onPlay={handleQueuePlay}
          onRemove={handleQueueRemove}
        />
      ) : null}
      <section className="search-screen" aria-labelledby="search-title">
        <h1 id="search-title">노래 검색</h1>
        <SearchInput
          isLoading={isSearching}
          onChange={setQuery}
          onSubmit={handleSearch}
          placeholder="곡, 아티스트, 앨범 검색"
          value={query}
        />
        {isSearching ? <SearchLoadingPreview /> : null}
        {!isSearching && hasSearched && searchError ? (
          <p className="search-error-message">{searchError}</p>
        ) : null}
        {!isSearching && hasSearched && playError ? <p className="search-error-message">{playError}</p> : null}
        {!isSearching && hasSearched && results.length > 0 ? (
          <SearchResults
            onAddToQueue={handleAddToQueue}
            onPlay={handlePlay}
            playingSongId={player.track?.id ?? ""}
            songs={results}
          />
        ) : null}
        {!isSearching && hasSearched && !searchError && results.length === 0 ? (
          <SearchEmptyState query={submittedQuery} />
        ) : null}
      </section>
      <PlayerBar
        isPlaying={player.isPlaying}
        isShuffling={isShuffling}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onSeek={handleSeek}
        onShuffle={handleShuffle}
        onToggle={handleToggle}
        onVolumeChange={handleVolumeChange}
        progressMs={player.progressMs}
        track={player.track}
        updatedAt={player.updatedAt}
        volumePercent={player.volumePercent}
      />
    </main>
  );
}
