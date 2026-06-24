import { useRef, type MouseEvent } from "react";

export type Song = {
  id: string;
  playId: string;
  uri: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  duration: string;
  imageUrl: string | null;
};

type SearchResultsProps = {
  onAddToQueue: (song: Song) => void;
  onPlay: (song: Song) => void;
  playingSongId: string;
  songs: Song[];
};

function SongIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="M9 17.5V7.25L18 5v9.35"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <circle cx="7" cy="17.5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="16" cy="14.35" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

function SongResultCard({
  index,
  isPlaying,
  onAddToQueue,
  onPlay,
  song,
}: {
  index: number;
  isPlaying: boolean;
  onAddToQueue: (song: Song) => void;
  onPlay: (song: Song) => void;
  song: Song;
}) {
  const clickTimerRef = useRef<number | null>(null);

  function clearClickTimer() {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    clearClickTimer();

    if (event.detail > 1) {
      onPlay(song);
      return;
    }

    clickTimerRef.current = window.setTimeout(() => {
      onAddToQueue(song);
      clickTimerRef.current = null;
    }, 260);
  }

  function handleDoubleClick() {
    clearClickTimer();
    onPlay(song);
  }

  return (
    <button
      aria-label={`${song.title} 재생 또는 목록 추가`}
      className={`song-result-card${isPlaying ? " is-selected" : ""}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      type="button"
    >
      <span className="song-index">{String(index + 1).padStart(2, "0")}</span>
      <span className="song-artwork" aria-hidden="true">
        {song.imageUrl ? <img alt="" src={song.imageUrl} /> : <SongIcon />}
      </span>
      <span className="song-meta">
        <strong>{song.title}</strong>
        <span>{song.artist}</span>
        <span>{song.album}</span>
      </span>
      <span className="song-duration">{song.duration}</span>
    </button>
  );
}

export function SearchResults({ onAddToQueue, onPlay, playingSongId, songs }: SearchResultsProps) {
  return (
    <div className="search-results" aria-live="polite">
      <div className="search-results-header">
        <h2>검색 결과</h2>
        <span>{songs.length}곡</span>
      </div>
      <div className="song-results-grid">
        {songs.map((song, index) => (
          <SongResultCard
            index={index}
            isPlaying={playingSongId === song.id}
            key={song.id}
            onAddToQueue={onAddToQueue}
            onPlay={onPlay}
            song={song}
          />
        ))}
      </div>
    </div>
  );
}
