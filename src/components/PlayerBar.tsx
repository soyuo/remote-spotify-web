import { useEffect, useMemo, useState } from "react";
import { IconButton } from "./IconButton";

export type PlayerTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  duration: string;
  imageUrl: string | null;
};

type PlayerBarProps = {
  isPlaying?: boolean;
  isShuffling?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeek?: (positionMs: number) => void;
  onShuffle?: () => void;
  onToggle?: () => void;
  onVolumeChange?: (value: number) => void;
  progressMs?: number;
  track?: PlayerTrack | null;
  updatedAt?: number;
  volumePercent?: number;
};

function formatTime(durationMs: number) {
  const safeDuration = Math.max(durationMs, 0);
  const totalSeconds = Math.floor(safeDuration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AlbumPlaceholderIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="M4 7.5A3.5 3.5 0 0 1 7.5 4h9A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5v-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8.5 15.5 11 13l2 2 2.5-3 2 2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="M4 7h2.5c1.7 0 3 .8 4.3 2.5l2.4 3c1.3 1.7 2.6 2.5 4.3 2.5H20"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M17 12l3 3-3 3M4 17h2.5c1.4 0 2.4-.5 3.5-1.7M14.3 8.7c1-.9 2-1.7 3.2-1.7H20M17 4l3 3-3 3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PreviousIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M7 6v12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      <path d="m19 7-8 5 8 5V7Z" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M8.5 5.7v12.6L18 12 8.5 5.7Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M7.5 5.5h3v13h-3v-13ZM13.5 5.5h3v13h-3v-13Z" fill="currentColor" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="m5 7 8 5-8 5V7Z" fill="currentColor" />
      <path d="M17 6v12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        d="M17 2.8 20.2 6 17 9.2M4 11V9a3 3 0 0 1 3-3h13M7 21.2 3.8 18 7 14.8M20 13v2a3 3 0 0 1-3 3H4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 9.5v5h4l5 4v-13l-5 4H4Z" fill="currentColor" />
      <path
        d="M16 9a4.5 4.5 0 0 1 0 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function PlayerBar({
  isPlaying = false,
  isShuffling = false,
  onNext,
  onPrevious,
  onSeek,
  onShuffle,
  onToggle,
  onVolumeChange,
  progressMs = 0,
  track = null,
  updatedAt = Date.now(),
  volumePercent = 0,
}: PlayerBarProps) {
  const [now, setNow] = useState(Date.now());
  const [draftProgressMs, setDraftProgressMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isPlaying || !track || draftProgressMs !== null) {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [draftProgressMs, isPlaying, track]);

  useEffect(() => {
    setDraftProgressMs(null);
  }, [track?.id]);

  const currentProgressMs = useMemo(() => {
    if (!track) {
      return 0;
    }

    if (draftProgressMs !== null) {
      return draftProgressMs;
    }

    const elapsedMs = isPlaying ? Math.max(now - updatedAt, 0) : 0;
    return Math.min(progressMs + elapsedMs, track.durationMs);
  }, [draftProgressMs, isPlaying, now, progressMs, track, updatedAt]);

  const progressPercent = track?.durationMs ? Math.min((currentProgressMs / track.durationMs) * 100, 100) : 0;
  const title = track?.title ?? "재생 중이 아님";
  const artist = track?.artist ?? "No Artist";
  const currentTime = formatTime(currentProgressMs);
  const duration = track?.duration ?? "--:--";
  const safeVolume = Math.min(Math.max(Math.round(volumePercent), 1), 100);
  const maxProgressMs = track?.durationMs ?? 1;

  function commitSeek(value: number) {
    if (!track) {
      return;
    }

    const nextPositionMs = Math.min(Math.max(Math.round(value), 0), track.durationMs);
    setDraftProgressMs(null);
    onSeek?.(nextPositionMs);
  }

  return (
    <footer className={`player-bar ${isPlaying ? "is-playing" : ""}`} aria-label="재생 바">
      <div className="player-track-info">
        <div className="player-artwork" aria-hidden="true">
          {track?.imageUrl ? <img alt="" src={track.imageUrl} /> : <AlbumPlaceholderIcon />}
        </div>
        <div className="player-copy">
          <strong>{title}</strong>
          <span>{artist}</span>
        </div>
      </div>

      <div className="player-controls" aria-label="재생 컨트롤">
        <div className="player-buttons">
          <IconButton
            label="셔플"
            className={`player-control-button player-aux-button player-shuffle-button${isShuffling ? " is-loading" : ""}`}
            disabled={isShuffling}
            onClick={onShuffle}
          >
            <ShuffleIcon />
          </IconButton>
          <IconButton label="이전 곡" className="player-control-button player-previous-button" onClick={onPrevious}>
            <PreviousIcon />
          </IconButton>
          <IconButton label={isPlaying ? "일시정지" : "재생"} className="player-play-button" onClick={onToggle}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
          <IconButton label="다음 곡" className="player-control-button player-next-button" onClick={onNext}>
            <NextIcon />
          </IconButton>
          <IconButton label="반복" className="player-control-button player-aux-button" disabled>
            <RepeatIcon />
          </IconButton>
        </div>
        <div className="player-progress-row" aria-label="재생 시간">
          <span>{currentTime}</span>
          <label className="player-progress-control">
            <span className="sr-only">재생 위치</span>
            <input
              aria-label="재생 위치"
              disabled={!track}
              max={maxProgressMs}
              min="0"
              onChange={(event) => setDraftProgressMs(Number(event.currentTarget.value))}
              onKeyUp={(event) => commitSeek(Number(event.currentTarget.value))}
              onMouseUp={(event) => commitSeek(Number(event.currentTarget.value))}
              onTouchEnd={(event) => commitSeek(Number(event.currentTarget.value))}
              step="1000"
              style={{ backgroundSize: `${progressPercent}% 4px, 100% 4px` }}
              type="range"
              value={Math.round(currentProgressMs)}
            />
          </label>
          <span>{duration}</span>
        </div>
      </div>

      <div className="player-volume" aria-label="볼륨">
        <VolumeIcon />
        <label className="player-volume-control">
          <span className="sr-only">볼륨</span>
          <input
            aria-label="볼륨"
            max="100"
            min="1"
            onChange={(event) => onVolumeChange?.(Number(event.currentTarget.value))}
            style={{ backgroundSize: `${safeVolume}% 4px, 100% 4px` }}
            type="range"
            value={safeVolume}
          />
        </label>
      </div>
    </footer>
  );
}
