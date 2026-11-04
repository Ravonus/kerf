// Timers shared by repository scripts and their browser-environment tests.
export const sleep = (ms = 0) =>
  new Promise((ok) => {
    setTimeout(ok, ms)
  })

export const sleep80 = (ms = 80) => sleep(ms)
