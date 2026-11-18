// Keep the process emergency writer and request diagnostics on the same stderr format.

/**
 * @param {{code: string, severity: string, message: string, route?: string, requestId?: string | undefined, reference?: string}} diagnostic
 * @param {'text' | 'json'} format
 */
export function diagnosticLine({ code, severity, message, route, requestId, reference }, format) {
  message = message.replace(/^[A-Z]{1,3}\d{3}:? /, '')
  if (format === 'json')
    return JSON.stringify({
      time: new Date().toISOString(),
      level: severity,
      code,
      message,
      route,
      requestId,
      reference,
    })
  const line = `[kerf] ${code} ${severity}${route ? ` (${route})` : ''}${requestId ? ` [${requestId}]` : ''}${reference ? ` [reference ${reference}]` : ''}: ${message}`
  return line.replace(/\r/g, '\\r').replace(/\n/g, '\\n')
}
