import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import Table from '@cloudscape-design/components/table'
import Badge from '@cloudscape-design/components/badge'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import SpaceBetween from '@cloudscape-design/components/space-between'
import TextFilter from '@cloudscape-design/components/text-filter'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import SplitPanel from '@cloudscape-design/components/split-panel'
import AppLayout from '@cloudscape-design/components/app-layout'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import Modal from '@cloudscape-design/components/modal'
import FormField from '@cloudscape-design/components/form-field'
import Input from '@cloudscape-design/components/input'
import Textarea from '@cloudscape-design/components/textarea'
import Select from '@cloudscape-design/components/select'
import Toggle from '@cloudscape-design/components/toggle'
import ProgressBar from '@cloudscape-design/components/progress-bar'
import Alert from '@cloudscape-design/components/alert'
import Tabs from '@cloudscape-design/components/tabs'
import { useCollection } from '@cloudscape-design/collection-hooks'
import { listTools, manageTools } from '@/utils/api'
import type { Tool } from '@/types'

// ── Options ─────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'reconnaissance', label: 'Reconnaissance' },
  { value: 'exploitation', label: 'Exploitation' },
  { value: 'post-exploitation', label: 'Post-Exploitation' },
  { value: 'persistence', label: 'Persistence' },
  { value: 'credential-access', label: 'Credential Access' },
  { value: 'lateral-movement', label: 'Lateral Movement' },
  { value: 'exfiltration', label: 'Exfiltration' },
  { value: 'custom', label: 'Custom' },
]

const FRAMEWORK_OPTIONS = [
  { value: 'nmap', label: 'Nmap' },
  { value: 'metasploit', label: 'Metasploit' },
  { value: 'burpsuite', label: 'Burp Suite' },
  { value: 'gobuster', label: 'Gobuster' },
  { value: 'nuclei', label: 'Nuclei' },
  { value: 'sqlmap', label: 'SQLMap' },
  { value: 'hydra', label: 'Hydra' },
  { value: 'custom', label: 'Custom' },
]

const TARGET_TYPE_OPTIONS = [
  { value: 'network', label: 'Network' },
  { value: 'web', label: 'Web' },
  { value: 'application', label: 'Application' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'database', label: 'Database' },
  { value: 'personnel', label: 'Personnel' },
  { value: 'wireless', label: 'Wireless' },
  { value: 'cloud', label: 'Cloud' },
]

const PROTOCOL_OPTIONS = [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'ssh', label: 'SSH' },
  { value: 'smb', label: 'SMB' },
  { value: 'dns', label: 'DNS' },
  { value: 'ftp', label: 'FTP' },
]

const RISK_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const ACCESS_OPTIONS = [
  { value: 'network', label: 'Network' },
  { value: 'local', label: 'Local' },
  { value: 'physical', label: 'Physical' },
  { value: 'authenticated', label: 'Authenticated' },
]

const OUTPUT_OPTIONS = [
  { value: 'data', label: 'Data' },
  { value: 'shell', label: 'Shell' },
  { value: 'file', label: 'File' },
  { value: 'report', label: 'Report' },
]

// ── Helpers ─────────────────────────────────────────────────────────

function riskBadge(level: string) {
  const colorMap: Record<string, 'red' | 'blue' | 'grey' | 'green'> = {
    high: 'red', medium: 'blue', low: 'grey', none: 'green',
  }
  return <Badge color={colorMap[level] ?? 'grey'}>{level}</Badge>
}

function maxRisk(tool: Tool): string {
  if (!tool.riskProfile) return 'unknown'
  const levels = [tool.riskProfile.serviceDisruption, tool.riskProfile.systemDamage, tool.riskProfile.detectionLikelihood]
  const order = ['none', 'low', 'medium', 'high']
  return levels.reduce((max, v) => order.indexOf(v ?? '') > order.indexOf(max) ? (v ?? 'low') : max, 'low')
}

