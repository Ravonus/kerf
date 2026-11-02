// A param route with `meta` from `data`, where the data is hostile: every value is text in the head.
import type { LoadArgs, Meta, RouteProps } from '@weft-js/start'

export const load = ({ params }: LoadArgs<'/meta/[name]'>) => ({ name: decodeURIComponent(params.name), late: new Promise<string>(ok => setTimeout(ok, 5, 'x')) })
export const meta: Meta<typeof load, '/meta/[name]'> = ({ data }) => ({ title: `</title><script>alert("${data.name}")</script>`, description: `"><img src=x onerror=alert(1)> ${data.name} & co`, jsonLd: { '@type': 'Thing', name: `</script><script>alert(2)</script>${data.name}` } })

export default function Named(props: RouteProps<typeof load, '/meta/[name]'>) {
  return <h1>{props.data.name}</h1>
}
