import { useState, useRef, useCallback, useEffect } from 'react'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import FormField from '@cloudscape-design/components/form-field'
import Select, { SelectProps } from '@cloudscape-design/components/select'
import Button from '@cloudscape-design/components/button'
import Alert from '@cloudscape-design/components/alert'
import ProgressBar from '@cloudscape-design/components/progress-bar'
import Table from '@cloudscape-design/components/table'
import Box from '@cloudscape-design/components/box'
import StatusIndicator from '@cloudscape-design/components/status-indicator'
import Spinner from '@cloudscape-design/components/spinner'
import { fetchUserAttributes } from 'aws-amplify/auth'
import { getPresignedUploadUrl, uploadFileToS3, listUploads } from '@/utils/api'
import type { Upload } from '@/types'

// ── Types ────────────────────────────────────────────────────────────

const SOURCE_TYPE_OPTIONS: SelectProps.Option[] = [
  { value: 'shodan-json', label: 'Shodan JSON' },
  { value: 'nmap-xml', label: 'Nmap XML' },
  { value: 'social-media-csv', label: 'Social Media CSV' },
  { value: 'log-files', label: 'Log Files' },
  { value: 'documents-pdf', label: 'Documents/PDF' },
  { value: 'custom-text', label: 'Custom Text' },
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Main component ───────────────────────────────────────────────────

export default function DataUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sourceType, setSourceType] = useState<SelectProps.Option | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loadingUploads, setLoadingUploads] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch real uploads on mount
  useEffect(() => {
    let cancelled = false
    async function fetchUploads() {
      try {
        const result = await listUploads()
        if (!cancelled) {
          setUploads(result.sort((a, b) => b.createdAt - a.createdAt))
        }
      } catch {
        if (!cancelled) {
          setUploads([])
        }
      } finally {
        if (!cancelled) setLoadingUploads(false)
      }
    }
    fetchUploads()
    return () => { cancelled = true }
  }, [])

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file)
    setAlert(null)

    // Auto-detect source type from extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'json') setSourceType(SOURCE_TYPE_OPTIONS[0])
    else if (ext === 'xml') setSourceType(SOURCE_TYPE_OPTIONS[1])
    else if (ext === 'csv') setSourceType(SOURCE_TYPE_OPTIONS[2])
    else if (ext === 'log' || ext === 'txt') setSourceType(SOURCE_TYPE_OPTIONS[3])
    else if (ext === 'pdf') setSourceType(SOURCE_TYPE_OPTIONS[4])
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !sourceType) return

    setUploading(true)
    setProgress(0)
    setAlert(null)

    try {
      // Step 1: Get presigned URL from Lambda
      setProgress(10)
      // Get actual Cognito user identity
      let analystId = 'unknown'
      try {
        const attrs = await fetchUserAttributes()
        analystId = attrs.sub ?? attrs.email ?? 'unknown'
      } catch {
        // Fall back if attributes unavailable
      }

      const { uploadUrl, uploadId } = await getPresignedUploadUrl(
        selectedFile.name,
        sourceType.value ?? 'custom-text',
        analystId,
      )

      // Step 2: Upload file to S3
      setProgress(30)
      await uploadFileToS3(uploadUrl, selectedFile)
      setProgress(100)

      // Add the new upload to the list
      const newUpload: Upload = {
        uploadId,
        analystId,
        fileName: selectedFile.name,
        sourceType: sourceType.label ?? sourceType.value ?? '',
        ingestionStatus: 'processing',
        createdAt: Date.now(),
      }
      setUploads(prev => [newUpload, ...prev])
      setAlert({ type: 'success', message: `"${selectedFile.name}" uploaded successfully. Ingestion pipeline started.` })
      setSelectedFile(null)
      setSourceType(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      console.error('Upload failed:', err)
      setAlert({ type: 'error', message: `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.` })
    } finally {
      setUploading(false)
    }
  }, [selectedFile, sourceType])

  const UPLOAD_DISABLED = true // Temporarily disabled for testing

  return (
    <SpaceBetween size="l">
      {UPLOAD_DISABLED && (
        <Alert type="info" statusIconAriaLabel="Info">
          Upload functionality is fully operational but temporarily disabled for testing purposes.
          The ingestion pipeline (S3 presigned URL, EventBridge trigger, Step Functions workflow) is active in the backend.
        </Alert>
      )}

      {alert && (
        <Alert type={alert.type} dismissible onDismiss={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {/* Upload form */}
      <Container header={<Header variant="h2" description="Upload OSINT data files for ingestion and analysis">Upload Data</Header>}>
        <SpaceBetween size="l">
          {/* Drag-and-drop zone */}
          <div
            onDragOver={UPLOAD_DISABLED ? undefined : handleDragOver}
            onDragLeave={UPLOAD_DISABLED ? undefined : handleDragLeave}
            onDrop={UPLOAD_DISABLED ? undefined : handleDrop}
            onClick={UPLOAD_DISABLED ? undefined : () => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging
                ? 'var(--color-text-link-default, #0972d3)'
                : 'var(--color-border-divider-default, #414d5c)'}`,
              borderRadius: 12,
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragging
                ? 'var(--color-background-dropdown-item-hover, rgba(9, 114, 211, 0.1))'
                : 'var(--color-background-input-default, transparent)',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          >
            <SpaceBetween size="xs" alignItems="center">
              <Box variant="h3" color={isDragging ? 'text-status-info' : 'text-body-secondary'}>
                {isDragging ? 'Drop file here' : 'Drag and drop a file here'}
              </Box>
              <Box variant="small" color="text-body-secondary">
                Supported: JSON, XML, CSV, LOG, TXT, PDF
              </Box>
              {selectedFile && (
                <Box variant="p">
                  <StatusIndicator type="success">
                    {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </StatusIndicator>
                </Box>
              )}
            </SpaceBetween>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.xml,.csv,.log,.txt,.pdf"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
          </div>

          {/* Fallback file picker button */}
          <Button
            iconName="upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Choose File
          </Button>

          {/* Source type selector */}
          <FormField label="Source Type" description="Select the format of the uploaded data">
            <Select
              selectedOption={sourceType}
              onChange={({ detail }) => setSourceType(detail.selectedOption)}
              options={SOURCE_TYPE_OPTIONS}
              placeholder="Select source type"
              disabled={uploading}
            />
          </FormField>

          {/* Upload progress */}
          {uploading && (
            <ProgressBar
              value={Math.min(progress, 100)}
              label="Uploading"
              description={selectedFile?.name}
              status="in-progress"
            />
          )}

          {/* Upload button */}
          <Button
            variant="primary"
            onClick={handleUpload}
            loading={uploading}
            disabled={UPLOAD_DISABLED || !selectedFile || !sourceType || uploading}
          >
            Upload
          </Button>
        </SpaceBetween>
      </Container>

      {/* Recent uploads table */}
      <Container header={<Header variant="h2" counter={`(${uploads.length})`}>Recent Uploads</Header>}>
        {loadingUploads ? (
          <Box textAlign="center" padding={{ vertical: 'l' }}>
            <Spinner size="large" />
            <Box variant="p" color="text-body-secondary" padding={{ top: 's' }}>Loading uploads...</Box>
          </Box>
        ) : (
          <Table
            items={uploads}
            columnDefinitions={[
              { id: 'filename', header: 'Filename', cell: item => item.fileName, width: 300 },
              { id: 'sourceType', header: 'Source Type', cell: item => item.sourceType },
              {
                id: 'status', header: 'Status',
                cell: item => {
                  switch (item.ingestionStatus) {
                    case 'completed': return <StatusIndicator type="success">Completed</StatusIndicator>
                    case 'processing': return <StatusIndicator type="in-progress">Processing</StatusIndicator>
                    case 'failed': return <StatusIndicator type="error">Failed</StatusIndicator>
                    default: return <StatusIndicator type="info">{item.ingestionStatus}</StatusIndicator>
                  }
                },
              },
              { id: 'uploadedAt', header: 'Uploaded', cell: item => new Date(item.createdAt).toLocaleString() },
            ]}
            variant="embedded"
            empty={<Box textAlign="center" color="text-body-secondary">No uploads yet</Box>}
          />
        )}
      </Container>
    </SpaceBetween>
  )
}
