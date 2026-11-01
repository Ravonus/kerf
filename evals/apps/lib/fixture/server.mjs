// Not a benchmark variant: the todo contract in the smallest form that really talks to Postgres, so the harness can be tested
// end to end with no framework. FIXTURE_BUG=1 removes the ordering guard, and the races have to catch that.
import { execFile } from 'node:child_process'
import { createHmac, scrypt, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { promisify } from 'node:util'

const exec = promisify(execFile), derive = promisify(scrypt), { DATABASE_URL, BETTER_AUTH_SECRET: secret, FIXTURE_BUG: bug, PORT, HOST } = process.env
const q = async sql => (await exec('psql', [DATABASE_URL, '-X', '-A', '-t', '-q', '-c', sql])).stdout.trim()
const json = async sql => JSON.parse(await q(`select coalesce(json_agg(t), '[]') from (${sql}) t`))
const text = s => `'${String(s).replaceAll("'", "''")}'`
const sign = id => `${id}.${createHmac('sha256', secret).update(id).digest('hex')}`
const who = r => { const c = /sid=([^;]+)/.exec(r.headers.cookie ?? '')?.[1], id = c?.split('.')[0]; return c && c === sign(id) ? id : null }
const body = r => new Promise(ok => { let s = ''; r.on('data', d => (s += d)); r.on('end', () => ok(s)) })
const filters = { active: 'and not done', done: 'and done' }
const todos = (user, filter) => json(`select id, title, done from todos where user_id = ${text(user)} ${filters[filter] ?? ''} order by created_at, id`)
const left = async user => +(await q(`select count(*) from todos where user_id = ${text(user)} and not done`))

async function passwordOk(email, password) {
  const [salt, key] = (await q(`select a.password from account a join "user" u on u.id = a."userId" where u.email = ${text(email)}`)).split(':')
  if (!key) return null
  const got = await derive(password.normalize('NFKC'), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 })
  return timingSafeEqual(got, Buffer.from(key, 'hex')) ? q(`select id from "user" where email = ${text(email)}`) : null
}

const login = `<!doctype html><title>Sign in</title><form method=post action=/login><label>Email <input name=email type=email></label><label>Password <input name=password type=password></label><button>Sign in</button></form>`
const row = t => `<li><label><input type=checkbox data-id=${t.id} ${t.done ? 'checked' : ''}>${t.title}</label><button data-del=${t.id} aria-label="Delete ${t.title}">x</button></li>`
const page = (rows, n) => `<!doctype html><head><title>Todos</title></head><body><h1>Todos</h1><form id=add><input aria-label="New todo" id=new><button>Add</button></form>
<nav><a href="/todos">All</a> <a href="/todos?filter=active">Active</a> <a href="/todos?filter=done">Done</a></nav><ul aria-label=Todos id=list>${rows.map(row).join('')}</ul><p id=left>${n} left</p>
<script>
const bug = ${JSON.stringify(!!bug)}, $ = s => document.querySelector(s)
let read = 0, writes = 0
const esc = s => s.replace(/[&<]/g, c => '&#' + c.charCodeAt(0) + ';')
const paint = d => { $('#list').innerHTML = d.rows.map(t => '<li><label><input type=checkbox data-id=' + t.id + (t.done ? ' checked' : '') + '>' + esc(t.title) + '</label><button data-del=' + t.id + ' aria-label="Delete ' + esc(t.title) + '">x</button></li>').join(''); $('#left').textContent = d.left + ' left' }
async function refresh() {
  const mine = ++read, d = await (await fetch('/api/todos' + location.search)).json()
  if (bug || (mine === read && !writes)) paint(d)
}
async function send(method, path, data) {
  writes++
  let failed = false
  try { await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }).then(r => { failed = !r.ok }) } catch { failed = true }
  writes--
  if (bug ? !failed : !writes) await refresh()
}
$('#add').onsubmit = e => { e.preventDefault(); const title = $('#new').value; if (!title) return; $('#new').value = ''; send('POST', '/api/todos', { title }) }
$('#list').onclick = e => { const del = e.target.dataset.del; if (del) { e.preventDefault(); e.target.closest('li').remove(); send('DELETE', '/api/todos/' + del, {}) } }
$('#list').onchange = e => { const id = e.target.dataset.id; if (id) send('PATCH', '/api/todos/' + id, { done: e.target.checked }) }
document.querySelector('nav').onclick = e => { const a = e.target.closest('a'); if (a) { e.preventDefault(); history.pushState(0, '', a.href); refresh() } }
if (!bug) addEventListener('focus', refresh)
</script>`

createServer(async (r, s) => {
  const url = new URL(r.url, 'http://x'), user = who(r), send = (code, type, b, head = {}) => { s.writeHead(code, { 'content-type': type, ...head }); s.end(b) }
  const go = (to, head = {}) => { s.writeHead(303, { location: to, ...head }); s.end() }
  try {
    if (url.pathname === '/__up') return send(200, 'text/plain', 'up')
    if (url.pathname === '/login') {
      if (r.method !== 'POST') return send(200, 'text/html', login)
      const f = new URLSearchParams(await body(r)), id = await passwordOk(f.get('email'), f.get('password'))
      return id ? go('/todos', { 'set-cookie': `sid=${sign(id)}; HttpOnly; Path=/; SameSite=Lax` }) : send(401, 'text/html', login)
    }
    if (!user) return go('/login')
    if (url.pathname === '/todos') return send(200, 'text/html', page(await todos(user, url.searchParams.get('filter')), await left(user)))
    if (url.pathname === '/api/todos' && r.method === 'GET') return send(200, 'application/json', JSON.stringify({ rows: await todos(user, url.searchParams.get('filter')), left: await left(user) }))
    if (url.pathname === '/api/todos' && r.method === 'POST') { const { title } = JSON.parse(await body(r)); await q(`insert into todos (user_id, title) values (${text(user)}, ${text(title)})`); return send(200, 'application/json', '{}') }
    const id = /^\/api\/todos\/([0-9a-f-]+)$/.exec(url.pathname)?.[1]
    if (id && r.method === 'PATCH') { const { done } = JSON.parse(await body(r)); await q(`update todos set done = ${!!done} where id = ${text(id)} and user_id = ${text(user)}`); return send(200, 'application/json', '{}') }
    if (id && r.method === 'DELETE') { await q(`delete from todos where id = ${text(id)} and user_id = ${text(user)}`); return send(200, 'application/json', '{}') }
    send(404, 'text/plain', 'not found')
  } catch (e) { send(500, 'text/plain', String(e.message)) }
}).listen(+PORT, HOST)
