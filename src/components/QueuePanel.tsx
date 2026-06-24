import { useRef, type MouseEvent } from "react";
import type { Song } from "./SearchResults";

export type QueueItem = Song & {
  queueId: string;
};

type QueuePanelProps = {
  isOpen: boolean;
  items: QueueItem[];
  onClose: () => void;
  onPlay: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
};

function QueueArtwork({ item }: { item: QueueItem }) {
  return (
    <span className="queue-artwork" aria-hidden="true">
      {item.imageUrl ? <img alt="" src={item.imageUrl} /> : null}
    </span>
  );
}

function QueueItemButton({
  index,
  item,
  onPlay,
  onRemove,
}: {
  index: number;
  item: QueueItem;
  onPlay: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
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
      onRemove(item);
      return;
    }

    clickTimerRef.current = window.setTimeout(() => {
      onPlay(item);
      clickTimerRef.current = null;
    }, 260);
  }

  function handleDoubleClick() {
    clearClickTimer();
    onRemove(item);
  }

  return (
    <button className="queue-item" onClick={handleClick} onDoubleClick={handleDoubleClick} type="button">
      <span className="queue-index">{String(index + 1).padStart(2, "0")}</span>
      <QueueArtwork item={item} />
      <span className="queue-meta">
        <strong>{item.title}</strong>
        <span>{item.artist}</span>
      </span>
      <span className="queue-duration">{item.duration}</span>
    </button>
  );
}

export function QueuePanel({ isOpen, items, onClose, onPlay, onRemove }: QueuePanelProps) {
  return (
    <aside className={`queue-panel${isOpen ? " is-open" : ""}`} aria-label="재생 목록">
      <div className="queue-panel-header">
        <h2>재생 목록</h2>
        <span>{items.length}곡</span>
        <button aria-label="재생 목록 닫기" className="queue-close-button" onClick={onClose} type="button">
          ×
        </button>
      </div>
      <div className="queue-list">
        {items.map((item, index) => (
          <QueueItemButton
            index={index}
            item={item}
            key={item.queueId}
            onPlay={onPlay}
            onRemove={onRemove}
          />
        ))}
      </div>
    </aside>
  );
}
