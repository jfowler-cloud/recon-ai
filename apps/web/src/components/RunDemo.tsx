import { useState } from 'react'
import Modal from '@cloudscape-design/components/modal'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import SpaceBetween from '@cloudscape-design/components/space-between'
import StatusIndicator from '@cloudscape-design/components/status-indicator'
import { createTicket, createTarget, updateContext, manageTools } from '@/utils/api'

interface Props {
  visible: boolean
  onDismiss: () => void
  userId: string
}

type StepStatus = 'pending' | 'running' | 'success' | 'error'

interface Step {
  label: string
  status: StepStatus
  detail?: string
}

const DEMO_TARGETS = [
  { goal: 'Compromise the internal wiki server to demonstrate lateral movement risk from the DMZ', category: 'infrastructure' },
  { goal: 'Exploit the exposed MongoDB instance on port 27017 to extract employee PII', category: 'application' },
  { goal: 'Chain ProxyLogon CVEs against the Exchange server for full mailbox access', category: 'application' },
  { goal: 'Test FortiOS VPN pre-auth RCE (CVE-2024-21762) for remote code execution', category: 'network' },
  { goal: 'Attempt anonymous access to the Kubernetes API server and enumerate cluster secrets', category: 'infrastructure' },
]

const DEMO_TICKETS = [
  { title: 'Exposed MongoDB on Meridian DMZ', description: 'Shodan scan revealed unauthenticated MongoDB on port 27017 with ~45K employee records.', severity: 'critical', ticketType: 'osint-investigation' },
  { title: 'VPN Gateway RCE — CVE-2024-21762', description: 'Critical RCE vulnerability in FortiOS SSL VPN gateway. Public exploit available, serves 200+ users.', severity: 'critical', ticketType: 'osint-investigation' },
  { title: 'Social media leak — internal org chart', description: 'Meridian Defense org chart with clearance levels found on public forum.', severity: 'high', ticketType: 'osint-investigation' },
  { title: 'DNS zone transfer — meridian-defense.com', description: 'AXFR enabled on primary DNS, leaking 42 internal hostnames including staging servers.', severity: 'high', ticketType: 'osint-investigation' },
  { title: 'ProxyLogon Exploitation on Exchange', description: 'Exploit CVE-2021-26855 chain on mail.meridian-defense.com for mailbox access.', severity: 'critical', ticketType: 'red-team-operation' },
  { title: 'Nmap Deep Scan of Database Subnet', description: 'Full port scan and service enumeration of 10.0.5.0/24 internal database subnet.', severity: 'high', ticketType: 'red-team-operation' },
  { title: 'Jenkins CLI RCE Attempt', description: 'Exploit CVE-2024-23897 arbitrary file read via exposed Jenkins CLI.', severity: 'critical', ticketType: 'red-team-operation' },
  { title: 'Redis Unauthorized Access Test', description: 'Connect to Redis 6.2 on 10.0.5.40:6379, attempt data exfil and config write.', severity: 'medium', ticketType: 'red-team-operation' },
]

const DEMO_TOOLS = [
  {
    name: 'Nmap', description: 'Network discovery and security auditing tool', category: 'reconnaissance',
    framework: 'nmap', targetTypes: ['network', 'infrastructure'], protocols: ['tcp', 'udp'],
    riskProfile: { serviceDisruption: 'low', systemDamage: 'none', detectionLikelihood: 'medium', requiresAuth: false, reversible: true, noisy: true },
    successProfile: { estimatedSuccessRate: 95, avgExecutionTime: '30s', requiredAccess: 'network', outputType: 'data' },
  },
  {
    name: 'Metasploit', description: 'Penetration testing framework with exploit modules', category: 'exploitation',
    framework: 'metasploit', targetTypes: ['web', 'network', 'application'], protocols: ['tcp', 'http'],
    riskProfile: { serviceDisruption: 'high', systemDamage: 'medium', detectionLikelihood: 'high', requiresAuth: false, reversible: false, noisy: true },
    successProfile: { estimatedSuccessRate: 65, avgExecutionTime: '5m', requiredAccess: 'network', outputType: 'shell' },
  },
  {
    name: 'redis-cli', description: 'Redis command-line client for testing unauthenticated access', category: 'exploitation',
    framework: 'custom', targetTypes: ['database'], protocols: ['tcp'],
    riskProfile: { serviceDisruption: 'low', systemDamage: 'low', detectionLikelihood: 'low', requiresAuth: false, reversible: true, noisy: false },
    successProfile: { estimatedSuccessRate: 90, avgExecutionTime: '10s', requiredAccess: 'network', outputType: 'data' },
  },
  {
    name: 'Gobuster', description: 'Directory and DNS brute-force scanner', category: 'reconnaissance',
    framework: 'gobuster', targetTypes: ['web'], protocols: ['http'],
    riskProfile: { serviceDisruption: 'low', systemDamage: 'none', detectionLikelihood: 'medium', requiresAuth: false, reversible: true, noisy: true },
    successProfile: { estimatedSuccessRate: 80, avgExecutionTime: '2m', requiredAccess: 'network', outputType: 'data' },
  },
]

