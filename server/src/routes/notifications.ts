import { Router } from "express";
import { query } from "../db/pool";
import { SLA_TARGET_HOURS } from "../config/constants";
import { ah } from "../lib/http";

const router = Router();

const SLA_DEADLINE_SQL = `COALESCE(t.due_at, t.created_at + (CASE t.priority ${Object.entries(
  SLA_TARGET_HOURS,
)
  .map(([priority, hours]) => `WHEN '${priority}' THEN interval '${hours} hours'`)
  .join(" ")} END))`;

router.get(
  "/",
  ah(async (req, res) => {
    const user = req.user!;
    const notifications = [];

    if (user.role === "USER") {
      const result = await query(
        `SELECT 'audit-' || a.id AS id, a.ticket_id AS "ticketId",
                t.title,
                CASE a.action
                  WHEN 'TICKET_STATUS_CHANGED' THEN
                    'Status changed from ' || COALESCE(a.details->>'from', 'unknown')
                    || ' to ' || COALESCE(a.details->>'to', 'unknown') || '.'
                  ELSE 'A support agent replied to your ticket.'
                END AS message,
                'TICKET_REPLY' AS type, a.created_at AS "createdAt"
           FROM audit_log a
           JOIN tickets t ON t.id = a.ticket_id
           LEFT JOIN comments c
             ON a.action = 'COMMENT_ADDED'
            AND a.entity_id ~ '^[0-9]+$'
            AND c.id = a.entity_id::bigint
           LEFT JOIN users author ON author.id = c.author_id
          WHERE a.created_at > now() - interval '14 days'
            AND t.created_by = $1
            AND (
              (a.action = 'TICKET_STATUS_CHANGED' AND a.actor_id <> $1)
              OR (a.action = 'COMMENT_ADDED'
                  AND a.details->>'internal' = 'false'
                  AND c.author_id <> $1
                  AND author.role IN ('IT', 'ADMIN'))
            )
          ORDER BY a.created_at DESC
          LIMIT 50`,
        [user.id],
      );
      notifications.push(...result.rows);
    } else if (user.role === "IT") {
      const result = await query(
        `SELECT 'audit-' || a.id AS id, a.ticket_id AS "ticketId",
                t.title,
                CASE a.action
                  WHEN 'TICKET_ASSIGNED' THEN 'This ticket was assigned to you.'
                  WHEN 'TICKET_CREATED' THEN 'A new ticket is waiting for assignment.'
                  ELSE 'The requester replied to your assigned ticket.'
                END AS message,
                CASE a.action
                  WHEN 'TICKET_ASSIGNED' THEN 'ASSIGNED'
                  WHEN 'TICKET_CREATED' THEN 'NEW_TICKET'
                  ELSE 'TICKET_REPLY'
                END AS type, a.created_at AS "createdAt"
           FROM audit_log a
           JOIN tickets t ON t.id = a.ticket_id
           LEFT JOIN comments c
             ON a.action = 'COMMENT_ADDED'
            AND a.entity_id ~ '^[0-9]+$'
            AND c.id = a.entity_id::bigint
           LEFT JOIN users author ON author.id = c.author_id
          WHERE a.created_at > now() - interval '14 days'
            AND t.business_unit_id = $2
            AND (
              (a.action = 'TICKET_ASSIGNED' AND a.details->>'to_id' = $1::text)
              OR (a.action = 'TICKET_CREATED' AND t.assigned_to IS NULL)
              OR (a.action = 'COMMENT_ADDED'
                  AND a.details->>'internal' = 'false'
                  AND t.assigned_to = $1
                  AND author.role = 'USER')
            )
          ORDER BY a.created_at DESC
          LIMIT 50`,
        [user.id, user.business_unit_id],
      );
      notifications.push(...result.rows);
    } else if (user.role === "ADMIN") {
      const result = await query(
        `SELECT 'audit-' || a.id AS id, a.ticket_id AS "ticketId",
                t.title, 'A high-priority ticket was created.' AS message,
                'NEW_TICKET' AS type, a.created_at AS "createdAt"
           FROM audit_log a
           JOIN tickets t ON t.id = a.ticket_id
          WHERE a.created_at > now() - interval '14 days'
            AND a.action = 'TICKET_CREATED'
            AND a.details->>'priority' IN ('HIGH', 'URGENT')
          ORDER BY a.created_at DESC
          LIMIT 50`,
      );
      notifications.push(...result.rows);
    }

    if (user.role === "IT" || user.role === "ADMIN") {
      const slaResult = await query(
        `SELECT 'sla-' || t.id || '-' || extract(epoch FROM ${SLA_DEADLINE_SQL})::bigint AS id,
                t.id AS "ticketId", t.title,
                CASE WHEN ${SLA_DEADLINE_SQL} <= now()
                  THEN 'The SLA deadline has passed.'
                  ELSE 'The SLA deadline is within one hour.'
                END AS message,
                'SLA_WARNING' AS type,
                now() AS "createdAt"
           FROM tickets t
          WHERE t.status IN ('OPEN', 'IN_PROGRESS')
            AND ((${user.role === "IT" ? "t.business_unit_id = $1" : "TRUE"}))
            AND (${user.role === "IT" ? "t.assigned_to = $2" : "TRUE"})
            AND (
              ${user.role === "IT"
                ? `${SLA_DEADLINE_SQL} > now() AND ${SLA_DEADLINE_SQL} <= now() + interval '1 hour'`
                : `${SLA_DEADLINE_SQL} <= now()`}
            )
          ORDER BY ${SLA_DEADLINE_SQL} ASC
          LIMIT 50`,
        user.role === "IT" ? [user.business_unit_id, user.id] : [],
      );
      notifications.push(...slaResult.rows);
    }

    notifications.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    res.json({
      notifications: notifications.slice(0, 50).map((notification) => ({
        ...notification,
        userId: user.id,
        isRead: false,
        createdAt: new Date(notification.createdAt).toISOString(),
      })),
    });
  }),
);

export default router;
