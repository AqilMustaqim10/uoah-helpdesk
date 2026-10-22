// Temporary page for tabs we have not built yet. Replaced by real pages in later steps.
import type { LucideIcon } from "lucide-react";
import EmptyState from "../components/ui/EmptyState";

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
}

export default function PlaceholderPage({ title, description, icon }: Props) {
  return (
    <EmptyState
      icon={icon}
      title={`${title}: coming soon`}
      description={description}
    />
  );
}
