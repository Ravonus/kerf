// A local stand-in for Codex. It never contacts a model or reads credentials.
process.stdin.resume()
process.stdin.on('end', () => {
  const failed = process.env.FIXTURE_FAILURE === '1'
  console.log(
    JSON.stringify(
      failed
        ? { type: 'turn.failed', error: 'fixture-secret' }
        : {
            type: 'turn.completed',
            usage: { input_tokens: 4, cached_input_tokens: 1, output_tokens: 2 },
          },
    ),
  )
  process.stderr.write('fixture-secret')
  process.exitCode = failed ? 1 : 0
})
