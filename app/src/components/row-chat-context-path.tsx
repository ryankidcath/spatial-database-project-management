/** Breadcrumb konteks baris virtual table (abu-abu › hitam pada segmen terakhir). */

type Props = {
  segments: string[];
  className?: string;
};

export function RowChatContextPath({ segments, className = "" }: Props) {
  if (segments.length === 0) {
    return (
      <span className={`text-sm text-muted-foreground ${className}`.trim()}>
        Baris
      </span>
    );
  }

  const last = segments.length - 1;

  return (
    <p className={`text-sm leading-snug ${className}`.trim()}>
      {segments.map((label, i) => (
        <span key={`${i}-${label}`}>
          {i > 0 ? (
            <span className="text-muted-foreground" aria-hidden>
              {" "}
              ›{" "}
            </span>
          ) : null}
          <span
            className={
              i === last
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {label}
          </span>
        </span>
      ))}
    </p>
  );
}
