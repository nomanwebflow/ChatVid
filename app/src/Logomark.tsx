export function Logomark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-label="ChatVid"
      className={`shrink-0 ${className}`}
      style={{ display: "block" }}
    >
      <rect width="48" height="48" rx="12" fill="#7f56d9" />
      <path
        d="M14 17.5A3.5 3.5 0 0 1 17.5 14h13a3.5 3.5 0 0 1 3.5 3.5v8a3.5 3.5 0 0 1-3.5 3.5H24l-6 5v-5h-.5A3.5 3.5 0 0 1 14 25.5z"
        fill="#ffffff"
      />
      <path d="M21 17.8v6.4l5.4-3.2z" fill="#7f56d9" />
    </svg>
  );
}
