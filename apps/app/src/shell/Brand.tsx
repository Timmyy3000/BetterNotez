/** The ribbon bookmark. It is the only mark the app uses, the app icon included. */
export function RibbonMark({ className }: { readonly className?: string }) {
  return (
    <svg width="15" height="21" viewBox="0 0 15 21" aria-hidden="true" className={className}>
      <path d="M0 0h15v21l-7.5-5.2L0 21z" fill="currentColor" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="font-serif text-[27px] leading-none whitespace-nowrap text-foreground">
      Better<em>Notez</em>
    </span>
  );
}
