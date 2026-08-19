type InboxSelectCheckProps = {
  selected: boolean;
  label: string;
  onSelect: () => void;
};

/** Leading checkbox — sibling of the card fill, same row as Pending and Tasks. */
export default function InboxSelectCheck({ selected, label, onSelect }: InboxSelectCheckProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={selected}
      className={`m-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border-2 transition-colors ${
        selected ? "border-accent bg-button-primary text-white" : "border-border hover:border-accent"
      }`}
    >
      {selected ? (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </button>
  );
}
