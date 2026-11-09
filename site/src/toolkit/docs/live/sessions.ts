import type { Doc } from '../../types.ts'

export const sessions: Doc[] = [
  {
    component: 'MeetingRoom',
    summary: 'A whole video call: tiles, layouts, people, chat and controls.',
    tile: 'TileStates',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'MeetingRoomIncident',
            title: 'Incident review',
            note: 'Try the layouts, Share, People, Chat and Leave. The avatars are where your `video` would go.',
            stage: 'fill',
            height: 560,
          },
          {
            id: 'MeetingRoomPhone',
            title: 'On a phone',
            note: '`compact` shows the speaker, and icons only.',
            stage: 'narrow',
            height: 620,
          },
        ],
      },
    ],
    a11yNotes: [
      'Raised hands are announced. Who is speaking is not, or it would never stop.',
      'Warp never touches the camera or microphone: media is yours.',
    ],
    propDocs: {
      participants: 'Everyone but you.',
      self: 'You.',
      layout: '`gallery`, `speaker`, `presentation` or `board`.',
      timer: 'Elapsed time, already formatted.',
      compact: "For a phone. Unset, it follows the room's width.",
      video: 'Return the `<video>` for a participant.',
      share: 'The shared screen.',
      presenter: 'Who is sharing.',
      board: 'The whiteboard.',
      chat: 'The Chat panel.',
      invite: 'Below People.',
      theme: 'Dark unless you say otherwise.',
      live: "The room's connection.",
    },
    related: ['Tile', 'ControlBar', 'Prejoin'],
  },
  {
    component: 'Tile',
    summary: 'One person in a call: their video or avatar, name and status.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'TileStates',
            title: 'Each state',
            note: 'Speaking, muted, hand raised, poor connection and camera off. Give tiles a height.',
            stage: 'fill',
            height: 360,
          },
        ],
      },
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'TileWithCamera',
            title: 'With video',
            note: '`video` returns your own element. An image stands in here.',
            height: 240,
          },
        ],
      },
    ],
    a11yNotes: [
      'The state is in its name: "Mara Lindqvist, hand raised".',
      'Set `--level` on the tile for the audio bars. Nothing re-renders.',
    ],
    propDocs: {
      role: "The tile's role. Default `group`; inside a list, `listitem`.",
      p: 'The participant.',
      self: 'Shows You.',
      video: 'Return the video element.',
    },
    related: ['MeetingRoom'],
  },
  {
    component: 'ControlBar',
    summary: 'The controls along the bottom of a call: mute, camera, share, leave.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'ControlBarCall', title: 'Full', height: 180 },
          {
            id: 'ControlBarCompact',
            title: 'Compact',
            note: 'Icons only, with Chat and People left for More.',
            height: 180,
          },
        ],
      },
    ],
    keyboard: [
      ['Tab', 'Moves into the bar, and out'],
      ['Left and Right', 'Move between controls'],
    ],
    a11yNotes: ['It is a toolbar with one tab stop. Leave is the only solid button.'],
    propDocs: {
      mic: 'Whether the mic is on.',
      camera: 'Whether the camera is on.',
      sharing: 'Whether you are sharing.',
      hand: 'Whether your hand is up.',
      side: 'The open side panel.',
      onToggle: 'Gets the name of the control pressed.',
      onLeave: 'Leave was pressed.',
      more: 'The name of the More button.',
    },
    related: ['MeetingRoom'],
  },
  {
    component: 'Prejoin',
    summary: 'Check your name, mic and camera before you go into a call.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PrejoinIncidentCall',
            title: 'Before the review',
            note: 'No camera or microphone is used here. Pass your own `preview` and `level`.',
            stage: 'fill',
            height: 460,
          },
        ],
      },
    ],
    propDocs: {
      name: 'Fills the name field.',
      preview: 'Your `<video>`.',
      level: 'The mic level, 0 to 1.',
      devices: 'The microphones, cameras and speakers to list.',
      onDevice: 'A device was picked.',
      onTestSound: 'Adds Play test sound.',
      joining: 'Join is under way.',
      onJoin: 'Gets the name.',
    },
    related: ['Lobby', 'MeetingRoom'],
  },
  {
    component: 'Lobby',
    summary: 'Waiting to be let into a call.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'LobbyWaiting', title: 'Asking to join', stage: 'narrow', height: 220 }],
      },
    ],
    a11yNotes: ['"Asking to join" is a status, so it is read out without taking focus.'],
    propDocs: {
      title: 'The heading.',
      children: 'What happens next.',
      onCancel: 'Cancel request was pressed.',
    },
    related: ['Prejoin', 'ScheduledLobby'],
  },
  {
    component: 'ScheduledLobby',
    summary: 'A call that has not started yet: a countdown, with Join off until it is time.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ScheduledLobbyReview',
            title: 'Before the start',
            note: 'Join turns on when the countdown ends.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ScheduledLobbyOpen',
            title: 'Open early',
            note: '`joinable` lets people in now.',
            stage: 'narrow',
            height: 260,
          },
        ],
      },
    ],
    propDocs: {
      to: 'When it starts, in epoch ms.',
      now: 'The time now, to render on the server.',
      joinable: 'Turns Join on before the end.',
      opensAt: 'When Join opens, in words.',
      onJoin: 'Join was pressed.',
      onAddToCalendar: 'Adds Add to calendar.',
    },
    related: ['Countdown', 'Lobby'],
  },
  {
    component: 'Countdown',
    summary: 'Days, hours, minutes and seconds to a moment.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'CountdownFreeze', title: 'Until the deploy freeze', height: 180 }],
      },
    ],
    a11yNotes: ['It is a timer with live updates off, and it is announced once, at one minute.'],
    propDocs: {
      to: 'The moment, in epoch ms.',
      now: 'The time now, to render on the server. Without it the digits fill in after mount.',
      label: 'Its accessible name.',
      onDone: 'It reached zero.',
    },
    related: ['ScheduledLobby'],
  },
  {
    component: 'TransportPicker',
    summary: 'A sandbox for developers to test how live updates behave on a bad network.',
    use: { when: ['Trying out a realtime setup while you build. It is never for end users.'] },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TransportPickerSandbox',
            title: 'Realtime sandbox',
            note: 'It all runs in a simulation in this page. Pick a network, then drop the connection.',
            stage: 'fill',
            height: 880,
          },
        ],
      },
    ],
    propDocs: {
      lanes: 'Real statuses to show in place of the simulated ones.',
      bus: 'The server bus to start on.',
      wire: 'The wire under test.',
      preset: 'The deploy preset.',
      network: 'The simulated network.',
      onConfigChange: 'The setup changed.',
      title: 'The heading.',
    },
    related: ['ConnectionPill'],
  },
]
