import TodoRowCheck from "./TodoRowCheck";

type InboxSelectCheckProps = {
  selected: boolean;
  label: string;
  onSelect: () => void;
};

/** Leading select check — same circle as Tasks. */
export default function InboxSelectCheck({ selected, label, onSelect }: InboxSelectCheckProps) {
  return (
    <TodoRowCheck checked={selected} label={label} onClick={onSelect} pressed={selected} />
  );
}
