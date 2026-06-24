import { IconButton } from "./IconButton";
import { LoadingSpinner } from "./LoadingSpinner";
import { SearchIcon } from "./SearchIcon";

type SearchInputProps = {
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  value: string;
};

export function SearchInput({ isLoading, onChange, onSubmit, placeholder, value }: SearchInputProps) {
  return (
    <form
      className="search-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      role="search"
    >
      <input
        aria-label="노래 검색"
        className="search-input"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <IconButton label="검색" className="search-submit" type="submit">
        {isLoading ? <LoadingSpinner className="button-spinner" /> : <SearchIcon />}
      </IconButton>
    </form>
  );
}
