export function StatusBanner({
  type,
  children,
}: {
  type: 'info' | 'success' | 'error' | 'warning'
  children: string
}) {
  if (!children) return null
  return <div className={`banner ${type}`}>{children}</div>
}
