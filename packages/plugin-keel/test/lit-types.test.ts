// keel/lit's typings for what a scene sets on its objects: checked by the type checker, and present at run time.
import { describe, expect, expectTypeOf, it } from 'vitest'
import * as lit from '../vendor/lit.mjs'
import type { LitMatrix4, LitNode, LitVector3 } from '../src/lit'

describe('keel/lit typings', () => {
  it('type draw order, culling and matrices', () => {
    expectTypeOf<LitNode['frustumCulled']>().toEqualTypeOf<boolean>()
    expectTypeOf<LitNode['renderOrder']>().toEqualTypeOf<number>()
    expectTypeOf<LitNode['matrixWorld']>().toEqualTypeOf<LitMatrix4>()
    expectTypeOf<LitVector3['applyMatrix4']>().returns.toEqualTypeOf<LitVector3>()
  })

  it('match what the objects carry', () => {
    const node: LitNode = new lit.Group()
    expect(node.frustumCulled).toBe(true)
    expect(node.renderOrder).toBe(0)
    node.position.set(1, 2, 3)
    node.updateMatrixWorld(true)
    const point: LitVector3 = new lit.Vector3(0, 0, 0)
    const at = point.applyMatrix4(node.matrixWorld)
    expect([at.x, at.y, at.z]).toEqual([1, 2, 3])
  })
})
