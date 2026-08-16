type TaskMeetingFabProps = {
  disabled: boolean;
  label: string;
  onClick: () => void;
};

export default function TaskMeetingFab({ disabled, label, onClick }: TaskMeetingFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="fixed bottom-6 right-6 z-20 mb-[env(safe-area-inset-bottom)] mr-[env(safe-area-inset-right)] inline-flex max-w-[calc(100vw-3rem)] items-center gap-2 rounded-full bg-button-primary px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-button-hover disabled:opacity-50 max-[1024px]:bottom-20"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 18.75a6.75 6.75 0 0 0 6.75-6.75v-1.5m-6.75 7.5a6.75 6.75 0 0 1-6.75-6.75v-1.5m6.75 7.5v3.75m-3.75-3.75h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3Z"
        />
      </svg>
      {label}
    </button>
  );
}
