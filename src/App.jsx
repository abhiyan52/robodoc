import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './App.css'
import { supabase, SUPABASE_BUCKET } from './supabaseClient'
import { buildManifest } from './manifest'
import checklists from './assets/checklists.json'

const CONTEXTS = [
  { key: 'Incoming', label: 'Incoming Goods', enabled: true },
  { key: 'Analysis', label: 'Analysis', enabled: false },
  { key: 'Assembly', label: 'Assembly', enabled: false },
  { key: 'Delivery', label: 'Delivery', enabled: false },
]

const getChecklistFor = (context, type) => {
  const byContext = checklists?.[context]
  if (!byContext) return []
  return byContext[type] || byContext.SCARA || []
}

function generateFileName(serial, context, step, index) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${serial}_${context}_${step}_${index}_${timestamp}.jpg`
}

function formatStepForName(label) {
  return label
    .replace(/\(.*?\)/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
}

function App() {
  const [screen, setScreen] = useState(0)
  const [robotSerial, setRobotSerial] = useState('')
  const [robotType, setRobotType] = useState('SCARA')
  const [contextKey, setContextKey] = useState('')
  const [workflowStartedAt, setWorkflowStartedAt] = useState('')
  const [checklist, setChecklist] = useState([])
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [photosByStep, setPhotosByStep] = useState({})
  const [uploadingStepId, setUploadingStepId] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [manifestError, setManifestError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const photosRef = useRef({})

  const activeStep = checklist[currentStepIndex]

  const completeness = useMemo(() => {
    const required = checklist.filter((step) => step.required)
    const missing = required.filter(
      (step) => !(photosByStep[step.id] && photosByStep[step.id].length > 0)
    )
    const totalPhotos = Object.values(photosByStep).reduce(
      (sum, list) => sum + list.length,
      0
    )
    return {
      requiredCount: required.length,
      missingCount: missing.length,
      totalPhotos,
      complete: required.length > 0 && missing.length === 0,
    }
  }, [checklist, photosByStep])

  useEffect(() => {
    photosRef.current = photosByStep
  }, [photosByStep])

  useEffect(() => {
    return () => {
      Object.values(photosRef.current).flat().forEach((photo) => {
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl)
      })
    }
  }, [])

  useEffect(() => {
    if (!saveSuccess) return undefined
    const timer = setTimeout(() => setSaveSuccess(false), 4000)
    return () => clearTimeout(timer)
  }, [saveSuccess])

  const startEnabled = robotSerial.trim().length > 0 && robotType

  const handleStart = () => {
    setWorkflowStartedAt(new Date().toISOString())
    setScreen(1)
  }

  const handleContextSelect = (ctx) => {
    setContextKey(ctx.key)
    setChecklist(getChecklistFor(ctx.key, robotType))
    setCurrentStepIndex(0)
    setPhotosByStep({})
    setScreen(2)
  }

  const resetSession = () => {
    setRobotSerial('')
    setRobotType('SCARA')
    setContextKey('')
    setWorkflowStartedAt('')
    setChecklist([])
    setCurrentStepIndex(0)
    setPhotosByStep({})
    setUploadingStepId(null)
    setUploadError('')
    setScreen(0)
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !activeStep) return

    setUploadError('')

    if (!supabase) {
      setUploadError('Missing Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    const stepToken = formatStepForName(activeStep.label)
    const stepPhotos = photosByStep[activeStep.id] || []
    const nextIndex = stepPhotos.length + 1
    const fileName = generateFileName(robotSerial, contextKey, stepToken, nextIndex)
    const path = `${robotType}/${robotSerial}/${contextKey}/${fileName}`

    setUploadingStepId(activeStep.id)
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: file.type || 'image/jpeg',
      })

    if (error) {
      setUploadingStepId(null)
      if (error.message?.toLowerCase().includes('bucket not found')) {
        setUploadError(
          `Bucket "${SUPABASE_BUCKET}" not found. Create it in Supabase Storage or set VITE_SUPABASE_BUCKET to an existing bucket.`
        )
      } else {
        setUploadError(error.message)
      }
      return
    }

    const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path)
    const previewUrl = URL.createObjectURL(file)
    const capturedAt = new Date().toISOString()
    const sizeBytes = file.size
    const mimeType = file.type || 'image/jpeg'

    setPhotosByStep((prev) => {
      const current = prev[activeStep.id] || []
      return {
        ...prev,
        [activeStep.id]: [
          ...current,
          {
            name: fileName,
            path,
            url: data?.publicUrl || '',
            previewUrl,
            capturedAt,
            sizeBytes,
            mimeType,
          },
        ],
      }
    })
    setUploadingStepId(null)
  }

  const handleFinish = async () => {
    setManifestError('')
    if (!supabase) {
      setManifestError(
        'Missing Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      )
      return
    }

    const completedAt = new Date().toISOString()
    // Capture a self-contained record of this run before clearing local state.
    const manifest = buildManifest({
      robot: { serial: robotSerial, type: robotType },
      context: contextKey,
      checklist,
      uploadsByStep: photosByStep,
      workflowStartedAt,
      bucket: SUPABASE_BUCKET,
      completedAt,
    })
    const basePath = `${robotType}/${robotSerial}/${contextKey}`
    const manifestPath = `${basePath}/manifest.json`
    const storage = supabase.storage.from(SUPABASE_BUCKET)

    // Edit-only flow: manifest must already exist to avoid insert RLS failures.
    const { data: existingManifestBlob, error: readError } = await storage.download(manifestPath)
    if (readError) {
      const readMessage = (readError.message || '').toLowerCase()
      const isMissingManifest =
        readError.statusCode === '404' ||
        readError.statusCode === 404 ||
        readMessage.includes('not found')

      if (isMissingManifest) {
        setManifestError(
          `Manifest update skipped: ${manifestPath} does not exist yet. Create it once (with insert permission), then future runs can edit it.`
        )
      } else {
        setManifestError(`Manifest read failed: ${readError.message}`)
      }
      return
    }

    let manifestToSave = manifest
    if (existingManifestBlob) {
      try {
        const existingText = await existingManifestBlob.text()
        const existingManifest = JSON.parse(existingText)

        manifestToSave = {
          ...manifest,
          workflow: {
            ...manifest.workflow,
            // Preserve workflow id/start from the first manifest, if present.
            id: existingManifest?.workflow?.id || manifest.workflow.id,
            started_at: existingManifest?.workflow?.started_at || manifest.workflow.started_at,
          },
        }
      } catch {
        // If existing JSON is malformed, overwrite with a fresh valid manifest.
      }
    }

    const payload = JSON.stringify(manifestToSave, null, 2)
    const manifestFile = new Blob([payload], { type: 'application/json' })

    const { error: updateError } = await storage.update(manifestPath, manifestFile, {
      contentType: 'application/json',
    })

    if (updateError) {
      setManifestError(`Manifest update failed: ${updateError.message}`)
      return
    }

    setSaveSuccess(true)
    resetSession()
  }

  const goNextStep = () => {
    if (currentStepIndex < checklist.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      setScreen(3)
    }
  }

  const goPrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    } else {
      setScreen(1)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="app-kicker">RoboDoc Prototype</p>
          <h1>Guided Documentation</h1>
        </div>
        <div className="header-actions">
          <div className="status-chip">
            <span>Photos</span>
            <strong>{completeness.totalPhotos}</strong>
          </div>
          <Link className="ghost link-button" to="/dashboard">
            Open Dashboard
          </Link>
        </div>
      </header>

      <main className="app-main">
        {saveSuccess && <div className="toast">Records saved successfully.</div>}
        {screen === 0 && (
          <section className="panel">
            <h2>Start / Identification</h2>
            <p className="panel-sub">
              Anchor the session to a robot. In production this would validate against ERP.
            </p>
            {manifestError && <p className="error">{manifestError}</p>}
            <div className="field">
              <label htmlFor="serial">Robot Serial Number</label>
              <input
                id="serial"
                type="text"
                value={robotSerial}
                onChange={(event) => setRobotSerial(event.target.value)}
                placeholder="e.g. 2525"
              />
            </div>
            <div className="field">
              <label>Robot Type</label>
              <div className="choice-row">
                {['SCARA', 'IVR'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={robotType === type ? 'choice active' : 'choice'}
                    onClick={() => setRobotType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <button className="primary" onClick={handleStart} disabled={!startEnabled}>
              Start Documentation
            </button>
          </section>
        )}

        {screen === 1 && (
          <section className="panel">
            <h2>Context Selection</h2>
            <p className="panel-sub">Select the workflow context to load the right checklist.</p>
            <div className="context-grid">
              {CONTEXTS.map((ctx) => (
                <button
                  key={ctx.key}
                  type="button"
                  className={ctx.enabled ? 'context-card' : 'context-card disabled'}
                  onClick={() => ctx.enabled && handleContextSelect(ctx)}
                  disabled={!ctx.enabled}
                >
                  <span>{ctx.label}</span>
                  {!ctx.enabled && <em>Placeholder</em>}
                </button>
              ))}
            </div>
            <div className="inline-actions">
              <button className="ghost" onClick={() => setScreen(0)}>
                Back
              </button>
            </div>
          </section>
        )}

        {screen === 2 && activeStep && (
          <section className="panel">
            <div className="step-header">
              <div>
                <p className="step-count">
                  Step {currentStepIndex + 1} of {checklist.length}
                </p>
                <h2>{activeStep.label}</h2>
                <p className="panel-sub">
                  Required: {activeStep.required ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="completeness">
                <span>Required complete</span>
                <strong>
                  {completeness.requiredCount - completeness.missingCount}/
                  {completeness.requiredCount}
                </strong>
              </div>
            </div>

            <div className="upload-area">
              <label className="upload-button">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleUpload}
                  disabled={uploadingStepId === activeStep.id}
                />
                {uploadingStepId === activeStep.id ? 'Uploading…' : 'Take Photo'}
              </label>
              <p className="hint">
                Files upload to: <code>{SUPABASE_BUCKET}/{robotType}/{robotSerial}/{contextKey}/</code>
              </p>
              {uploadError && <p className="error">{uploadError}</p>}
            </div>

            <div className="thumb-grid">
              {(photosByStep[activeStep.id] || []).map((photo) => (
                <div key={photo.name} className="thumb-card">
                  <img src={photo.previewUrl || photo.url} alt={photo.name} />
                  <p>{photo.name}</p>
                  <span>{photo.path}</span>
                </div>
              ))}
            </div>

            <div className="inline-actions">
              <button className="ghost" onClick={goPrevStep}>
                Previous
              </button>
              <button
                className="primary"
                onClick={goNextStep}
                disabled={
                  uploadingStepId === activeStep.id ||
                  (activeStep.required && !(photosByStep[activeStep.id]?.length > 0))
                }
              >
                {currentStepIndex === checklist.length - 1 ? 'Review' : 'Next'}
              </button>
            </div>
          </section>
        )}

        {screen === 3 && (
          <section className="panel">
            <h2>Summary / Completeness</h2>
            <p className="panel-sub">
              Checklist status for {robotType} {robotSerial} · {contextKey}
            </p>
            <div className="summary-grid">
              {checklist.map((step) => {
                const hasPhoto = photosByStep[step.id]?.length > 0
                return (
                  <div key={step.id} className="summary-item">
                    <span>{step.label}</span>
                    {uploadingStepId === step.id ? (
                      <strong className="pending">Uploading…</strong>
                    ) : (
                      <strong className={hasPhoto ? 'ok' : 'bad'}>
                        {hasPhoto ? '✅' : '❌'}
                      </strong>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="summary-meta">
              <div>
                <span>Total photos</span>
                <strong>{completeness.totalPhotos}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong className={completeness.complete ? 'ok' : 'bad'}>
                  {completeness.complete ? 'Complete' : 'Incomplete'}
                </strong>
              </div>
            </div>
            <div className="inline-actions">
              <button className="ghost" onClick={() => setScreen(2)}>
                Back to Checklist
              </button>
              <button className="primary" onClick={handleFinish}>
                Finish
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