function categoryBadge(category: string) {
  const colorMap: Record<string, 'blue' | 'green' | 'red' | 'grey'> = {
    reconnaissance: 'blue', exploitation: 'red', 'post-exploitation': 'red',
    persistence: 'grey', 'credential-access': 'red', 'lateral-movement': 'blue',
    exfiltration: 'grey', custom: 'green',
  }
  return <Badge color={colorMap[category] ?? 'grey'}>{category}</Badge>
}

// ── Empty form state ────────────────────────────────────────────────

interface ToolForm {
  name: string
  description: string
  category: string
  framework: string
  targetTypes: string[]
  protocols: string[]
  riskProfile: {
    serviceDisruption: string
    systemDamage: string
    detectionLikelihood: string
    requiresAuth: boolean
    reversible: boolean
    noisy: boolean
  }
  successProfile: {
    estimatedSuccessRate: number
    avgExecutionTime: string
    requiredAccess: string
    outputType: string
  }
}

const EMPTY_FORM: ToolForm = {
  name: '',
  description: '',
  category: 'reconnaissance',
  framework: 'custom',
  targetTypes: [],
  protocols: [],
  riskProfile: {
    serviceDisruption: 'low',
    systemDamage: 'none',
    detectionLikelihood: 'medium',
    requiresAuth: false,
    reversible: true,
    noisy: false,
  },
  successProfile: {
    estimatedSuccessRate: 50,
    avgExecutionTime: '30s',
    requiredAccess: 'network',
    outputType: 'data',
  },
}

// ── Detail Panel ────────────────────────────────────────────────────

function ToolDetail({ tool }: { tool: Tool }) {
  return (
    <SpaceBetween size="m">
      <div>
        <Box variant="h3">{tool.name}</Box>
        <Box variant="small" color="text-body-secondary">{tool.toolId}</Box>
      </div>

      <Box variant="p">{tool.description}</Box>

      <ColumnLayout columns={3}>
        <div>
          <Box variant="small" color="text-body-secondary">Category</Box>
          <div style={{ marginTop: 4 }}>{categoryBadge(tool.category)}</div>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Framework</Box>
          <Box variant="p">{tool.framework}</Box>
        </div>
        <div>
          <Box variant="small" color="text-body-secondary">Overall Risk</Box>
          <div style={{ marginTop: 4 }}>{riskBadge(maxRisk(tool))}</div>
        </div>
      </ColumnLayout>

      <div>
        <Box variant="small" color="text-body-secondary">Target Types</Box>
        <SpaceBetween size="xxs" direction="horizontal">
          {(tool.targetTypes ?? []).map(t => <Badge key={t} color="blue">{t}</Badge>)}
        </SpaceBetween>
      </div>

      <div>
        <Box variant="small" color="text-body-secondary">Protocols</Box>
        <SpaceBetween size="xxs" direction="horizontal">
          {(tool.protocols ?? []).map(p => <Badge key={p} color="grey">{p}</Badge>)}
        </SpaceBetween>
      </div>

      {tool.riskProfile && (
        <Container header={<Header variant="h3">Risk Profile</Header>}>
          <ColumnLayout columns={3}>
            <div>
              <Box variant="small" color="text-body-secondary">Service Disruption</Box>
              <div style={{ marginTop: 4 }}>{riskBadge(tool.riskProfile.serviceDisruption)}</div>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">System Damage</Box>
              <div style={{ marginTop: 4 }}>{riskBadge(tool.riskProfile.systemDamage)}</div>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Detection Likelihood</Box>
              <div style={{ marginTop: 4 }}>{riskBadge(tool.riskProfile.detectionLikelihood)}</div>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Requires Auth</Box>
              <Box variant="p">{tool.riskProfile.requiresAuth ? 'Yes' : 'No'}</Box>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Reversible</Box>
              <Box variant="p">{tool.riskProfile.reversible ? 'Yes' : 'No'}</Box>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Noisy</Box>
              <Box variant="p">{tool.riskProfile.noisy ? 'Yes' : 'No'}</Box>
            </div>
          </ColumnLayout>
        </Container>
      )}

      {tool.successProfile && (
        <Container header={<Header variant="h3">Success Profile</Header>}>
          <ColumnLayout columns={2}>
            <div>
              <Box variant="small" color="text-body-secondary">Estimated Success Rate</Box>
              <ProgressBar value={tool.successProfile.estimatedSuccessRate} additionalInfo={`${tool.successProfile.estimatedSuccessRate}%`} />
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Avg Execution Time</Box>
              <Box variant="p">{tool.successProfile.avgExecutionTime}</Box>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Required Access</Box>
              <Box variant="p">{tool.successProfile.requiredAccess}</Box>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Output Type</Box>
              <Box variant="p">{tool.successProfile.outputType}</Box>
            </div>
          </ColumnLayout>
        </Container>
      )}
    </SpaceBetween>
  )
}

