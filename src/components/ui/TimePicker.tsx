import * as React from "react"
import { cn } from "@/lib/utils"

function clamp(n: number, min: number, max: number) {
  if (isNaN(n)) return min
  if (n > max) return max
  if (n < min) return min
  return n
}

function wrap(n: number, min: number, max: number) {
  if (n > max) return min
  if (n < min) return max
  return n
}

function pad(n: number) {
  return n.toString().padStart(2, "0")
}

interface TimePickerSegmentProps {
  value: number
  max: number
  disabled?: boolean
  ariaLabel?: string
  onCommit: (value: number) => void
  onRightFocus?: () => void
  onLeftFocus?: () => void
}

const TimePickerSegment = React.forwardRef<HTMLInputElement, TimePickerSegmentProps>(
  ({ value, max, disabled, ariaLabel, onCommit, onRightFocus, onLeftFocus }, ref) => {
    const [flag, setFlag] = React.useState(false)
    const displayValue = pad(value)

    // Allow the user to enter the second digit within 2 seconds, otherwise start over.
    React.useEffect(() => {
      if (!flag) return
      const timer = setTimeout(() => setFlag(false), 2000)
      return () => clearTimeout(timer)
    }, [flag])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Tab") return
      e.preventDefault()

      if (e.key === "ArrowRight") {
        onRightFocus?.()
        return
      }
      if (e.key === "ArrowLeft") {
        onLeftFocus?.()
        return
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const step = e.key === "ArrowUp" ? 1 : -1
        onCommit(wrap(value + step, 0, max))
        setFlag(false)
        return
      }
      if (e.key >= "0" && e.key <= "9") {
        const newValueStr = !flag ? "0" + e.key : displayValue.slice(1, 2) + e.key
        onCommit(clamp(parseInt(newValueStr, 10), 0, max))
        if (flag) {
          onRightFocus?.()
          setFlag(false)
        } else {
          setFlag(true)
        }
      }
    }

    return (
      <input
        ref={ref}
        type="tel"
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        value={displayValue}
        onChange={(e) => e.preventDefault()}
        onKeyDown={handleKeyDown}
        className="w-[26px] bg-transparent text-center font-mono text-sm font-bold tabular-nums caret-transparent outline-none rounded-sm focus:bg-accent focus:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    )
  }
)
TimePickerSegment.displayName = "TimePickerSegment"

export interface TimePickerProps {
  /** 24-hour "HH:MM" string, or "" when unset. */
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  hourAriaLabel?: string
  minuteAriaLabel?: string
}

/**
 * Two-segment 24-hour time input (hour/minute), styled to match the app's
 * custom form controls instead of the browser's native `<input type="time">` chrome.
 */
export function TimePicker({
  value,
  onChange,
  className,
  disabled,
  hourAriaLabel = "Hour",
  minuteAriaLabel = "Minute",
}: TimePickerProps) {
  const [hour, minute] = React.useMemo(() => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return [0, 0]
    return [clamp(parseInt(match[1], 10), 0, 23), clamp(parseInt(match[2], 10), 0, 59)]
  }, [value])

  const hourRef = React.useRef<HTMLInputElement>(null)
  const minuteRef = React.useRef<HTMLInputElement>(null)

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 bg-card text-foreground border border-border rounded-md px-2 py-1.5 focus-within:border-ring transition-colors",
        className
      )}
    >
      <TimePickerSegment
        ref={hourRef}
        value={hour}
        max={23}
        disabled={disabled}
        ariaLabel={hourAriaLabel}
        onCommit={(nextHour) => onChange(`${pad(nextHour)}:${pad(minute)}`)}
        onRightFocus={() => minuteRef.current?.focus()}
      />
      <span className="text-muted-foreground font-mono text-sm select-none">:</span>
      <TimePickerSegment
        ref={minuteRef}
        value={minute}
        max={59}
        disabled={disabled}
        ariaLabel={minuteAriaLabel}
        onCommit={(nextMinute) => onChange(`${pad(hour)}:${pad(nextMinute)}`)}
        onLeftFocus={() => hourRef.current?.focus()}
      />
    </div>
  )
}
