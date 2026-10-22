// Pictures and PDFs on an article. Anyone who can see the article can open them;
// only people who may edit it can add or remove files (the server checks this again).
import { useState } from "react";
import { ApiError } from "../../api/client";
import { kbApi } from "../../api/kb";
import { useToast } from "../../hooks/useToast";
import { pickValidFiles, summarizeProblems } from "../../lib/files";
import type { ArticleDetailResponse, ArticleFile } from "../../types";
import AttachmentGrid from "../ui/AttachmentGrid";
import FileDropzone from "../ui/FileDropzone";

interface Props {
  articleId: number;
  files: ArticleFile[];
  canEdit: boolean;
  onUpdated: (result: ArticleDetailResponse, message: string) => void;
}

export default function ArticleAttachments({
  articleId,
  files,
  canEdit,
  onUpdated,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Nothing to show and nothing to add
  if (files.length === 0 && !canEdit) return null;

  async function add(chosen: File[]) {
    const { accepted, problems } = pickValidFiles(chosen, files.length);
    if (problems.length > 0) toast.error(summarizeProblems(problems));
    if (accepted.length === 0) return;

    setBusy(true);
    try {
      const result = await kbApi.uploadFiles(articleId, accepted);
      onUpdated(
        result,
        accepted.length === 1
          ? "File attached"
          : `${accepted.length} files attached`,
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not upload. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: ArticleFile) {
    try {
      onUpdated(await kbApi.deleteFile(file.id), "File removed");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not remove the file.",
      );
    }
  }

  return (
    <section aria-label="Attachments" className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">
        Attachments{" "}
        {files.length > 0 && (
          <span className="font-normal text-slate-400">({files.length})</span>
        )}
      </h3>
      <AttachmentGrid
        files={files}
        canDelete={() => canEdit}
        onDelete={remove}
        hrefBase="/api/kb/files"
      />
      {canEdit && (
        <FileDropzone
          onFiles={(f) => void add(f)}
          busy={busy}
          compact={files.length > 0}
        />
      )}
    </section>
  );
}
