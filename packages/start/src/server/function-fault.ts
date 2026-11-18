import { FnError, StartError, type Fn } from '../data'
import { hasPublicIssues } from '../data/primitives'
import type { Scope } from '../exec'
import { failureDefaults } from './failure-defaults'
import { reportFailure } from './failure'
import { snapshotJson } from './failure-value'
import { failureCode, failureMessage, publicIssues } from './public-fault'

/** The same error projection feeds RPC and native form redisplay. */
export async function functionFault(error: unknown, scope: Scope, fn: Fn, form: boolean) {
  const known = error instanceof StartError || error instanceof FnError
  const fallback = failureDefaults.E_FN.message
  const dev = scope.options.dev
  let fault = error
  let code = failureCode(known ? error.code : undefined, 'E_FN')
  const given = known ? (error.status ?? 500) : 500
  let status = Number.isInteger(given) && given >= 400 && given <= 599 ? given : 500
  let data
  if (error instanceof StartError && error.typed && status < 500) {
    try {
      const schema = fn.def.errors?.[code]
      if (!schema) throw new Error('Undeclared error')
      // The Rust adapter has already run the schema, including any transformations.
      const checked = fn.def.impl
        ? { value: error.data, issues: undefined }
        : await schema['~standard'].validate(error.data)
      if (checked.issues) throw new Error('Invalid error data')
      if (checked.value !== undefined) data = snapshotJson(checked.value)
    } catch (cause) {
      code = 'E_FN'
      status = 500
      fault = new Error(`Function ${fn.$id} returned an invalid declared error`, { cause })
    }
  }
  if (known && status < 500 && (error instanceof StartError || error instanceof FnError)) {
    const issues = publicIssues(
      error.issues,
      dev || (error instanceof StartError && hasPublicIssues(error)),
    )
    if (form && issues?.length) status = 422
    return {
      code,
      status,
      message: dev ? error.message : failureMessage(status, fallback),
      ...(issues?.length && { issues }),
      ...(data !== undefined && { data }),
    }
  }
  return reportFailure(scope, scope.options, fault, {
    status,
    code,
    route: fn.$id,
    publicMessage: fallback,
  })
}
