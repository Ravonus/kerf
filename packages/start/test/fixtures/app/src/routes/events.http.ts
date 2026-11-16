export function GET() {
  const encode = new TextEncoder()
  let timer: ReturnType<typeof setTimeout>
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encode.encode('data: first\n\n'))
        timer = setTimeout(() => {
          controller.enqueue(encode.encode('data: second\n\n'))
          controller.close()
        }, 250)
      },
      cancel() {
        clearTimeout(timer)
      },
    }),
    { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } },
  )
}
