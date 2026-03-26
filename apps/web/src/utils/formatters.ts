/** Display formatting utilities for Recon AI. */

/** Map severity level to Cloudscape StatusIndicator type. */
export function severityColor(severity: string): 'error' | 'warning' | 'info' | 'success' {
  switch (severity.toLowerCase()) {
    case 'critical': return 'error'
    case 'high': return 'warning'
    case 'medium': return 'info'
    case 'low': return 'success'
    default: return 'info'
  }
}

/** Map ticket status to Cloudscape badge color. */
export function statusColor(status: string): 'blue' | 'green' | 'red' | 'grey' {
  switch (status.toLowerCase()) {
    case 'new': return 'blue'
    case 'triaging': return 'blue'
    case 'investigating': return 'blue'
    case 'active': return 'green'
    case 'completed': return 'green'
    case 'closed': return 'grey'
    default: return 'grey'
  }
}

/** Format a Unix timestamp (ms) as a relative time string. */
export function relativeTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`

  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`
}

/** Truncate text to maxLen characters with ellipsis. */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '\u2026'
}

/** Map importance level to a display label. */
export function importanceLabel(importance: string): string {
  switch (importance.toLowerCase()) {
    case 'critical': return 'Critical'
    case 'high': return 'High Priority'
    case 'medium': return 'Medium Priority'
    case 'low': return 'Low Priority'
    default: return importance
  }
}
