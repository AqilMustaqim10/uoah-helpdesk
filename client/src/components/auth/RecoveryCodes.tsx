// Shows the 10 recovery codes ONCE, with copy and download buttons.
// The person must tick "I saved these codes" before they can continue.
import { useState } from "react";
import { Copy, Download } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { saveBlob } from "../../lib/download";
import Button from "../ui/Button";

interface Props {
  codes: string[];
  doneLabel: string;
  onDone: () => void;
}

export default function RecoveryCodes({ codes, doneLabel, onDone }: Props) {
  const toast = useToast();
  const [saved, setSaved] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Recovery codes copied");
    } catch {
      toast.error(
        "Could not copy. Please select the codes and copy them by hand.",
      );
    }
  }

  function download() {
    const text = [
      "UOA IT Helpdesk: recovery codes",
      "Each code can be used once, instead of the code from your authenticator app.",
      "Keep this file somewhere safe and private.",
      "",
      ...codes,
      "",
    ].join("\r\n");
    saveBlob(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      "helpdesk-recovery-codes.txt",
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        If you lose your phone, each of these codes lets you sign in{" "}
        <strong>once</strong>. They are shown only now, so save them somewhere
        safe (a password manager, or print them).
      </p>

      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm tracking-wider text-slate-900">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Copy className="h-4 w-4" />}
          onClick={() => void copy()}
        >
          Copy
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Download className="h-4 w-4" />}
          onClick={download}
        >
          Download
        </Button>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        I have saved these codes in a safe place.
      </label>

      <Button className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
