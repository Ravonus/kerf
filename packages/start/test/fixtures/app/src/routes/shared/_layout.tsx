import { currentPath, Link, navigate, type RouteProps } from '@kerf-js/start'
export default function SharedLayout(props: RouteProps) {
  return (
    <section>
      <header style="height:180px;position:relative">
        {currentPath().endsWith('/large') ? (
          <span
            data-kerf-shared="test-brand"
            data-kerf-shared-fit="text"
            style="position:absolute;left:20px;top:100px;font-size:64px;line-height:1"
          >
            Same artist
          </span>
        ) : (
          <span
            data-kerf-shared="test-brand"
            data-kerf-shared-fit="text"
            style="position:absolute;left:280px;top:10px;font-size:20px;line-height:.6"
          >
            Same artist
          </span>
        )}
      </header>
      <nav>
        <Link href="/shared/large">Large mark</Link>
        <Link href="/shared/small">Small mark</Link>
        <button onClick={() => void navigate('/shared/small', { shared: false })}>
          Without motion
        </button>
      </nav>
      {props.children}
    </section>
  )
}
