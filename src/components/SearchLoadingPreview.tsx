import { LoadingSpinner } from "./LoadingSpinner";

const skeletonItems = [
  { titleWidth: "48%", artistWidth: "32%" },
  { titleWidth: "40%", artistWidth: "28%" },
  { titleWidth: "44%", artistWidth: "30%" },
  { titleWidth: "38%", artistWidth: "26%" },
];

export function SearchLoadingPreview() {
  return (
    <div className="search-loading-preview" aria-live="polite" aria-label="검색 중">
      <div className="loading-status">
        <LoadingSpinner className="status-spinner" />
        <span>검색 중...</span>
      </div>
      <div className="skeleton-grid">
        {skeletonItems.map((item, index) => (
          <div className="skeleton-card" key={index}>
            <div className="skeleton-artwork" />
            <div className="skeleton-lines">
              <span className="skeleton-line skeleton-title" style={{ width: item.titleWidth }} />
              <span className="skeleton-line skeleton-artist" style={{ width: item.artistWidth }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
