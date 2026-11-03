// The change feed's triggers, as SQL (`weft db live`, and tests). A trigger says which table and which primary keys
// changed, never a column of the row: a notification can be read by anyone who can LISTEN, and the hub only needs tags.
//
//   postgresql  statement triggers with transition tables, so 10k rows in one statement are one NOTIFY: up to 32 ids, or
//               none past that, which means "this whole table". NOTIFY is in the transaction: a rollback sends nothing.
//   sqlite      no notify across processes: rows in a capped log, which the watcher reads when `data_version` moves.
//   mysql       the same log, read on a timer. A MySQL trigger is per row and can't reach out.

export const CHANNEL = 'weft_changes'
export const LOG = '__weft_changes'
/** More ids than this in one statement is a table-level change. */
export const MAX_IDS = 32
/** Rows SQLite's log keeps. A reader further behind than this has lost its place, and pokes every table. */
export const LOG_ROWS = 4096
export const BREAK = '\n--> statement-breakpoint\n'

const pgName = n => `"${n.replaceAll('"', '""')}"`
const myName = n => `\`${n.replaceAll('`', '``')}\``
const literal = s => `'${s.replaceAll("'", "''")}'`
const safe = t => t.replace(/\W/g, '_')

function postgres(tables) {
  const fn = `CREATE OR REPLACE FUNCTION weft_changes_notify() RETURNS trigger AS $weft$
DECLARE
  ids text[];
  body text;
BEGIN
  IF TG_OP <> 'TRUNCATE' AND TG_NARGS > 0 THEN
    EXECUTE format('SELECT array_agg(id) FROM (SELECT concat_ws(%L, %s) AS id FROM weft_rows LIMIT ${MAX_IDS + 1}) s', ':', (
      SELECT string_agg(format('%I', a), ', ') FROM unnest(TG_ARGV) a
    )) INTO ids;
    IF ids IS NULL THEN RETURN NULL; END IF;
    IF cardinality(ids) <= ${MAX_IDS} THEN
      body := json_build_object('t', TG_TABLE_NAME, 'i', ids)::text;
    END IF;
  END IF;
  IF body IS NULL OR octet_length(body) > 7900 THEN
    body := json_build_object('t', TG_TABLE_NAME)::text;
  END IF;
  PERFORM pg_notify(${literal(CHANNEL)}, body);
  RETURN NULL;
END;
$weft$ LANGUAGE plpgsql`
  const list = tables.flatMap(({ name, pk }) => {
    const args = pk.map(literal).join(', ')
    const on = pgName(name)
    const trigger = (suffix, event, rows) => [
      `DROP TRIGGER IF EXISTS weft_changes_${suffix} ON ${on}`,
      `CREATE TRIGGER weft_changes_${suffix} AFTER ${event} ON ${on} ${rows ? `REFERENCING ${rows} TABLE AS weft_rows ` : ''}FOR EACH STATEMENT EXECUTE FUNCTION weft_changes_notify(${args})`,
    ]
    return [...trigger('ins', 'INSERT', 'NEW'), ...trigger('upd', 'UPDATE', 'NEW'), ...trigger('del', 'DELETE', 'OLD'), ...trigger('trn', 'TRUNCATE')]
  })
  return [fn, ...list]
}

function sqlite(tables) {
  const log = `CREATE TABLE IF NOT EXISTS ${LOG} (seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, pk TEXT)`
  const list = tables.flatMap(({ name, pk }) => {
    const id = row => (pk.length ? pk.map(c => `${row}.${pgName(c)}`).join(` || ':' || `) : 'NULL')
    const trigger = (suffix, event, row) => [
      `DROP TRIGGER IF EXISTS weft_changes_${safe(name)}_${suffix}`,
      `CREATE TRIGGER weft_changes_${safe(name)}_${suffix} AFTER ${event} ON ${pgName(name)} BEGIN
  INSERT INTO ${LOG} (tbl, pk) VALUES (${literal(name)}, ${id(row)});
  DELETE FROM ${LOG} WHERE seq <= last_insert_rowid() - ${LOG_ROWS};
END`,
    ]
    return [...trigger('ins', 'INSERT', 'NEW'), ...trigger('upd', 'UPDATE', 'NEW'), ...trigger('del', 'DELETE', 'OLD')]
  })
  return [log, ...list]
}

function mysql(tables) {
  const log = `CREATE TABLE IF NOT EXISTS ${LOG} (seq BIGINT AUTO_INCREMENT PRIMARY KEY, tbl VARCHAR(64) NOT NULL, pk VARCHAR(255), at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY at_idx (at))`
  const list = tables.flatMap(({ name, pk }) => {
    const id = row => (pk.length ? `CONCAT_WS(':', ${pk.map(c => `${row}.${myName(c)}`).join(', ')})` : 'NULL')
    const trigger = (suffix, event, row) => [
      `DROP TRIGGER IF EXISTS weft_changes_${safe(name)}_${suffix}`,
      `CREATE TRIGGER weft_changes_${safe(name)}_${suffix} AFTER ${event} ON ${myName(name)} FOR EACH ROW INSERT INTO ${LOG} (tbl, pk) VALUES (${literal(name)}, ${id(row)})`,
    ]
    return [...trigger('ins', 'INSERT', 'NEW'), ...trigger('upd', 'UPDATE', 'NEW'), ...trigger('del', 'DELETE', 'OLD')]
  })
  return [log, ...list]
}

/**
 * The statements that make `tables` report their changes. Each can run twice.
 * @param {'postgresql' | 'sqlite' | 'mysql'} dialect
 * @param {{ name: string, pk: string[] }[]} tables
 * @returns {string[]}
 */
export function changeStatements(dialect, tables) {
  if (dialect === 'postgresql') return postgres(tables)
  if (dialect === 'sqlite') return sqlite(tables)
  if (dialect === 'mysql') return mysql(tables)
  throw new Error(`no change triggers for ${String(dialect)}`)
}

/** A migration file, in drizzle-kit's format. */
export const changeSql = (dialect, tables) => `-- weft: report changes to ${tables.map(t => t.name).join(', ')} (\`weft db live\`). Ids only, never a row.\n${changeStatements(dialect, tables).join(`;${BREAK}`)};\n`
