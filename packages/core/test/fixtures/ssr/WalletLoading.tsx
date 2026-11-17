/** A remembered wallet may finish loading before its server-rendered dialog hydrates. */
export function WalletLoading(props: { waiting: boolean; rows: string[] }) {
  return (
    <section>
      {props.waiting ? (
        <div role="status">Loading wallets</div>
      ) : (
        <>
          <div class="wallet-rows">
            {props.rows.map((row) => (
              <button key={row}>{row}</button>
            ))}
            {props.rows.length === 0 && <div>No wallets</div>}
          </div>
          {props.rows.length > 2 && <button>More wallets</button>}
        </>
      )}
    </section>
  )
}

export function StableWalletField(props: { value: string }) {
  return <input class="wallet-field" aria-label="Wallet label" value={props.value} />
}
