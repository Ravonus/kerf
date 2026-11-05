import { LiveStatus } from '../parts'
import { Button } from '../Button'
import { G } from './shared'
import { Tile } from './MeetingRoomTile'
import { Person } from './MeetingRoomPerson'
import { LayoutPicker } from './MeetingRoomLayout'
import type { MeetingLayout } from './MeetingRoomTypes'
import type { meetingModel, RoomInputs } from './MeetingRoomModel'

type ViewProps = { model: ReturnType<typeof meetingModel>; p: () => RoomInputs }

export function MeetingHeader({ model, p: get }: ViewProps) {
  return (
    <div data-part="header">
      <b>{get().title}</b>
      {get().timer !== undefined && <span data-numeric="">{get().timer}</span>}
      {get().recording && (
        <span data-part="rec">
          <span data-scope="status-dot" data-tone="critical"></span>Rec
        </span>
      )}
      <span data-part="spacer"></span>
      {!model.phone.value && (
        <LayoutPicker
          value={model.L.value}
          onChange={(l: MeetingLayout) => {
            model.chosen.set(l)
            if (model.sharingOn.value) model.sharingOn.set(false)
            model.say(`${l[0]!.toUpperCase()}${l.slice(1)} layout`)
          }}
        />
      )}
      <LiveStatus state={model.network.value} label="Connection">
        {model.phone.value ? '' : model.netWords.value}
      </LiveStatus>
    </div>
  )
}

export function MeetingStage({ model, p: get }: ViewProps) {
  return (
    <div
      ref={model.setStage}
      data-part="stage"
      data-layout={model.L.value}
      style={`--_cols:${model.cols.value}`}
      role="group"
      aria-label="Participants"
    >
      {model.L.value === 'gallery' && (
        <div data-part="tiles" role="list" aria-label="Participants">
          {model.people.value.map((p) => (
            <Tile key={p.id} p={p} video={model.v} role="listitem" />
          ))}
        </div>
      )}
      {model.L.value === 'speaker' && model.main.value && (
        <Tile key={model.main.value.id} p={model.main.value} video={model.v} />
      )}
      {model.L.value === 'speaker' && (
        <div data-part="strip" role="list" aria-label="Other participants">
          {model.others.value.map((p) => (
            <Tile key={p.id} p={p} video={model.v} role="listitem" />
          ))}
        </div>
      )}
      {model.L.value === 'presentation' && <Presentation model={model} p={get} />}
      {model.L.value === 'board' && (
        <div data-part="share">
          <header>
            <G name="board" /> Whiteboard · everyone can draw
          </header>
          {get().board ? get().board!() : <div></div>}
        </div>
      )}
      {(model.L.value === 'presentation' || model.L.value === 'board') && (
        <div data-part="rail" role="list" aria-label="Participants">
          {model.people.value.map((p) => (
            <Tile key={p.id} p={p} video={model.v} role="listitem" />
          ))}
        </div>
      )}
      <div
        ref={model.setPip}
        data-scope="pip"
        role="group"
        aria-roledescription="draggable self view"
        aria-label="Self view. Arrow keys move it to a corner."
        tabindex="0"
      >
        <Tile p={model.me.value} self video={model.v} />
      </div>
    </div>
  )
}

function Presentation({ model, p: get }: ViewProps) {
  return (
    <div data-part="share">
      <header>
        <G name="screen" /> {model.presenterText.value} · {get().shareTitle}
        {model.sharingOn.value && (
          <Button tone="critical" size="sm" onClick={() => model.toggle('share')}>
            Stop sharing
          </Button>
        )}
      </header>
      {get().share ? get().share!() : <div></div>}
    </div>
  )
}

export function MeetingSidebar({ model, p: get }: ViewProps) {
  return (
    <aside
      data-part="sidebar"
      hidden={!model.side.value}
      aria-label={model.side.value === 'chat' ? 'Chat' : 'People'}
      onKeyDown={model.sideKey}
    >
      <div data-part="app-bar">
        <b>{model.side.value === 'chat' ? 'Chat' : `People · ${model.people.value.length + 1}`}</b>
        <span data-part="spacer"></span>
        {model.phone.value && get().chat && (
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            onClick={() => model.side.set(model.side.value === 'chat' ? 'people' : 'chat')}
          >
            {model.side.value === 'chat' ? 'People' : 'Chat'}
          </Button>
        )}
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          data-icon-only=""
          aria-label="Close panel"
          onClick={model.closeSide}
        >
          <G name="x" />
        </Button>
      </div>
      {model.side.value === 'chat' ? (
        get().chat ? (
          get().chat!()
        ) : (
          <div></div>
        )
      ) : (
        <ul data-part="people">
          <Person p={model.me.value} sub="You" />
          {model.people.value.map((p) => (
            <Person
              key={p.id}
              p={p}
              sub={
                p.role ||
                (p.handRaised
                  ? 'Hand raised'
                  : p.network === 'poor'
                    ? 'Poor connection'
                    : 'Participant')
              }
            />
          ))}
        </ul>
      )}
      {model.side.value !== 'chat' && get().invite ? (
        <div>{get().invite!()}</div>
      ) : (
        <div hidden></div>
      )}
    </aside>
  )
}
