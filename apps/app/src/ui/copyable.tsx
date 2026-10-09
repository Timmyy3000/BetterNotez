import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { IconButton } from "./tooltip";

export function Copyable({ label, value }: { readonly label: string; readonly value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      toast.success(`${label} copied`);
    } catch {
      toast.error("The text could not be copied. Select it and copy it by hand.");
    }
  }

  return (
    <div className="relative mt-3">
      <pre className="grain rounded-lg border border-border bg-surface p-4 pr-14 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap">
        <code>{value}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <IconButton label={`Copy ${label}`} onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
        </IconButton>
      </div>
    </div>
  );
}
