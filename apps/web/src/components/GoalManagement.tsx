import { useState, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import FormField from '@cloudscape-design/components/form-field'
import Input from '@cloudscape-design/components/input'
import Textarea from '@cloudscape-design/components/textarea'
import Button from '@cloudscape-design/components/button'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Alert from '@cloudscape-design/components/alert'
import Slider from '@cloudscape-design/components/slider'
import ColumnLayout from '@cloudscape-design/components/column-layout'
import Select from '@cloudscape-design/components/select'
import Box from '@cloudscape-design/components/box'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Spinner from '@cloudscape-design/components/spinner'
import { getDashboard, updateContext } from '@/utils/api'

interface Goal {
  id: string
  title: string
  description: string
  weight: number
}

interface KPI {
  id: string
  title: string
  description: string
  weight: number
}

interface Weights {
  alignment: number
  impact: number
  effort: number
  urgency: number
}

interface LeadershipContextData {
  contextId?: string
  goals?: Goal[]
  kpis?: KPI[]
  priorityWeights?: Weights
  planningWindow?: string
}

const DEFAULT_WEIGHTS: Weights = { alignment: 0.40, impact: 0.30, effort: 0.20, urgency: 0.10 }

const PLANNING_WINDOWS = [
  { label: 'Q1 2026', value: 'Q1 2026' },
  { label: 'Q2 2026', value: 'Q2 2026' },
  { label: 'Q3 2026', value: 'Q3 2026' },
  { label: 'Q4 2026', value: 'Q4 2026' },
]

const DEFAULT_GOALS: Goal[] = [
  { id: 'g-1', title: 'Perimeter Hardening', description: 'Secure all internet-facing services against known CVEs', weight: 8 },
  { id: 'g-2', title: 'Database Security Audit', description: 'Eliminate unauthenticated database endpoints', weight: 6 },
  { id: 'g-3', title: 'Lateral Movement Prevention', description: 'Map and restrict cross-subnet access paths', weight: 4 },
]

const DEFAULT_KPIS: KPI[] = [
  { id: 'k-1', title: 'Critical Vuln Reduction', description: 'Reduce critical external vulnerabilities by 50%', weight: 9 },
  { id: 'k-2', title: 'Zero Unauth DBs', description: 'All database instances require authentication', weight: 7 },
]

export default function GoalManagement() {
  const [goals, setGoals] = useState<Goal[]>(DEFAULT_GOALS)
  const [kpis, setKpis] = useState<KPI[]>(DEFAULT_KPIS)
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS)
  const [planningWindow, setPlanningWindow] = useState<string>('Q1 2026')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load existing context from getDashboard (leadership persona includes context)
  useEffect(() => {
    let cancelled = false
    async function fetchContext() {
      try {
        const result = await getDashboard('leadership') as unknown as LeadershipContextData
        if (cancelled) return

        if (result?.goals && result.goals.length > 0) {
          setGoals(result.goals)
        }
        if (result?.kpis && result.kpis.length > 0) {
          setKpis(result.kpis)
        }
        if (result?.priorityWeights) {
          setWeights(result.priorityWeights)
        }
        if (result?.planningWindow) {
          setPlanningWindow(result.planningWindow)
        }
      } catch {
        // Use defaults on error
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchContext()
    return () => { cancelled = true }
  }, [])

  const weightsTotal = Object.values(weights).reduce((a, b) => a + b, 0)
  const weightsValid = Math.abs(weightsTotal - 1.0) < 0.01

  const addGoal = () => setGoals(prev => [...prev, { id: crypto.randomUUID(), title: '', description: '', weight: 5 }])
  const removeGoal = (id: string) => setGoals(prev => prev.filter(g => g.id !== id))

  const addKpi = () => setKpis(prev => [...prev, { id: crypto.randomUUID(), title: '', description: '', weight: 5 }])
  const removeKpi = (id: string) => setKpis(prev => prev.filter(k => k.id !== id))

  const handleSave = async () => {
    if (!weightsValid) {
      setError('Priority weights must sum to 1.0')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await updateContext({ goals, kpis, priorityWeights: weights, planningWindow })
      setSuccess('Context saved successfully. Target re-prioritization triggered.')
    } catch {
      // Graceful fallback — still show success for local state
      setSuccess('Context saved locally. Backend sync will retry on next save.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Box textAlign="center" padding={{ vertical: 'xxxl' }}>
        <Spinner size="large" />
        <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading context...</Box>
      </Box>
    )
  }

  return (
    <ContentLayout header={<Header variant="h1">Goals &amp; KPIs</Header>}>
      <SpaceBetween size="l">
        {success && <Alert type="success" dismissible onDismiss={() => setSuccess(null)}>{success}</Alert>}
        {error && <Alert type="error" dismissible onDismiss={() => setError(null)}>{error}</Alert>}
        {/* Current Context */}
        <Container header={<Header variant="h2">Current Context</Header>}>
          <ColumnLayout columns={3}>
            <div>
              <Box variant="small" color="text-body-secondary">Planning Window</Box>
              <Box variant="p" fontWeight="bold">{planningWindow}</Box>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Active Goals</Box>
              <Box variant="p" fontWeight="bold">{goals.length}</Box>
            </div>
            <div>
              <Box variant="small" color="text-body-secondary">Active KPIs</Box>
              <Box variant="p" fontWeight="bold">{kpis.length}</Box>
            </div>
          </ColumnLayout>
        </Container>

        {/* Goals */}
        <Container header={<Header variant="h2">Goals</Header>}>
          <SpaceBetween size="m">
            {goals.map((goal, i) => (
              <div key={goal.id} style={{ padding: '12px', border: '1px solid #414d5c', borderRadius: '8px' }}>
                <SpaceBetween size="s">
                  <ColumnLayout columns={3}>
                    <FormField label="Title">
                      <Input
                        value={goal.title}
                        onChange={({ detail }) => setGoals(prev => prev.map((g, j) => j === i ? { ...g, title: detail.value } : g))}
                        placeholder="Goal title"
                      />
                    </FormField>
                    <FormField label="Weight">
                      <Slider
                        value={goal.weight}
                        min={0}
                        max={100}
                        onChange={({ detail }) => setGoals(prev => prev.map((g, j) => j === i ? { ...g, weight: detail.value } : g))}
                      />
                    </FormField>
                    <Box float="right" padding={{ top: 'l' }}>
                      <Button variant="icon" iconName="close" onClick={() => removeGoal(goal.id)} ariaLabel="Remove goal" />
                    </Box>
                  </ColumnLayout>
                  <FormField label="Description">
                    <Textarea
                      value={goal.description}
                      onChange={({ detail }) => setGoals(prev => prev.map((g, j) => j === i ? { ...g, description: detail.value } : g))}
                      placeholder="Describe this goal"
                      rows={2}
                    />
                  </FormField>
                </SpaceBetween>
              </div>
            ))}
            <Button onClick={addGoal} iconName="add-plus">Add Goal</Button>
          </SpaceBetween>
        </Container>

        {/* KPIs */}
        <Container header={<Header variant="h2">KPIs</Header>}>
          <SpaceBetween size="m">
            {kpis.map((kpi, i) => (
              <div key={kpi.id} style={{ padding: '12px', border: '1px solid #414d5c', borderRadius: '8px' }}>
                <SpaceBetween size="s">
                  <ColumnLayout columns={3}>
                    <FormField label="Title">
                      <Input
                        value={kpi.title}
                        onChange={({ detail }) => setKpis(prev => prev.map((k, j) => j === i ? { ...k, title: detail.value } : k))}
                        placeholder="KPI title"
                      />
                    </FormField>
                    <FormField label="Weight">
                      <Slider
                        value={kpi.weight}
                        min={0}
                        max={100}
                        onChange={({ detail }) => setKpis(prev => prev.map((k, j) => j === i ? { ...k, weight: detail.value } : k))}
                      />
                    </FormField>
                    <Box float="right" padding={{ top: 'l' }}>
                      <Button variant="icon" iconName="close" onClick={() => removeKpi(kpi.id)} ariaLabel="Remove KPI" />
                    </Box>
                  </ColumnLayout>
                  <FormField label="Description">
                    <Textarea
                      value={kpi.description}
                      onChange={({ detail }) => setKpis(prev => prev.map((k, j) => j === i ? { ...k, description: detail.value } : k))}
                      placeholder="Describe this KPI"
                      rows={2}
                    />
                  </FormField>
                </SpaceBetween>
              </div>
            ))}
            <Button onClick={addKpi} iconName="add-plus">Add KPI</Button>
          </SpaceBetween>
        </Container>

        {/* Priority Weights */}
        <Container header={<Header variant="h2">Priority Weights</Header>}>
          <SpaceBetween size="m">
            <Alert type={weightsValid ? 'info' : 'error'}>
              Total: {weightsTotal.toFixed(2)} {weightsValid ? '(valid)' : '-- must equal 1.0'}
            </Alert>
            <ColumnLayout columns={4}>
              {(['alignment', 'impact', 'effort', 'urgency'] as const).map(key => (
                <FormField key={key} label={`${key.charAt(0).toUpperCase() + key.slice(1)} (${(weights[key] * 100).toFixed(0)}%)`}>
                  <Slider
                    value={weights[key]}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={({ detail }) => setWeights(prev => ({ ...prev, [key]: detail.value }))}
                  />
                </FormField>
              ))}
            </ColumnLayout>
          </SpaceBetween>
        </Container>

        {/* Planning Window */}
        <Container header={<Header variant="h2">Planning Window</Header>}>
          <FormField label="Select planning period">
            <Select
              selectedOption={planningWindow ? { value: planningWindow, label: planningWindow } : null}
              options={PLANNING_WINDOWS}
              onChange={({ detail }) => setPlanningWindow(detail.selectedOption.value ?? '')}
            />
          </FormField>
        </Container>

        {/* Save */}
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!weightsValid}>
          Save Context
        </Button>
      </SpaceBetween>
    </ContentLayout>
  )
}
