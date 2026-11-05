export const usageError = (message) => Object.assign(new Error(message), { code: 'E_USAGE' })
export const refused = (message) => Object.assign(new Error(message), { code: 'E_ADD' })