// ── Create / Edit Modal ─────────────────────────────────────────────

function ToolFormModal({ visible, onDismiss, onSubmit, initial, loading, error }: {
  visible: boolean
  onDismiss: () => void
  onSubmit: (form: ToolForm) => void
  initial: ToolForm
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState<ToolForm>(initial)
  const isEdit = initial.name !== ''

  useEffect(() => { setForm(initial) }, [initial])

  const update = <K extends keyof ToolForm>(key: K, value: ToolForm[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const updateRisk = <K extends keyof ToolForm['riskProfile']>(key: K, value: ToolForm['riskProfile'][K]) =>
    setForm(prev => ({ ...prev, riskProfile: { ...prev.riskProfile, [key]: value } }))

  const updateSuccess = <K extends keyof ToolForm['successProfile']>(key: K, value: ToolForm['successProfile'][K]) =>
    setForm(prev => ({ ...prev, successProfile: { ...prev.successProfile, [key]: value } }))

  const toggleArrayItem = (key: 'targetTypes' | 'protocols', value: string) => {
    setForm(prev => {
      const arr = prev[key]
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] }
    })
  }

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={isEdit ? `Edit Tool: ${initial.name}` : 'Register New Tool'}
      size="large"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button variant="primary" loading={loading} onClick={() => onSubmit(form)} disabled={!form.name.trim()}>
              {isEdit ? 'Update Tool' : 'Register Tool'}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="l">
        {error && <Alert type="error" dismissible onDismiss={() => {}}>{error}</Alert>}

        <Tabs tabs={[
          {
            id: 'basic',
            label: 'Basic Info',
            content: (
              <SpaceBetween size="m">
                <FormField label="Tool Name" constraintText="Required">
                  <Input value={form.name} onChange={({ detail }) => update('name', detail.value)} placeholder="e.g. Nmap, Metasploit, custom-scanner" />
                </FormField>
                <FormField label="Description" description="What does this tool do? The AI agent uses this for semantic matching.">
                  <Textarea value={form.description} onChange={({ detail }) => update('description', detail.value)} rows={3} placeholder="Network discovery and security auditing tool that scans for open ports, services, and OS fingerprinting" />
                </FormField>
                <ColumnLayout columns={2}>
                  <FormField label="Category">
                    <Select
                      selectedOption={CATEGORY_OPTIONS.find(o => o.value === form.category) ?? null}
                      options={CATEGORY_OPTIONS}
                      onChange={({ detail }) => update('category', detail.selectedOption.value ?? 'custom')}
                    />
                  </FormField>
                  <FormField label="Framework">
                    <Select
                      selectedOption={FRAMEWORK_OPTIONS.find(o => o.value === form.framework) ?? null}
                      options={FRAMEWORK_OPTIONS}
                      onChange={({ detail }) => update('framework', detail.selectedOption.value ?? 'custom')}
                    />
                  </FormField>
                </ColumnLayout>
                <FormField label="Target Types" description="Select all asset types this tool can target">
                  <SpaceBetween size="xs" direction="horizontal">
                    {TARGET_TYPE_OPTIONS.map(opt => (
                      <Button
                        key={opt.value}
                        variant={form.targetTypes.includes(opt.value) ? 'primary' : 'normal'}
                        onClick={() => toggleArrayItem('targetTypes', opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </SpaceBetween>
                </FormField>
                <FormField label="Protocols">
                  <SpaceBetween size="xs" direction="horizontal">
                    {PROTOCOL_OPTIONS.map(opt => (
                      <Button
                        key={opt.value}
                        variant={form.protocols.includes(opt.value) ? 'primary' : 'normal'}
                        onClick={() => toggleArrayItem('protocols', opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </SpaceBetween>
                </FormField>
              </SpaceBetween>
            ),
          },
          {
            id: 'risk',
            label: 'Risk Profile',
            content: (
              <SpaceBetween size="m">
                <Box variant="p" color="text-body-secondary">
                  Define the operational risk characteristics. These are used by the AI prioritization agent to assess tool suitability.
                </Box>
                <ColumnLayout columns={3}>
                  <FormField label="Service Disruption">
                    <Select
                      selectedOption={RISK_LEVELS.find(o => o.value === form.riskProfile.serviceDisruption) ?? null}
                      options={RISK_LEVELS}
                      onChange={({ detail }) => updateRisk('serviceDisruption', detail.selectedOption.value ?? 'low')}
                    />
                  </FormField>
                  <FormField label="System Damage">
                    <Select
                      selectedOption={RISK_LEVELS.find(o => o.value === form.riskProfile.systemDamage) ?? null}
                      options={RISK_LEVELS}
                      onChange={({ detail }) => updateRisk('systemDamage', detail.selectedOption.value ?? 'none')}
                    />
                  </FormField>
                  <FormField label="Detection Likelihood">
                    <Select
                      selectedOption={RISK_LEVELS.find(o => o.value === form.riskProfile.detectionLikelihood) ?? null}
                      options={RISK_LEVELS}
                      onChange={({ detail }) => updateRisk('detectionLikelihood', detail.selectedOption.value ?? 'medium')}
                    />
                  </FormField>
                </ColumnLayout>
                <ColumnLayout columns={3}>
                  <FormField label="Requires Authentication">
                    <Toggle checked={form.riskProfile.requiresAuth} onChange={({ detail }) => updateRisk('requiresAuth', detail.checked)}>
                      {form.riskProfile.requiresAuth ? 'Yes' : 'No'}
                    </Toggle>
                  </FormField>
                  <FormField label="Reversible">
                    <Toggle checked={form.riskProfile.reversible} onChange={({ detail }) => updateRisk('reversible', detail.checked)}>
                      {form.riskProfile.reversible ? 'Yes' : 'No'}
                    </Toggle>
                  </FormField>
                  <FormField label="Noisy (generates logs/alerts)">
                    <Toggle checked={form.riskProfile.noisy} onChange={({ detail }) => updateRisk('noisy', detail.checked)}>
                      {form.riskProfile.noisy ? 'Yes' : 'No'}
                    </Toggle>
                  </FormField>
                </ColumnLayout>
              </SpaceBetween>
            ),
          },
          {
            id: 'success',
            label: 'Success Profile',
            content: (
              <SpaceBetween size="m">
                <Box variant="p" color="text-body-secondary">
                  Define expected outcomes. The AI agent uses these to recommend tools for specific targets.
                </Box>
                <FormField label={`Estimated Success Rate: ${form.successProfile.estimatedSuccessRate}%`}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.successProfile.estimatedSuccessRate}
                    onChange={e => updateSuccess('estimatedSuccessRate', Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#0972d3' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.6 }}>
                    <span>0% — Unlikely</span>
                    <span>50% — Moderate</span>
                    <span>100% — Guaranteed</span>
                  </div>
                </FormField>
                <ColumnLayout columns={3}>
                  <FormField label="Avg Execution Time" description="e.g. 10s, 2m, 1h">
                    <Input value={form.successProfile.avgExecutionTime} onChange={({ detail }) => updateSuccess('avgExecutionTime', detail.value)} />
                  </FormField>
                  <FormField label="Required Access">
                    <Select
                      selectedOption={ACCESS_OPTIONS.find(o => o.value === form.successProfile.requiredAccess) ?? null}
                      options={ACCESS_OPTIONS}
                      onChange={({ detail }) => updateSuccess('requiredAccess', detail.selectedOption.value ?? 'network')}
                    />
                  </FormField>
                  <FormField label="Output Type">
                    <Select
                      selectedOption={OUTPUT_OPTIONS.find(o => o.value === form.successProfile.outputType) ?? null}
                      options={OUTPUT_OPTIONS}
                      onChange={({ detail }) => updateSuccess('outputType', detail.selectedOption.value ?? 'data')}
                    />
                  </FormField>
                </ColumnLayout>
              </SpaceBetween>
            ),
          },
        ]} />
      </SpaceBetween>
    </Modal>
  )
}

// ── Main Component ──────────────────────────────────────────────────

export default function ToolRegistry() {
  const [tools, setTools] = useState<Tool[]>([])
  const [selectedItems, setSelectedItems] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitPosition, setSplitPosition] = useState<'side' | 'bottom'>('side')

  // Create/edit modal state
  const [modalVisible, setModalVisible] = useState(false)
  const [modalForm, setModalForm] = useState<ToolForm>(EMPTY_FORM)
  const [editingToolId, setEditingToolId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      try {
        const result = await listTools()
        if (!cancelled) setTools(result)
      } catch {
        if (!cancelled) setTools([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [])

  const { items, collectionProps, filterProps } = useCollection(tools, {
    filtering: { empty: <Box textAlign="center">No tools registered</Box> },
    sorting: { defaultState: { sortingColumn: { sortingField: 'name' }, isDescending: false } },
  })

  const openCreate = () => {
    setEditingToolId(null)
    setModalForm(EMPTY_FORM)
    setSubmitError(null)
    setModalVisible(true)
  }

  const openEdit = (tool: Tool) => {
    setEditingToolId(tool.toolId)
    setModalForm({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      framework: tool.framework,
      targetTypes: tool.targetTypes ?? [],
      protocols: tool.protocols ?? [],
      riskProfile: tool.riskProfile ?? EMPTY_FORM.riskProfile,
      successProfile: tool.successProfile ?? EMPTY_FORM.successProfile,
    })
    setSubmitError(null)
    setModalVisible(true)
  }

  const handleSubmit = async (form: ToolForm) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (editingToolId) {
        const result = await manageTools('update', { toolId: editingToolId, ...form } as unknown as Record<string, unknown>)
        const updated = result as unknown as Tool
        setTools(prev => prev.map(t => t.toolId === editingToolId ? { ...t, ...updated, ...form } : t))
        setSelectedItems(prev => prev.map(t => t.toolId === editingToolId ? { ...t, ...updated, ...form } : t))
        setActionAlert({ type: 'success', message: `Updated ${form.name}` })
      } else {
        const result = await manageTools('create', form as unknown as Record<string, unknown>)
        const created = result as unknown as Tool
        setTools(prev => [...prev, { ...created, ...form } as Tool])
        setActionAlert({ type: 'success', message: `Registered ${form.name} — vectorization in progress` })
      }
      setModalVisible(false)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save tool')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedTool = selectedItems[0] ?? null

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading tool registry...</Box>
      </Box>
    )
  }

  const mainContent = (
    <SpaceBetween size="l">
      {actionAlert && (
        <Alert type={actionAlert.type} dismissible onDismiss={() => setActionAlert(null)}>{actionAlert.message}</Alert>
      )}

      <Container
        header={
          <Header
            variant="h2"
            counter={`(${tools.length})`}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                {selectedTool && <Button onClick={() => openEdit(selectedTool)}>Edit Tool</Button>}
                <Button variant="primary" onClick={openCreate}>Register Tool</Button>
              </SpaceBetween>
            }
            description="Register and manage red team tools with risk profiles, success metrics, and target type mappings. Tools are vectorized for AI-powered semantic search and prioritization."
          >
            Tool Registry
          </Header>
        }
      >
        <SpaceBetween size="m">
          <TextFilter {...filterProps} filteringPlaceholder="Filter tools by name, category, or framework" />
          <Table
            {...collectionProps}
            items={items}
            selectionType="single"
            selectedItems={selectedItems}
            onSelectionChange={({ detail }) => {
              setSelectedItems(detail.selectedItems)
              setSplitOpen(detail.selectedItems.length > 0)
            }}
            columnDefinitions={[
              { id: 'name', header: 'Name', sortingField: 'name', cell: item => <Box fontWeight="bold">{item.name}</Box>, width: 160 },
              { id: 'category', header: 'Category', sortingField: 'category', cell: item => categoryBadge(item.category), width: 140 },
              { id: 'framework', header: 'Framework', sortingField: 'framework', cell: item => item.framework, width: 110 },
              {
                id: 'targetTypes', header: 'Target Types',
                cell: item => (
                  <SpaceBetween size="xxs" direction="horizontal">
                    {(item.targetTypes ?? []).map(t => <Badge key={t} color="blue">{t}</Badge>)}
                  </SpaceBetween>
                ),
                width: 220,
              },
              {
                id: 'risk', header: 'Risk',
                cell: item => riskBadge(maxRisk(item)),
                width: 90,
              },
              {
                id: 'success', header: 'Success Rate',
                cell: item => (
                  <ProgressBar
                    value={item.successProfile?.estimatedSuccessRate ?? 0}
                    additionalInfo={`${item.successProfile?.estimatedSuccessRate ?? 0}%`}
                  />
                ),
                width: 160,
              },
              {
                id: 'noisy', header: 'Stealth',
                cell: item => (
                  <Badge color={item.riskProfile?.noisy ? 'red' : 'green'}>
                    {item.riskProfile?.noisy ? 'Noisy' : 'Quiet'}
                  </Badge>
                ),
                width: 90,
              },
            ]}
            variant="embedded"
            empty={
              <Box textAlign="center" padding="l">
                <SpaceBetween size="s">
                  <Box variant="h3" color="text-body-secondary">No tools registered</Box>
                  <Box variant="p" color="text-body-secondary">Register your first tool to get started with AI-powered tool matching.</Box>
                  <Button variant="primary" onClick={openCreate}>Register Tool</Button>
                </SpaceBetween>
              </Box>
            }
          />
        </SpaceBetween>
      </Container>

      <ToolFormModal
        visible={modalVisible}
        onDismiss={() => setModalVisible(false)}
        onSubmit={handleSubmit}
        initial={modalForm}
        loading={submitting}
        error={submitError}
      />
    </SpaceBetween>
  )

  return (
    <ContentLayout header={<Header variant="h1">Tool Registry</Header>}>
      <AppLayout
        content={mainContent}
        splitPanel={
          selectedTool ? (
            <SplitPanel header={selectedTool.name} closeBehavior="hide">
              <ToolDetail tool={selectedTool} />
            </SplitPanel>
          ) : undefined
        }
        splitPanelOpen={splitOpen}
        onSplitPanelToggle={({ detail }) => setSplitOpen(detail.open)}
        splitPanelPreferences={{ position: splitPosition }}
        onSplitPanelPreferencesChange={({ detail }) => setSplitPosition(detail.position)}
        ariaLabels={{} as Record<string, string>}
        navigationHide
        toolsHide
        headerSelector="#top-nav"
        disableContentPaddings
      />
    </ContentLayout>
  )
}
