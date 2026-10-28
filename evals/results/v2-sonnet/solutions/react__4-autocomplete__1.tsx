import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'

export interface CityPickerProps {
  search: (query: string, signal: AbortSignal) => Promise<string[]>
  onPick: (city: string) => void
}

export function CityPicker({ search, onPick }: CityPickerProps) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const searchRef = useRef(search)
  searchRef.current = search
  const id = useId()
  const inputId = `${id}-input`
  const listId = `${id}-list`

  useEffect(() => {
    if (query.trim() === '') {
      setOptions([])
      setActive(-1)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchRef.current(query, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return
          setOptions(result)
          setActive(-1)
        },
        () => {
          if (controller.signal.aborted) return
          setOptions([])
          setActive(-1)
        },
      )
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setText(v)
    setQuery(v)
    setOpen(true)
    setActive(-1)
    if (v.trim() === '') setOptions([])
  }

  const pick = (city: string) => {
    setText(city)
    setOpen(false)
    setActive(-1)
    setOptions([])
    // cancel any pending/in-flight lookup for the old text
    setQuery('')
    onPick(city)
  }

  const showList = open && options.length > 0

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (options.length === 0) return
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      if (options.length === 0) return
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1))
    } else if (e.key === 'Enter') {
      if (showList && active >= 0 && active < options.length) {
        e.preventDefault()
        pick(options[active])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div>
      <label htmlFor={inputId}>City</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="City suggestions">
          {options.map((city, i) => (
            <li
              key={`${city}-${i}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(city)}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
