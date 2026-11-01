// Runs in each frame before its app, and only for the split. `?obs=0` gives the shared harness an observer that records
// nothing. `__mute()` turns text writes into no-ops once the app is on the page, leaving a framework's own work.
{
  const q = new URLSearchParams(location.search)
  if (q.get('obs') === '0') window.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return [] } }
  window.__mute = () => {
    for (const [proto, key] of [[CharacterData.prototype, 'data'], [Node.prototype, 'nodeValue'], [Node.prototype, 'textContent']]) {
      const d = Object.getOwnPropertyDescriptor(proto, key)
      Object.defineProperty(proto, key, { ...d, set() {} })
    }
  }
}
