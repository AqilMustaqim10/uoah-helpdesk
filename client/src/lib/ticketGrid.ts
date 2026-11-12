// Column layout of the ticket table (large screens). The header row, every ticket row and the
// loading skeleton all use this one string, so their columns always line up.
// Columns: ID | Subject | [Unit, admins only] | Priority | Status | Assignee | Created
export const TICKET_GRID_STAFF_ADMIN =
  "lg:grid-cols-[5.5rem_minmax(0,1fr)_4rem_6rem_7.5rem_5rem_6.5rem]";
export const TICKET_GRID =
  "lg:grid-cols-[5.5rem_minmax(0,1fr)_6rem_7.5rem_5rem_6.5rem]";

export const ticketGridFor = (showUnit: boolean) =>
  showUnit ? TICKET_GRID_STAFF_ADMIN : TICKET_GRID;
