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

function Dashboard() {
  const [robotTypes, setRobotTypes] = useState([])
  const [serials, setSerials] = useState([])
  const [contexts, setContexts] = useState([])
  const [files, setFiles] = useState([])
  const [selectedType, setSelectedType] = useState('')
  const [selectedSerial, setSelectedSerial] = useState('')
  const [selectedContext, setSelectedContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [openingFileName, setOpeningFileName] = useState('')
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

  const openFile = async (fileName) => {
    if (!supabase) return

    const objectPath = `${selectedType}/${selectedSerial}/${selectedContext}/${fileName}`
    setError('')
    setOpeningFileName(fileName)

    try {
      const { data, error: signedError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(objectPath, 60 * 60)

      if (!signedError && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
        return
      }

      // Fallback for public buckets.
      const { data: publicData } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(objectPath)
      if (publicData?.publicUrl) {
        window.open(publicData.publicUrl, '_blank', 'noopener,noreferrer')
        return
      }

      throw signedError || new Error('Could not create a URL for this file.')
    } catch (err) {
      setError(err.message || 'Failed to open file.')
    } finally {
      setOpeningFileName('')
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
              {files.map((file) => (
                <button
                  key={file.name}
                  type="button"
                  className="file-item"
                  onClick={() => openFile(file.name)}
                  disabled={openingFileName === file.name}
                >
                  <span>{openingFileName === file.name ? 'Opening...' : file.name}</span>
                  <em>{file.metadata?.size || 0} bytes</em>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default Dashboard
