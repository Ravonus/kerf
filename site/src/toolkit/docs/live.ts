import type { DocGroup } from '../types.ts'

export const live: DocGroup = {
  file: 'live',
  title: 'Live',
  intro: 'Feeds, notifications and rooms that update on their own.',
  pack: true,
  docs: [
    {
      component: 'Bell',
      summary: 'The notifications button in the app bar, with a count of what is unread.',
      tileWidth: 160,
      tile: 'BellTile',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'BellWithInbox',
              title: 'With an inbox',
              note: 'Read something and the count follows.',
              height: 480,
            },
            {
              id: 'BellArrivals',
              title: 'New arrivals',
              note: 'The count bumps once for each batch. Opening clears it here.',
            },
          ],
        },
      ],
      a11yNotes: ['Its name says the count. The badge itself is hidden from assistive technology.'],
      propDocs: {
        count: 'A number, a state or a getter.',
        inbox: 'The panel. Gets `open`, a state.',
        route: 'On a phone, called instead of opening.',
        onOpen: 'It was pressed.',
      },
      related: ['Inbox', 'ConnectionPill'],
    },
    {
      component: 'Inbox',
      summary: "A person's notifications, by day, with tabs, actions and undo.",
      use: {
        when: ["Things that need someone's attention"],
        instead: [{ name: 'ActivityFeed', why: 'it only records what happened' }],
      },
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'InboxPage',
              title: 'As a page',
              note: 'Approve, dismiss and undo all work. Rows are marked read after two seconds on screen.',
              stage: 'fill',
              height: 520,
            },
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'InboxLoading',
              title: 'First load',
              note: '`items` stays undefined until it arrives.',
              stage: 'fill',
              height: 280,
            },
            {
              id: 'InboxEmpty',
              title: 'Empty',
              note: 'An `Inbox` with no `items` shows its empty state.',
              stage: 'fill',
              height: 240,
            },
          ],
        },
      ],
      keyboard: [
        ['Left and Right', 'Move between the tabs'],
        ['Up and Down', 'Move between notifications'],
      ],
      a11yNotes: [
        'Rows are a `feed`, keyed, so a change patches one row and focus stays where it was.',
        'It needs a mounted Toaster for Undo.',
      ],
      propDocs: {
        items: 'Newest first. Undefined while loading.',
        variant: '`popover` for inside a Bell.',
        open: 'Is it on screen? Rows are only marked read while it is.',
        queued: 'Updates waiting to sync.',
        viewAll: 'A link to the full page.',
        onRestore: 'Undo a dismiss: put the row back.',
        onAction: "A row's button was pressed.",
        onOpen: 'Makes each row a link.',
      },
      related: ['Bell', 'ActivityFeed', 'NotificationPreferences'],
    },
    {
      component: 'ActivityFeed',
      summary: 'A quiet record of who did what, grouped by day.',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'ActivityFeedProject',
              title: 'Project activity',
              note: 'New rows arrive on their own when `items` changes.',
              stage: 'narrow',
              height: 420,
            },
          ],
        },
      ],
      propDocs: {
        items: 'A list, a state or a getter.',
        live: 'Shows Live while the connection is up.',
        title: 'The heading.',
        level: "The title's heading level: one below the heading the feed sits under.",
      },
      related: ['Inbox', 'Feed'],
    },
    {
      component: 'ConnectionPill',
      summary: 'A small status that says whether live updates are getting through.',
      sections: [
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'ConnectionPillStates',
              title: 'Each state',
              note: "Pass `.live`, a stream's status or a channel's status as `state`.",
            },
          ],
        },
      ],
      a11yNotes: ['Each change is announced once. Going offline is announced straight away.'],
      propDocs: {
        state: 'The status: a string, a state or a getter.',
        label: 'What it is the connection of.',
        queued: 'How many updates are waiting: "Back online. 4 updates."',
      },
      related: ['ConnectionBanner', 'Bell'],
    },
    {
      component: 'ConnectionBanner',
      summary: 'A full-width notice for when the connection drops, with Retry.',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'ConnectionBannerOffline',
              title: 'Going offline',
              note: 'Offline shows at once. Reconnecting waits for `delay`, so a blip stays quiet.',
              stage: 'fill',
              height: 180,
            },
          ],
        },
      ],
      a11yNotes: ['It stays quiet for assistive technology: the pill does the announcing.'],
      propDocs: {
        state: 'The status: a string, a state or a getter.',
        delay: 'How long to wait while reconnecting, in ms.',
        onRetry: 'Adds Retry now.',
        offline: 'The offline text.',
        reconnecting: 'The reconnecting text.',
      },
      related: ['ConnectionPill', 'Alert'],
    },
    {
      component: 'PushSoftAsk',
      summary: "Asks in your own words before the browser's notification prompt appears.",
      use: { when: ['After someone has seen why pings would help them, never on a first visit'] },
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'PushSoftAskMentions',
              title: 'Failed deploy pings',
              note: 'This page never calls the browser. Yours would, in `onAccept`.',
              stage: 'narrow',
              height: 220,
            },
          ],
        },
      ],
      propDocs: {
        title: 'The question.',
        children: 'What they would get.',
        onAccept: 'Call `Notification.requestPermission()` here.',
        onDismiss: 'Not now.',
        declined: 'Announced after Not now.',
      },
      related: ['NotificationPreferences'],
    },
    {
      component: 'NotificationPreferences',
      summary: 'A grid of what to be told about, and how.',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'NotificationPreferencesWeft',
              title: 'weft notifications',
              note: 'Each change saves on its own. Security alerts must go to email, so that box is locked.',
              stage: 'fill',
              height: 680,
            },
          ],
        },
      ],
      keyboard: [
        ['Arrow keys', 'Move between cells'],
        ['Space', 'Toggles a cell'],
      ],
      a11yNotes: [
        'It is one grid with one tab stop. A channel an event cannot use still takes focus and says so.',
        'Below 560px the same rows restack.',
      ],
      propDocs: {
        groups: 'The events, grouped.',
        channels: 'The columns.',
        value: 'What is on: event, then channel.',
        offered: 'Which channels an event can use. Unlisted events can use all.',
        locked: 'Which channels an event must use.',
        lockReason: 'Why a box is locked.',
        onChange: 'A rejected promise flips the cells back and says why.',
        digest: 'How often the digest channel sends.',
        digestChannel: 'The channel the digest applies to.',
        defaults: 'Enables Reset to defaults.',
      },
      related: ['Inbox', 'PushSoftAsk'],
    },
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
        'warp never touches the camera or microphone: media is yours.',
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
  ],
}
