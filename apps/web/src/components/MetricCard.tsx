/** Reusable metric card component for dashboard views. */

import Container from '@cloudscape-design/components/container'
import Box from '@cloudscape-design/components/box'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Icon from '@cloudscape-design/components/icon'

interface MetricCardProps {
  label: string
  value: string | number
  description?: string
  trend?: 'up' | 'down'
}

export function MetricCard({ label, value, description, trend }: MetricCardProps) {
  return (
    <Container>
      <SpaceBetween size="xxs">
        <Box variant="awsui-key-label">{label}</Box>
        <Box variant="h1" fontSize="display-l">
          {String(value)}
          {trend && (
            <Box display="inline-block" margin={{ left: 'xs' }} fontSize="heading-m" color={trend === 'up' ? 'text-status-success' : 'text-status-error'}>
              <Icon name={trend === 'up' ? 'caret-up-filled' : 'caret-down-filled'} />
            </Box>
          )}
        </Box>
        {description && (
          <Box variant="small" color="text-body-secondary">{description}</Box>
        )}
      </SpaceBetween>
    </Container>
  )
}
