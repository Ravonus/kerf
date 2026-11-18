import { expect, test } from 'vitest'
import { callById, createScope } from '../src/exec'

test('the executor reports a missing function with Q009 and 404', async () => {
  const scope = createScope(new Request('http://localhost'))
  await expect(callById(scope, 'missing-function', null)).rejects.toMatchObject({
    code: 'Q009',
    status: 404,
  })
})
