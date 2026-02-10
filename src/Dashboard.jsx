import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import './App.css'
import { supabase, SUPABASE_BUCKET } from './supabaseClient'

function getFolders(entries) {
  return (entries || []).filter((entry) => !entry.metadata).map((entry) => entry.name)
}

function getFiles(entries) {
  return (entries || []).filter((entry) => !!entry.metadata)
}

function isImageFile(file) {
  const mime = file?.metadata?.mimetype || ''
  if (mime.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file?.name || '')
}

function Dashboard() {
  const [robotTypes, setRobotTypes] = useState([])
  const [serials, setSerials] = useState([])
  const [contexts, setContexts] = useState([])
  const [files, setFiles] = useState([])
  const [selectedType, setSelectedType] = useState('')
  const [selectedSerial, setSelectedSerial] = useState('')
  const [selectedContext, setSelectedContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloadingFileName, setDownloadingFileName] = useState('')
  const [previewUrls, setPreviewUrls] = useState({})
  const [error, setError] = useState('')

  const activePath = useMemo(() => {
    const parts = [selectedType, selectedSerial, selectedContext].filter(Boolean)
    return parts.length ? `${SUPABASE_BUCKET}/${parts.join('/')}/` : `${SUPABASE_BUCKET}/`
  }, [selectedType, selectedSerial, selectedContext])

  const listAtPath = async (path) => {
    const { data, error: listError } = await supabase.storage.from(SUPABASE_BUCKET).list(path, {
      limit: 200,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (listError) throw listError
    return data || []
  }

  useEffect(() => {
    async function loadRobotTypes() {
      if (!supabase) {
        setError('Missing Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
        return
      }
      setLoading(true)
      setError('')
      try {
        const entries = await listAtPath('')
        setRobotTypes(getFolders(entries))
      } catch (err) {
        setError(err.message || 'Failed to load folders.')
      } finally {
        setLoading(false)
      }
    }
    loadRobotTypes()
  }, [])

  useEffect(() => {
    async function loadSerials() {
      if (!selectedType) {
        setSerials([])
        setSelectedSerial('')
        return
      }
      setLoading(true)
      setError('')
      try {
        const entries = await listAtPath(selectedType)
        setSerials(getFolders(entries))
      } catch (err) {
        setError(err.message || 'Failed to load serial folders.')
      } finally {
        setLoading(false)
      }
    }
    loadSerials()
  }, [selectedType])

  useEffect(() => {
    async function loadContexts() {
      if (!selectedType || !selectedSerial) {
        setContexts([])
        setSelectedContext('')
        return
      }
      setLoading(true)
      setError('')
      try {
        const entries = await listAtPath(`${selectedType}/${selectedSerial}`)
        setContexts(getFolders(entries))
      } catch (err) {
        setError(err.message || 'Failed to load context folders.')
      } finally {
        setLoading(false)
      }
    }
    loadContexts()
  }, [selectedType, selectedSerial])

  useEffect(() => {
    async function loadFiles() {
      if (!selectedType || !selectedSerial || !selectedContext) {
        setFiles([])
        return
      }
      setLoading(true)
      setError('')
      try {
        const path = `${selectedType}/${selectedSerial}/${selectedContext}`
        const entries = await listAtPath(path)
        setFiles(getFiles(entries))
      } catch (err) {
        setError(err.message || 'Failed to load files.')
      } finally {
        setLoading(false)
      }
    }
    loadFiles()
  }, [selectedType, selectedSerial, selectedContext])

  useEffect(() => {
    async function loadPreviews() {
      if (!supabase || !selectedType || !selectedSerial || !selectedContext || files.length === 0) {
        setPreviewUrls({})
        return
      }

      const imageFiles = files.filter((file) => isImageFile(file))
      if (imageFiles.length === 0) {
        setPreviewUrls({})
        return
      }

      const nextPreviewUrls = {}

      await Promise.all(
        imageFiles.map(async (file) => {
          const objectPath = `${selectedType}/${selectedSerial}/${selectedContext}/${file.name}`
          const { data, error: signedError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .createSignedUrl(objectPath, 60 * 60)

          if (!signedError && data?.signedUrl) {
            nextPreviewUrls[file.name] = data.signedUrl
          }
        })
      )

      setPreviewUrls(nextPreviewUrls)
    }

    loadPreviews()
  }, [files, selectedType, selectedSerial, selectedContext])

  const downloadFile = async (fileName) => {
    if (!supabase) return

    const objectPath = `${selectedType}/${selectedSerial}/${selectedContext}/${fileName}`
    setError('')
    setDownloadingFileName(fileName)

    try {
      const { data: blob, error: downloadError } = await supabase.storage.from(SUPABASE_BUCKET).download(objectPath)
      if (downloadError || !blob) {
        throw downloadError || new Error('Could not download file.')
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'Failed to download file.')
    } finally {
      setDownloadingFileName('')
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="app-kicker">RoboDoc Prototype</p>
          <h1>Storage Dashboard</h1>
        </div>
        <div className="inline-actions compact">
          <Link className="ghost link-button" to="/">
            Guided Upload
          </Link>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>Uploaded Folders</h2>
          <p className="panel-sub">
            Browse folders and files in bucket <code>{SUPABASE_BUCKET}</code>.
          </p>

          <div className="dashboard-grid">
            <div className="dashboard-column">
              <h3>Robot Type</h3>
              {robotTypes.map((name) => (
                <button
                  key={name}
                  className={selectedType === name ? 'folder-item active' : 'folder-item'}
                  onClick={() => {
                    setSelectedType(name)
                    setSelectedSerial('')
                    setSelectedContext('')
                    setFiles([])
                  }}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="dashboard-column">
              <h3>Serial</h3>
              {serials.map((name) => (
                <button
                  key={name}
                  className={selectedSerial === name ? 'folder-item active' : 'folder-item'}
                  onClick={() => {
                    setSelectedSerial(name)
                    setSelectedContext('')
                    setFiles([])
                  }}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="dashboard-column">
              <h3>Context</h3>
              {contexts.map((name) => (
                <button
                  key={name}
                  className={selectedContext === name ? 'folder-item active' : 'folder-item'}
                  onClick={() => setSelectedContext(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="path-row">
            <strong>Current path:</strong> <code>{activePath}</code>
          </div>

          {loading && <p className="hint">Loading...</p>}
          {error && <p className="error">{error}</p>}

          {selectedContext && (
            <div className="file-list">
              <h3>Files</h3>
              {files.length === 0 && !loading && <p className="hint">No files found in this folder.</p>}
              <div className="preview-grid">
                {files.map((file) => (
                  <article key={file.name} className="preview-card">
                    <div className="preview-media">
                      {isImageFile(file) && previewUrls[file.name] ? (
                        <img src={previewUrls[file.name]} alt={file.name} />
                      ) : (
                        <div className="preview-placeholder">No preview</div>
                      )}
                    </div>
                    <p className="preview-name">{file.name}</p>
                    <div className="preview-footer">
                      <em>{file.metadata?.size || 0} bytes</em>
                      <button
                        type="button"
                        className="ghost download-btn"
                        onClick={() => downloadFile(file.name)}
                        disabled={downloadingFileName === file.name}
                      >
                        {downloadingFileName === file.name ? 'Downloading...' : 'Download'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default Dashboard
