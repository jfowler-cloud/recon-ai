"""Leadership chat agent tools — operations overview, workload, activities."""

import time

from strands import tool

from shared.config import AppConfig
from shared.db import scan_table

_config = AppConfig()


@tool
def get_operations_overview(days: int = 30) -> dict:
    """Get a high-level operations overview aggregating tickets across all types.

    Args:
        days: Number of days to look back (default 30).

    Returns:
        Dictionary with aggregated operational metrics.
    """
    tickets = scan_table(_config.tickets_table)

    by_status: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    total = 0

    for ticket in tickets:
        total += 1
        status = ticket.get("status", "unknown")
        by_status[status] = by_status.get(status, 0) + 1

        t_type = ticket.get("ticketType", "unknown")
        by_type[t_type] = by_type.get(t_type, 0) + 1

        sev = ticket.get("severity", "unknown")
        by_severity[sev] = by_severity.get(sev, 0) + 1

    # Count open vs closed
    open_statuses = {"new", "triaging", "investigating", "active"}
    open_count = sum(by_status.get(s, 0) for s in open_statuses)
    closed_count = sum(by_status.get(s, 0) for s in {"completed", "closed"})

    return {
        "total": total,
        "open": open_count,
        "closed": closed_count,
        "byStatus": by_status,
        "byType": by_type,
        "bySeverity": by_severity,
    }


@tool
def get_analyst_workload() -> dict:
    """Get ticket distribution by assignee to understand analyst workload.

    Returns:
        Dictionary with workload per analyst.
    """
    tickets = scan_table(_config.tickets_table)

    by_assignee: dict[str, dict] = {}

    for ticket in tickets:
        assignee = ticket.get("assignee", "unassigned")
        if assignee not in by_assignee:
            by_assignee[assignee] = {"total": 0, "open": 0, "closed": 0, "byType": {}}

        by_assignee[assignee]["total"] += 1

        status = ticket.get("status", "unknown")
        if status in {"new", "triaging", "investigating", "active"}:
            by_assignee[assignee]["open"] += 1
        else:
            by_assignee[assignee]["closed"] += 1

        t_type = ticket.get("ticketType", "unknown")
        by_assignee[assignee]["byType"][t_type] = by_assignee[assignee]["byType"].get(t_type, 0) + 1

    workload = []
    for assignee, data in by_assignee.items():
        workload.append({"assignee": assignee, **data})

    workload.sort(key=lambda w: w["open"], reverse=True)
    return {"workload": workload, "totalAnalysts": len(workload)}


@tool
def get_recent_activities(days: int = 7, limit: int = 20) -> dict:
    """Get recent activities across the platform (tickets, targets, tool actions).

    Args:
        days: Number of days to look back (default 7).
        limit: Maximum number of activities to return (default 20).

    Returns:
        Dictionary with recent activities sorted by time.
    """
    cutoff = int(time.time()) - (days * 86400)
    activities = []

    # Recent tickets
    tickets = scan_table(_config.tickets_table)
    for t in tickets:
        created = t.get("createdAt", 0)
        if isinstance(created, str):
            try:
                created = int(created)
            except ValueError:
                continue
        if created >= cutoff:
            activities.append({
                "type": "ticket",
                "id": t.get("ticketId"),
                "title": t.get("title", ""),
                "status": t.get("status", ""),
                "severity": t.get("severity", ""),
                "createdAt": created,
            })

    # Recent targets
    targets = scan_table(_config.targets_table)
    for t in targets:
        created = t.get("createdAt", 0)
        if isinstance(created, str):
            try:
                created = int(created)
            except ValueError:
                continue
        if created >= cutoff:
            activities.append({
                "type": "target",
                "id": t.get("targetId"),
                "title": t.get("name", ""),
                "status": t.get("status", ""),
                "priorityScore": float(t.get("priorityScore", 0)),
                "createdAt": created,
            })

    # Recent tool actions
    actions = scan_table(_config.tool_actions_table)
    for a in actions:
        created = a.get("createdAt", 0)
        if isinstance(created, str):
            try:
                created = int(created)
            except ValueError:
                continue
        if created >= cutoff:
            activities.append({
                "type": "tool_action",
                "id": a.get("actionId"),
                "title": f"{a.get('toolName', 'unknown')} on {a.get('ticketId', 'N/A')}",
                "status": a.get("status", ""),
                "createdAt": created,
            })

    activities.sort(key=lambda a: a.get("createdAt", 0), reverse=True)
    return {"activities": activities[:limit], "total": len(activities), "days": days}
