interface ExternalSourceAccountLineProps {
  email?: string | null;
  unknown?: boolean;
  unknownLabel?: string;
}

/** Connected mailbox (or honest miss) under an External sources title. */
export default function ExternalSourceAccountLine({
  email,
  unknown = false,
  unknownLabel,
}: ExternalSourceAccountLineProps) {
  const address = (email || "").trim();
  if (address) {
    return (
      <p className="truncate text-2xs leading-snug text-muted" title={address}>
        {address}
      </p>
    );
  }
  if (unknown && unknownLabel) {
    return <p className="text-2xs leading-snug text-muted">{unknownLabel}</p>;
  }
  return null;
}
