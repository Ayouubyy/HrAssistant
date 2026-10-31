// Serializes runs of fn; a call made while a run is in progress schedules exactly one more run.
export function createSerialRunner(fn: () => Promise<void>): () => Promise<void> {
  let current: Promise<void> | null = null
  let again = false
  const loop = async (): Promise<void> => {
    do {
      again = false
      await fn()
    } while (again)
    current = null
  }
  return () => {
    if (current) {
      again = true
      return current
    }
    current = loop()
    return current
  }
}
