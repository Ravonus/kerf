import type { Post } from './Feed'

export function Row({ post }: { post: Post }) {
  return (
    <li class="row">
      {post.pic ? <img src={post.pic} width="40" height="30" alt="" /> : null}
      <h3>{post.title}</h3>
      <p>{post.body}</p>
      <a href={`/p/${post.id}`} onClick={() => alert('no')}>Open</a>
    </li>
  )
}
