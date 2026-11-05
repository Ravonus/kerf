export const fail = (code, message) => Object.assign(new Error(message), { code })
export const sleep = (ms) =>
  new Promise((r) => {
    setTimeout(r, ms)
  })
