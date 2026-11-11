import { state } from '@kerf-js/core'
import { render } from '@kerf-js/core/test'
import { SaveBar } from '../../src/admin/SaveBar'
import { Input } from '../../src/Field'
import { Toaster } from '../../src/Toast'
import { byText, dialog, tick, toasts, type } from './support'

function suiteContext() {
  const mount = (
    onSave: Parameters<typeof SaveBar<{ name: string }>>[0]['onSave'] = () => {},
    validate?: (v: { name: string }) => Record<string, string>,
  ) => {
    const values = state({ name: 'Ines' })
    const errors = state<Record<string, string>>({})
    const view = render(() => (
      <>
        <form>
          <Input
            label="Name"
            value={values.value.name}
            error={errors.value.name ?? ''}
            onInput={(e) => (values.value = { name: e.currentTarget.value })}
          />
          <SaveBar values={values} errors={errors} onSave={onSave} validate={validate} />
        </form>
        <Toaster />
      </>
    ))
    const bar = () => view.container.querySelector<HTMLElement>('[data-scope="save-bar"]')!
    return {
      values,
      errors,
      bar,
      c: view.container,
      input: view.container.querySelector<HTMLInputElement>('input')!,
    }
  }
  return { mount }
}

function registerRisesWhenDirtyGoesWhen(ctx: ReturnType<typeof suiteContext>) {
  const { mount } = ctx
  test('rises when dirty, goes when the diff is undone, Discard restores', async () => {
    const { bar, input, values, c } = mount()
    expect(bar().hasAttribute('data-open')).toBe(false)
    type(input, 'Ada')
    await tick()
    expect(bar().hasAttribute('data-open')).toBe(true)
    type(input, 'Ines')
    await tick()
    expect(bar().hasAttribute('data-open')).toBe(false)
    type(input, 'Ada')
    await tick()
    byText(c, 'Discard').click()
    await tick()
    expect(values.value.name).toBe('Ines')
    expect(bar().hasAttribute('data-open')).toBe(false)
  })
  test('pending, then Saved, and the new values are the snapshot', async () => {
    let done!: () => void
    const { bar, input, c } = mount(
      () =>
        new Promise<void>((r) => {
          done = r
        }),
    )
    type(input, 'Ada')
    await tick()
    byText(c, 'Save changes').click()
    await tick()
    expect(byText(c, 'Save changes').hasAttribute('data-loading')).toBe(true)
    done()
    await tick()
    expect(bar().querySelector('[role="status"]')!.textContent).toBe('Saved')
    expect(bar().hasAttribute('data-open')).toBe(true)
  })
  test('field errors keep the bar and focus the first invalid field', async () => {
    const { bar, input, c } = mount(undefined, (v) => (v.name ? {} : { name: 'Add a name.' }))
    type(input, '')
    await tick()
    byText(c, 'Save changes').click()
    await tick()
    expect(bar().querySelector('[role="status"]')!.textContent).toBe('Fix 1 field to save')
    expect(document.activeElement).toBe(input)
  })
  test('a transport failure keeps the values and offers Retry', async () => {
    const { input, c } = mount(() => Promise.reject(new Error('net')))
    type(input, 'Ada')
    await tick()
    byText(c, 'Save changes').click()
    await tick()
    expect(toasts()).toContain('That didn’t save')
    expect(input.value).toBe('Ada')
  })
}

function registerALinkPressWhileDirty() {
  test('a link press while dirty asks first', async () => {
    const left: string[] = []
    const values = state({ a: 1 })
    const view = render(() => (
      <div>
        <a href="/away">Away</a>
        <SaveBar values={values} onSave={() => {}} onLeave={(h) => left.push(h)} />
      </div>
    ))
    values.value = { a: 2 }
    await tick()
    byText(view.container, 'Away').click()
    await tick()
    expect(dialog().getAttribute('role')).toBe('alertdialog')
    expect(document.activeElement!.textContent).toContain('Stay')
    byText(dialog(), 'Discard and leave').click()
    await tick()
    expect(left).toEqual(['/away'])
  })
}

export function registerSaveBar() {
  describe('SaveBar', () => {
    const ctx = suiteContext()
    registerRisesWhenDirtyGoesWhen(ctx)
    registerALinkPressWhileDirty()
  })
}
