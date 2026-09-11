type TodoRowCheckProps = {
  checked: boolean;
  label: string;
  onClick: () => void;
  pressed?: boolean;
};

const IDLE = "border-border hover:border-accent";
const ON = "border-accent bg-button-primary text-white";

/** Shared To Do leading check — circle, same on Tasks, Needs you, and mail. */
export default function TodoRowCheck({ checked, label, onClick, pressed }: TodoRowCheckProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        checked ? ON : IDLE
      }`}
    >
      {checked ? (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </button>
  );
}
