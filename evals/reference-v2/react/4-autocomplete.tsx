import { useEffect, useState } from 'react'

type Props = {
  search: (q: string, signal: AbortSignal) => Promise<string[]>
  onPick: (city: string) => void
}

export function CityPicker({ search, onPick }: Props) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<string[] | null>(null)
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setOptions(null)
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      search(q, ctrl.signal).then(
        (r) => {
          if (!ctrl.signal.aborted) {
            setOptions(r)
            setActive(-1)
          }
        },
        () => {},
      )
    }, 250)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query, search])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!options) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Escape') setOptions(null)
    else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      const city = options[active]
      setText(city)
      setOptions(null)
      onPick(city)
    }
  }
  return (
    <div>
      <label>
        City{' '}
        <input
          value={text}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setText(e.target.value)
            setQuery(e.target.value)
          }}
        />
      </label>
      {options && (
        <ul role="listbox">
          {options.map((o, i) => (
            <li key={o} role="option" aria-selected={i === active}>
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
