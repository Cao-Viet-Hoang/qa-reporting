// Holds the active data backend (Firestore or local demo). Both implement the same interface:
//
// catalog.list(type)                      -> [{ id, name, active }]
// catalog.add(type, name)                 -> { id, name, active }
// catalog.update(type, id, patch)         -> void
// catalog.ensureSeed(type, entries)       -> number of docs created   (entries: [{ id, name }])
// reports.newId()                         -> string
// reports.list({ from, to })              -> report docs, newest date first
// reports.get(id)                         -> report doc | null
// reports.save(id, data, { isNew })       -> { updatedAt }
// reports.remove(id)                      -> void
// images.put(imageId, chunks, reportId)   -> void   (meta + chunks in one atomic batch)
// images.getMeta(imageId)                 -> { chunkCount, reportId } | null
// images.getData(imageId)                 -> base64 string (chunks joined in order)
// images.remove(imageId)                  -> void   (chunks + meta)

let active = null;

export function setBackend(backend) { active = backend; }

export function backend() {
  if (!active) throw new Error('Backend not initialized');
  return active;
}

export function hasBackend() { return active !== null; }
