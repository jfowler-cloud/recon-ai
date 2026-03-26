"""OSINT chat agent tools — vulnerability and ticket summaries."""

import time

from boto3.dynamodb.conditions import Key
from strands import tool

from shared.config import AppConfig
from shared.db import get_dynamodb, scan_table

_config = AppConfig()


@tool
def get_vulnerability_summary(severity: str | None = None, source_type: str | None = None, days: int = 30) -> dict:
    """Get a summary of vulnerabilities from ingested documents.

    Args:
        severity: Optional filter by importance level — "high", "medium", "standard".
        source_type: Optional filter by source type (e.g., "shodan_json", "nmap_xml").
        days: Number of days to look back (default 30).

    Returns:
        Dictionary with vulnerability counts and breakdown.
    """
    cutoff = int(time.time()) - (days * 86400)

    # Scan documents table for vulnerability-related entries
    kwargs = {}
    if source_type:
        kwargs["FilterExpression"] = Key("sourceType").eq(source_type)

    docs = scan_table(_config.documents_table, **kwargs)

    by_importance: dict[str, int] = {}
    by_source_type: dict[str, int] = {}
    recent_docs = []

    for doc in docs:
        created = doc.get("createdAt", 0)
        if isinstance(created, str):
            try:
                created = int(created)
            except ValueError:
                created = 0
        importance = doc.get("importance", "standard")

        # Apply time filter
        if created < cutoff:
            continue

        if severity and importance != severity:
            continue

        by_importance[importance] = by_importance.get(importance, 0) + 1
        st = doc.get("sourceType", "unknown")
        by_source_type[st] = by_source_type.get(st, 0) + 1

        # Collect recent docs with vulnerability-related content
        text = doc.get("text", "").lower()
        vuln_keywords = ["vulnerability", "cve", "exploit", "exposure", "risk", "threat", "port", "open"]
        if any(kw in text for kw in vuln_keywords):
            recent_docs.append({
                "documentId": doc.get("documentId"),
                "uploadId": doc.get("uploadId"),
                "sourceType": st,
                "importance": importance,
                "textPreview": doc.get("text", "")[:200],
            })

    return {
        "total": len(docs),
        "byImportance": by_importance,
        "bySourceType": by_source_type,
        "vulnerabilityDocuments": recent_docs[:20],
        "days": days,
    }


@tool
def get_ticket_summary(status: str | None = None, ticket_type: str = "osint", days: int = 30) -> dict:
    """Get a summary of OSINT investigation tickets.

    Args:
        status: Optional filter by ticket status (new, triaging, investigating, active, completed, closed).
        ticket_type: Ticket type filter (default "osint").
        days: Number of days to look back (default 30).

    Returns:
        Dictionary with ticket counts and breakdown.
    """
    cutoff = int(time.time()) - (days * 86400)
    tickets = scan_table(_config.tickets_table)

    by_status: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    filtered = []

    for ticket in tickets:
        t_type = ticket.get("ticketType", "")
        if ticket_type and t_type != ticket_type:
            continue
        if status and ticket.get("status") != status:
            continue

        # Apply time filter
        created = ticket.get("createdAt", 0)
        if isinstance(created, str):
            try:
                created = int(created)
            except ValueError:
                created = 0
        if created < cutoff:
            continue

        t_status = ticket.get("status", "unknown")
        by_status[t_status] = by_status.get(t_status, 0) + 1

        sev = ticket.get("severity", "unknown")
        by_severity[sev] = by_severity.get(sev, 0) + 1

        filtered.append({
            "ticketId": ticket.get("ticketId"),
            "title": ticket.get("title", ""),
            "status": t_status,
            "severity": sev,
            "assignee": ticket.get("assignee", ""),
        })

    return {
        "total": len(filtered),
        "byStatus": by_status,
        "bySeverity": by_severity,
        "tickets": filtered[:20],
    }
