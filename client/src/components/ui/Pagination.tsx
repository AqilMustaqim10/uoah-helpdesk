// "Showing 1-25 of 60" with Previous / Next buttons. Shows nothing when everything fits on one page.
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./Button";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onPage }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      className="flex items-center justify-between gap-3 pt-4"
      aria-label="Pagination"
    >
      <p className="text-sm text-slate-500">
        {from}-{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronLeft className="h-4 w-4" />}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-slate-500">
          {page} / {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
