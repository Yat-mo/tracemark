import { useEffect, useRef } from 'react'
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  LineController,
  LineElement,
  PointElement,
  Filler,
} from 'chart.js'
import { bucketDistribution } from '../../lib/scoring'

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  LineController,
  LineElement,
  PointElement,
  Filler,
)

export function DistributionChart({
  series,
}: {
  series: Array<{
    label: string
    distribution: number[]
    type?: 'bar' | 'line'
    color?: string
    border?: string
  }>
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current || !series.length) return
    const first = bucketDistribution(series[0].distribution)
    const labels = first.labels
    const style = getComputedStyle(document.documentElement)
    const tick = style.getPropertyValue('--label-secondary').trim() || '#888'
    const grid = style.getPropertyValue('--separator').trim() || 'rgba(0,0,0,0.1)'

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: series.map((s, i) => {
          const b = bucketDistribution(s.distribution)
          const defaultColors = [
            {
              bg: style.getPropertyValue('--chart-1').trim() || 'rgba(10,132,255,0.55)',
              border: style.getPropertyValue('--chart-1-border').trim() || '#0a84ff',
            },
            {
              bg: style.getPropertyValue('--chart-2').trim() || 'rgba(175,82,222,0.45)',
              border: style.getPropertyValue('--chart-2-border').trim() || '#af52de',
            },
          ]
          const c = defaultColors[i % defaultColors.length]
          return {
            type: s.type || 'bar',
            label: s.label,
            data: b.values,
            backgroundColor: s.color || c.bg,
            borderColor: s.border || c.border,
            borderWidth: s.type === 'line' ? 2 : 1,
            fill: s.type === 'line',
            tension: 0.3,
            pointRadius: 0,
            order: i,
          }
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: '頻率', color: tick },
            ticks: { color: tick },
            grid: { color: grid },
          },
          x: {
            title: { display: true, text: '數字範圍', color: tick },
            ticks: { color: tick, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
            grid: { color: grid },
          },
        },
        plugins: {
          legend: { position: 'top', labels: { color: tick } },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [series])

  return (
    <div className="chart-box">
      <canvas ref={canvasRef} />
    </div>
  )
}
