// The bar across the top: page title, Create Ticket, dark mode, who you are, logout.
import { LogOut, Menu, Plus } from "lucide-react";
import type { User } from "../../types";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import RoleBadge from "../ui/RoleBadge";
import ThemeToggle from "../ui/ThemeToggle";

interface Props {
  title: string;
  user: User;
  onOpenMenu: () => void;
  onCreateTicket: () => void;
  onLogout: () => void;
}

export default function TopBar({
  title,
  user,
  onOpenMenu,
  onCreateTicket,
  onLogout,
}: Props) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      {/* Menu button only appears on phones */}
      <IconButton label="Open menu" className="md:hidden" onClick={onOpenMenu}>
        <Menu className="h-5 w-5" />
      </IconButton>

      <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={onCreateTicket}
        >
          <span className="sr-only sm:not-sr-only">Create Ticket</span>
        </Button>

        <ThemeToggle />

        <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3">
          <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-700 sm:block">
            {user.name}
          </span>
          <RoleBadge role={user.role} />
          <IconButton label="Sign out" onClick={onLogout}>
            <LogOut className="h-5 w-5" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
