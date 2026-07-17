export async function runWithConcurrency(
  totalCount: number,
  concurrency: number,
  isRunning: () => boolean,
  taskFn: (index: number) => Promise<boolean | void>,
  onProgress: (completed: number, total: number) => void,
): Promise<void> {
  let completed = 0
  let nextIndex = 0

  async function worker() {
    while (isRunning()) {
      const currentIndex = nextIndex++
      if (currentIndex >= totalCount) break
      const success = await taskFn(currentIndex)
      if (success !== false) {
        completed++
        onProgress(completed, totalCount)
      }
    }
  }

  const workerCount = Math.min(concurrency, totalCount)
  const workers: Promise<void>[] = []
  for (let i = 0; i < workerCount; i++) workers.push(worker())
  await Promise.all(workers)
}
