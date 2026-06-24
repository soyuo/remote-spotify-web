type LoadingSpinnerProps = {
  className?: string;
};

export function LoadingSpinner({ className = "" }: LoadingSpinnerProps) {
  return <span aria-hidden="true" className={`loading-spinner ${className}`} />;
}
