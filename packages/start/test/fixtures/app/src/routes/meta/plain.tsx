// No `meta`: the page speaks for itself (research 20 §10).
export default function Plain() {
  return (
    <main>
      <p>Short crumb</p>
      <h1>Harvest &amp; storage notes</h1>
      <ul>
        <li>
          - a bullet that must never become the description, however long this particular list item
          happens to be.
        </li>
      </ul>
      <pre>
        <code>const x = items.map(i =&gt; i.name)</code>
      </pre>
      <p>
        {
          'Harvest when 5 < 7 and the "tonnes" & crates are in: every mark here is escaped wherever it lands. It keeps going for a good while after that, long enough that the end of it has to be cut off somewhere sensible, at a sentence if one fits.'
        }
      </p>
      <p>The second paragraph is not used.</p>
    </main>
  )
}
