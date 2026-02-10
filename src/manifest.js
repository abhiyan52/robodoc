const toWorkflowType = (contextKey) => {
  if (!contextKey) return ''
  return contextKey.replace(/\s+/g, '_').toLowerCase()
}

const createWorkflowId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `wf_${Date.now()}`
}

export function buildManifest({
  robot,
  context,
  checklist,
  uploadsByStep,
  workflowStartedAt,
  bucket,
  completedAt,
}) {
  const requiredSteps = checklist.filter((step) => step.required)
  const completedRequiredSteps = requiredSteps.filter(
    (step) => uploadsByStep[step.id]?.length > 0
  ).length
  const totalPhotos = Object.values(uploadsByStep).reduce(
    (sum, list) => sum + list.length,
    0
  )

  return {
    schema_version: '1.0',
    workflow: {
      id: createWorkflowId(),
      type: toWorkflowType(context),
      status: 'completed',
      started_at: workflowStartedAt || new Date().toISOString(),
      completed_at: completedAt,
    },
    robot: {
      serial: robot.serial,
      type: robot.type,
    },
    storage: {
      bucket,
      base_path: `${robot.type}/${robot.serial}/${context}`,
    },
    checklist: {
      total_steps: checklist.length,
      required_steps: requiredSteps.length,
      completed_required_steps: completedRequiredSteps,
    },
    steps: checklist.map((step) => ({
      step_id: String(step.id),
      label: step.label,
      required: step.required,
      photos: (uploadsByStep[step.id] || []).map((photo) => ({
        file_name: photo.name,
        path: photo.path,
        captured_at: photo.capturedAt,
        size_bytes: photo.sizeBytes,
        mime_type: photo.mimeType,
      })),
    })),
    summary: {
      total_photos: totalPhotos,
      all_required_steps_completed:
        requiredSteps.length > 0 && completedRequiredSteps === requiredSteps.length,
      notes: null,
    },
    integrity: {
      generated_by: 'robodoc-prototype',
      generated_at: new Date().toISOString(),
    },
  }
}