const DEMO_CONTEXT = {
  goals: [
    { id: 'g-1', title: 'Perimeter Hardening', description: 'Secure all internet-facing services against known CVEs', weight: 8 },
    { id: 'g-2', title: 'Database Security Audit', description: 'Eliminate unauthenticated database endpoints across all subnets', weight: 6 },
    { id: 'g-3', title: 'Lateral Movement Prevention', description: 'Map and restrict cross-subnet access paths in production', weight: 4 },
  ],
  kpis: [
    { id: 'k-1', title: 'Critical Vuln Reduction', description: 'Reduce critical external vulnerabilities by 50% within Q1', weight: 9 },
    { id: 'k-2', title: 'Zero Unauth Databases', description: 'All database instances require authentication', weight: 7 },
    { id: 'k-3', title: 'Mean Time to Remediate', description: 'Critical findings remediated within 48 hours', weight: 6 },
  ],
  priorityWeights: { alignment: 0.40, impact: 0.30, effort: 0.20, urgency: 0.10 },
  planningWindow: 'Q1 2026',
}

export default function RunDemo({ visible, onDismiss, userId }: Props) {
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  const setStep = (index: number, update: Partial<Step>) =>
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...update } : s))

  const runDemo = async () => {
    setRunning(true)
    setDone(false)

    const initialSteps: Step[] = [
      { label: 'Seed leadership context (goals + KPIs + weights)', status: 'pending' },
      ...DEMO_TICKETS.map((t, i) => ({ label: `Create ticket ${i + 1}: ${t.title}`, status: 'pending' as StepStatus })),
      ...DEMO_TARGETS.map((_, i) => ({ label: `Create target ${i + 1} of ${DEMO_TARGETS.length}`, status: 'pending' as StepStatus })),
      ...DEMO_TOOLS.map((t, i) => ({ label: `Register tool ${i + 1}: ${t.name}`, status: 'pending' as StepStatus })),
    ]
    setSteps(initialSteps)

    let stepIdx = 0

    try {
      // Step 0: Seed leadership context
      setStep(stepIdx, { status: 'running' })
      await updateContext(DEMO_CONTEXT)
      setStep(stepIdx, { status: 'success', detail: 'Context saved + prioritization triggered' })
      stepIdx++

      // Tickets
      for (let i = 0; i < DEMO_TICKETS.length; i++) {
        setStep(stepIdx, { status: 'running' })
        const ticket = DEMO_TICKETS[i]
        const result = await createTicket({
          ...ticket,
          assigneeId: userId,
          severity: ticket.severity as 'critical' | 'high' | 'medium' | 'low',
        })
        setStep(stepIdx, { status: 'success', detail: result.ticketId })
        stepIdx++
      }

      // Targets
      for (let i = 0; i < DEMO_TARGETS.length; i++) {
        setStep(stepIdx, { status: 'running' })
        const t = DEMO_TARGETS[i]
        const result = await createTarget(t.goal, t.category, userId)
        setStep(stepIdx, { status: 'success', detail: result.targetId })
        stepIdx++
      }

      // Tools
      for (let i = 0; i < DEMO_TOOLS.length; i++) {
        setStep(stepIdx, { status: 'running' })
        const tool = DEMO_TOOLS[i]
        await manageTools('create', tool)
        setStep(stepIdx, { status: 'success', detail: tool.name })
        stepIdx++
      }

      setDone(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s))
    } finally {
      setRunning(false)
    }
  }

  const handleDismiss = () => {
    setSteps([])
    setDone(false)
    onDismiss()
  }

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      header="Seed Demo Data"
      size="medium"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={handleDismiss} disabled={running}>Close</Button>
            {!done && <Button variant="primary" onClick={runDemo} loading={running} disabled={running}>Run Demo</Button>}
            {done && <Button variant="primary" onClick={() => window.location.reload()}>Done — reload &amp; explore!</Button>}
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="s">
        <Box variant="p">
          Seeds the app with realistic Meridian Defense Systems demo data:
          leadership context with goals and KPIs, {DEMO_TICKETS.length} investigation/operation tickets,
          {' '}{DEMO_TARGETS.length} red team targets (auto-enriched by AI), and {DEMO_TOOLS.length} tools
          with risk profiles. Every dashboard and view will have data to explore.
        </Box>
        {steps.length === 0 && !running && (
          <Box color="text-body-secondary">Click <strong>Run Demo</strong> to begin seeding.</Box>
        )}
        {steps.map((step, i) => (
          <SpaceBetween key={i} direction="horizontal" size="xs">
            <StatusIndicator type={
              step.status === 'success' ? 'success'
              : step.status === 'error' ? 'error'
              : step.status === 'running' ? 'loading'
              : 'pending'
            }>
              {step.label}{step.detail ? ` — ${step.detail}` : ''}
            </StatusIndicator>
          </SpaceBetween>
        ))}
        {done && (
          <StatusIndicator type="success">
            Demo seeded! Navigate to <strong>OSINT Dashboard</strong>, <strong>Target Queue</strong>,
            {' '}<strong>Red Team Operations</strong>, and <strong>Leadership Dashboard</strong> to explore.
          </StatusIndicator>
        )}
      </SpaceBetween>
    </Modal>
  )
}
