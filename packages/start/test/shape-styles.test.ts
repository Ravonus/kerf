import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import type { ClientRoutes, RouteShape } from '../src/run'
import { prepareRouteShape } from '../src/run/shape-preparation'

function fixture() {
  const dom = new JSDOM(
    '<!doctype html><head><meta property="csp-nonce" nonce="secret">' +
      '<style id="app">.box { min-height: 12px }</style></head>' +
      '<body><div class="box"></div><div class="other"></div></body>',
  )
  const doc = dom.window.document
  const component = () => null
  const shape = (kind: 'generated' | 'override', cssText: string[]): RouteShape => ({
    kind,
    component,
    css: null,
    cssText,
    cssStatus: 'partial',
    bytes: null,
  })
  const routes: ClientRoutes = {
    build: 'build-a',
    table: [],
    load: {},
    shapes: {
      '/generated': shape('generated', ['.box { min-height: 4px }']),
      '/custom': shape('override', ['.box { min-height: 4px }']),
      '/other': shape('override', ['.other { width: 8px }']),
      '/disabled': { kind: 'disabled', css: null, bytes: null },
      '/unknown': { kind: 'unavailable', reason: 'missing-shape', css: null, bytes: null },
    },
  }
  return { dom, doc, component, routes }
}

describe('route shape style preparation', () => {
  it('prepares generated and custom shapes in the same cascade slot with refcounts', () => {
    const f = fixture()
    try {
      const generated = prepareRouteShape(f.routes, '/generated', f.doc)!
      const custom = prepareRouteShape(f.routes, '/custom', f.doc)!
      const other = prepareRouteShape(f.routes, '/other', f.doc)!
      expect(generated.kind).toBe('generated')
      expect(custom.kind).toBe('override')
      expect(generated.component).toBe(f.component)
      expect(generated.ready).toBe(true)
      expect(generated.completeness).toBe('partial')
      expect(custom.completeness).toBe('partial')
      const styles = [...f.doc.head.querySelectorAll('style')]
      expect(styles).toHaveLength(3)
      expect(styles.map((style) => style.id)).toEqual(['', '', 'app'])
      expect(styles[0]!.nonce).toBe('secret')
      expect(styles[0]!.textContent).toContain('min-height')
      expect(styles[1]!.textContent).toContain('width')
      expect(f.dom.window.getComputedStyle(f.doc.querySelector('.box')!).minHeight).toBe('12px')
      expect(f.dom.window.getComputedStyle(f.doc.querySelector('.other')!).width).toBe('8px')
      generated.release()
      generated.release()
      expect(f.doc.head.querySelectorAll('style')).toHaveLength(3)
      custom.release()
      expect(f.doc.head.querySelectorAll('style')).toHaveLength(2)
      other.release()
      expect([...f.doc.head.querySelectorAll('style')].map((style) => style.id)).toEqual(['app'])
    } finally {
      f.dom.window.close()
    }
  })

  it('does not mark a blocked stylesheet ready', () => {
    const f = fixture()
    try {
      const create = f.doc.createElement.bind(f.doc)
      Object.defineProperty(f.doc, 'createElement', {
        configurable: true,
        value: (name: string) => {
          const element = create(name)
          if (name === 'style') Object.defineProperty(element, 'sheet', { value: null })
          return element
        },
      })
      expect(prepareRouteShape(f.routes, '/generated', f.doc)).toBeNull()
      expect([...f.doc.head.querySelectorAll('style')].map((style) => style.id)).toEqual(['app'])
    } finally {
      f.dom.window.close()
    }
  })

  it('refuses unavailable shapes and styles with unresolved imports', () => {
    const f = fixture()
    try {
      expect(prepareRouteShape(f.routes, '/disabled', f.doc)).toBeNull()
      expect(prepareRouteShape(f.routes, '/unknown', f.doc)).toBeNull()
      expect(prepareRouteShape(f.routes, '/missing', f.doc)).toBeNull()
      const shape = f.routes.shapes!['/generated']!
      if (shape.kind !== 'generated') throw new Error('fixture')
      shape.cssText = ['@import url("/late.css"); .box { width: 1px }']
      expect(prepareRouteShape(f.routes, '/generated', f.doc)).toBeNull()
      expect([...f.doc.head.querySelectorAll('style')].map((style) => style.id)).toEqual(['app'])
    } finally {
      f.dom.window.close()
    }
  })

  it('does not share sheets across build identities and releases only owned sheets', () => {
    const f = fixture()
    try {
      const foreign = f.doc.createElement('style')
      foreign.setAttribute('data-kerf-shape-style', '')
      f.doc.head.insertBefore(foreign, f.doc.querySelector('#app'))
      const first = prepareRouteShape(f.routes, '/generated', f.doc)!
      const second = prepareRouteShape({ ...f.routes, build: 'build-b' }, '/custom', f.doc)!
      expect(f.doc.head.querySelectorAll('style')).toHaveLength(4)
      expect([...f.doc.head.querySelectorAll('style')][2]).toBe(foreign)
      first.release()
      expect(f.doc.head.querySelectorAll('style')).toHaveLength(3)
      second.release()
      expect(f.doc.querySelector('#app')).not.toBeNull()
      expect(foreign.isConnected).toBe(true)
    } finally {
      f.dom.window.close()
    }
  })
})

describe('thin generated shapes', () => {
  it('stand in a page outline for a page and pass through for a layout', async () => {
    const { PageSkeleton, PassThroughSkeleton } = await import('../src/run/page-skeleton')
    const f = fixture()
    try {
      const thin = { ...f.routes.shapes!['/generated']!, thin: true } as RouteShape
      f.routes.shapes = { ...f.routes.shapes, '/thin': thin, 'layout:/docs': thin }
      expect(prepareRouteShape(f.routes, '/thin', f.doc)!.component).toBe(PageSkeleton)
      expect(prepareRouteShape(f.routes, 'layout:/docs', f.doc)!.component).toBe(
        PassThroughSkeleton,
      )
      expect(prepareRouteShape(f.routes, '/generated', f.doc)!.component).toBe(f.component)
    } finally {
      f.dom.window.close()
    }
  })
})
