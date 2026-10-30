import { useEffect, useState } from "react";
import { describeAudit } from "../../lib/auditText";
import { formatDateTime } from "../../lib/format";
import { auditApi, type AuditTicketDetailsResponse } from "../../api/audit";
import { ApiError } from "../../api/client";
import type { AuditTicketSummary } from "../../api/audit";
import Avatar from "../ui/Avatar";
import FormError from "../ui/FormError";
import Modal from "../ui/Modal";
import Skeleton from "../ui/Skeleton";

interface Props {
  ticket: AuditTicketSummary;
  onClose: () => void;
}

export default function AuditTicketDetailModal({ ticket, onClose }: Props) {
  const [data, setData] = useState<AuditTicketDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    auditApi
      .details(ticket.ticket_id)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load this ticket's audit history.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ticket.ticket_id]);

  return (
    <Modal
      label={`Audit history for ticket HD-${ticket.ticket_id}`}
      onClose={onClose}
      size="wide"
    >
      <div className="border-b border-slate-200 px-6 py-5 pr-14">
        <p className="font-mono text-xs font-medium text-brand">
          HD-{ticket.ticket_id}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {ticket.title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {ticket.business_unit_code === "HOTEL"
            ? "Hotel"
            : ticket.business_unit_name}{" "}
          · Complete change history
        </p>
      </div>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-6">
        <FormError message={error} />
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : data && data.rows.length > 0 ? (
          <ol className="space-y-5">
            {data.rows.map((event) => {
              const actor = event.actor_name ?? "System";
              return (
                <li key={event.id} className="flex gap-3">
                  <Avatar name={actor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-slate-700">
                      <span
                        className="font-medium text-slate-900"
                        title={event.actor_email ?? undefined}
                      >
                        {actor}
                      </span>{" "}
                      {describeAudit(event.action, event.details ?? {})}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <time dateTime={event.created_at}>
                        {formatDateTime(event.created_at)}
                      </time>
                      <span>{event.entity_type}</span>
                      <details className="text-slate-500">
                        <summary className="cursor-pointer hover:text-slate-700">
                          Recorded values
                        </summary>
                        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                          {JSON.stringify(
                            {
                              action: event.action,
                              entity: `${event.entity_type} ${event.entity_id}`,
                              details: event.details,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : !error ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No audit history is available for this ticket.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
