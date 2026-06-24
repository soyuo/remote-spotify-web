type SearchEmptyStateProps = {
  query: string;
};

function EmptySearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" focusable="false">
      <path
        d="m31.5 31.5 7 7M36 21.5C36 29.5 29.5 36 21.5 36S7 29.5 7 21.5 13.5 7 21.5 7 36 13.5 36 21.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.4"
      />
      <path
        d="M17.5 17.5 25.5 25.5M25.5 17.5 17.5 25.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function SearchEmptyState({ query }: SearchEmptyStateProps) {
  return (
    <div className="search-empty-state" aria-live="polite">
      <div className="empty-state-icon">
        <EmptySearchIcon />
      </div>
      <h2>검색 결과가 없어요</h2>
      <p>
        <span>{`'${query}'와 일치하는 곡이 없습니다.`}</span>
        <span>다른 키워드로 검색해 보세요.</span>
      </p>
    </div>
  );
}
