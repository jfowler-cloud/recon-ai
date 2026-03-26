/** Output panel — renders Recharts charts, Cloudscape tables, Mermaid diagrams. */

import { useEffect, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import Table from '@cloudscape-design/components/table'
import Box from '@cloudscape-design/components/box'
import { useAuth } from '@/App'
import type { OutputData } from '@/types'

const DEFAULT_COLORS = ['#0073bb', '#e8001c', '#037f0c', '#f89256', '#7d2105', '#00a1c9']

/** Type guard: output contains chart data. */
export function isChartOutput(output: OutputData | undefined): boolean {
  return output?.type === 'chart'
}

/** Type guard: output contains table data. */
export function isTableOutput(output: OutputData | undefined): boolean {
  return output?.type === 'table'
}

/** Type guard: output contains a Mermaid diagram. */
export function isDiagramOutput(output: OutputData | undefined): boolean {
  return output?.type === 'diagram'
}

/** Type guard: output contains a single metric. */
export function isMetricOutput(output: OutputData | undefined): boolean {
  return output?.type === 'metric'
}

interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'area'
  title: string
  data: Record<string, unknown>[]
  xKey: string
  yKeys: string[]
  colors: string[]
}

function parseChartConfig(output: OutputData): ChartConfig | null {
  if (output.type !== 'chart') return null
  return {
    chartType: output.chartType || 'bar',
    title: output.title || '',
    data: (output.data || []) as Record<string, unknown>[],
    xKey: output.xKey || 'name',
    yKeys: output.yKeys || ['value'],
    colors: output.colors || DEFAULT_COLORS,
  }
}

function ChartPanel({ output }: { output: OutputData }) {
  const config = parseChartConfig(output)
  if (!config || !config.data.length) return null

  const { chartType, title, data, xKey, yKeys, colors } = config

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} />
            ))}
          </BarChart>
        )
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {yKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} />
            ))}
          </LineChart>
        )
      case 'pie':
        return (
          <PieChart>
            <Pie data={data} dataKey={yKeys[0]} nameKey={xKey} cx="50%" cy="50%" outerRadius={80} label>
              {data.map((_, i) => (
                <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        )
      case 'area':
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            {yKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} fill={colors[i % colors.length]} stroke={colors[i % colors.length]} fillOpacity={0.3} />
            ))}
          </AreaChart>
        )
      default:
        return null
    }
  }

  return (
    <div style={{ marginTop: '12px' }}>
      {title && <Box variant="h4">{title}</Box>}
      <ResponsiveContainer width="100%" height={300}>
        {renderChart() || <div />}
      </ResponsiveContainer>
    </div>
  )
}

function TablePanel({ output }: { output: OutputData }) {
  const columns = output.columns || []
  const items = (output.data || []) as Record<string, unknown>[]

  if (!columns.length || !items.length) return null

  return (
    <div style={{ marginTop: '12px' }}>
      {output.title && <Box variant="h4">{output.title}</Box>}
      <Table
        columnDefinitions={columns.map(col => ({
          id: col.id,
          header: col.header,
          cell: (item: Record<string, unknown>) => String(item[col.id] ?? ''),
          sortingField: col.sortingField,
        }))}
        items={items}
        variant="embedded"
        wrapLines
      />
    </div>
  )
}

function DiagramPanel({ output }: { output: OutputData }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { isDarkMode } = useAuth()

  useEffect(() => {
    if (!output.mermaidCode || !containerRef.current) return

    const renderDiagram = async () => {
      try {
        const mermaid = await import('mermaid')
        mermaid.default.initialize({ startOnLoad: false, theme: isDarkMode ? 'dark' : 'default' })
        const { svg } = await mermaid.default.render(`mermaid-${Date.now()}`, output.mermaidCode!)
        if (containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch {
        if (containerRef.current) {
          containerRef.current.textContent = 'Failed to render diagram'
        }
      }
    }

    renderDiagram()
  }, [output.mermaidCode, isDarkMode])

  return (
    <div style={{ marginTop: '12px' }}>
      {output.title && <Box variant="h4">{output.title}</Box>}
      <div ref={containerRef} />
    </div>
  )
}

function MetricPanel({ output }: { output: OutputData }) {
  return (
    <div style={{ marginTop: '12px', textAlign: 'center' }}>
      <Box variant="awsui-key-label">{output.label}</Box>
      <Box variant="h1" fontSize="display-l">{String(output.value)}</Box>
    </div>
  )
}

export function OutputPanel({ output }: { output: OutputData }) {
  if (isChartOutput(output)) return <ChartPanel output={output} />
  if (isTableOutput(output)) return <TablePanel output={output} />
  if (isDiagramOutput(output)) return <DiagramPanel output={output} />
  if (isMetricOutput(output)) return <MetricPanel output={output} />
  return null
}
