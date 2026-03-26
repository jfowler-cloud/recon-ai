import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import Box from '@cloudscape-design/components/box'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useAuth } from '@/App'
import ChatPanel from './ChatPanel'

const PIE_COLORS = ['#e8001c', '#0972d3', '#f89256', '#29a368', '#8c8c8c']

interface ChartConfig {
  type: string
  chartType?: string
  data: Array<Record<string, unknown>>
  title: string
  xKey?: string
  yKeys?: string[]
}

function ChartRenderer({ data }: { data: unknown }) {
  const { isDarkMode } = useAuth()

  // Handle single chart or array of charts
  const charts: ChartConfig[] = []
  if (Array.isArray(data)) {
    charts.push(...(data as ChartConfig[]).filter(c => c?.data))
  } else if (data && typeof data === 'object' && (data as ChartConfig).data) {
    charts.push(data as ChartConfig)
  }

  if (charts.length === 0) return null

  return (
    <>
      {charts.map((chart, i) => {
        const chartType = chart.chartType ?? chart.type
        return (
          <div key={i} style={{ marginTop: 16, backgroundColor: isDarkMode ? '#0f1419' : '#ffffff', borderRadius: 8, padding: 12 }}>
            <Box variant="small" fontWeight="bold" padding={{ bottom: 'xs' }}>{chart.title}</Box>
            <ResponsiveContainer width="100%" height={250}>
              {chartType === 'pie' ? (
                <PieChart>
                  <Pie data={chart.data} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label>
                    {chart.data.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              ) : (
                <BarChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#414d5c' : '#d1d5db'} />
                  <XAxis dataKey={chart.xKey ?? Object.keys(chart.data[0] ?? {})[0]} tick={{ fill: isDarkMode ? '#b4b8bf' : '#687078', fontSize: 12 }} />
                  <YAxis tick={{ fill: isDarkMode ? '#b4b8bf' : '#687078', fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {(chart.yKeys ?? Object.keys(chart.data[0] ?? {}).slice(1)).map((key, j) => (
                    <Bar key={key} dataKey={key} fill={PIE_COLORS[j % PIE_COLORS.length]} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )
      })}
    </>
  )
}

export default function LeadershipChat() {
  return (
    <ContentLayout header={<Header variant="h1">Leadership Chat</Header>}>
      <ChatPanel
        persona="leadership"
        title="Leadership Chat"
        assistantName="Leadership Assistant"
        description="Cross-domain AI assistant with auto-visualization — ask about security posture, workload, findings"
        placeholder="Ask about security posture, analyst workload, findings, or generate reports..."
        suggestions={[
          "What's our overall security posture?",
          'Show analyst workload',
          'Generate a report on critical findings',
        ]}
        renderOutputData={(data) => <ChartRenderer data={data} />}
      />
    </ContentLayout>
  )
}
