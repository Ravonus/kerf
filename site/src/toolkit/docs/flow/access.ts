import type { Doc } from '../../types.ts'
import { FORM_PROPS } from './shared.ts'

export const flowAccess: Doc[] = [
  {
    component: 'MagicLinkSent',
    summary: 'The "check your inbox" screen, with a resend countdown.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'MagicLinkSentInbox',
            title: 'After asking for a link',
            stage: 'narrow',
            height: 340,
          },
        ],
      },
    ],
    propDocs: {
      email: 'Where it went.',
      title: 'The heading.',
      lede: 'One line under it.',
      heading: "The title's level.",
      resendIn: 'Seconds before Resend opens.',
      mailHref: 'Shows Open email app.',
      onResend: 'Shows Resend.',
      onChangeEmail: 'Shows Change email.',
      onBack: 'Shows Back.',
    },
    related: ['SignIn', 'ResetPassword'],
  },
  {
    component: 'ResetPassword',
    summary: 'Ask for a reset by email, then set a new password.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ResetPasswordSteps',
            title: 'The whole journey',
            note: 'Enter a sample email to go on, then press Resend to stand in for the link. It never says whether the email has an account.',
            stage: 'narrow',
            height: 420,
          },
        ],
      },
    ],
    propDocs: {
      ...FORM_PROPS,
      stage: '`request` asks for the email. `password` sets the new one.',
      onBack: 'Shows Back.',
      title: 'The heading.',
      lede: 'One line under it.',
    },
    related: ['MagicLinkSent', 'PasswordMeter'],
  },
  {
    component: 'InviteAccept',
    summary: 'Who invited you, to what, and as what, with Join and Decline.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'InviteAcceptWorkspace',
            title: 'Joining a workspace',
            stage: 'narrow',
            height: 380,
          },
        ],
      },
    ],
    propDocs: {
      inviter: 'Who invited them.',
      org: 'The workspace.',
      role: 'What they join as.',
      email: 'The invited address.',
      description: 'What that role can do.',
      heading: "The title's level.",
      pending: 'Shows progress on Join.',
      onAccept: 'Joins.',
      onDecline: 'Declines.',
      onOtherAccount: 'Shows the link to use another account.',
      onBack: 'Shows Back.',
    },
    related: ['SignUp', 'InviteDialog'],
  },
  {
    component: 'AuthDone',
    summary: 'A brief success mark, then the flow carries on by itself.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'AuthDoneSignedIn',
            title: 'Signed in',
            note: 'After `delay`, `onContinue` runs. At once under reduced motion.',
            stage: 'narrow',
            height: 220,
            replay: true,
          },
        ],
      },
    ],
    propDocs: {
      title: 'The heading.',
      lede: 'One line under it.',
      heading: "The title's level.",
      delay: 'Milliseconds before `onContinue`.',
      onContinue: 'Goes on to the app.',
    },
    related: ['SignIn', 'SignUp'],
  },
  {
    component: 'ReauthDialog',
    summary: 'Asks for the password again before something sensitive.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ReauthDialogDelete',
            title: 'Before deleting a project',
            note: 'The sample password is sample-password. Nothing is sent.',
          },
        ],
      },
    ],
    propDocs: {
      open: 'Whether it shows. You own this state.',
      reason: 'Why it asks.',
      onConfirm: 'Called with the password. Close `open` once it is accepted.',
      onPasskey: 'Shows "Use a passkey".',
      errors: 'Messages by field name.',
      error: 'The failure.',
      errorOptions: 'Words by error code.',
      pending: 'Shows progress.',
      onRetry: "The Retry on a network failure's toast.",
      heading: "The title's level.",
    },
    related: ['ApiKeys', 'TypeToConfirm'],
  },
  {
    component: 'PasskeyButton',
    summary: 'Signs in with a passkey. A cancelled system sheet shows nothing.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'PasskeyButtonSignIn', title: 'On a sign-in screen' }],
      },
    ],
    propDocs: {
      onPasskey: 'Run WebAuthn here.',
      onError: 'Called on a failure that is not a cancel.',
    },
    related: ['SignIn', 'SsoButtons'],
  },
  {
    component: 'SsoButtons',
    summary: 'A row of single sign-on buttons. Each stays pending until your app redirects.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'SsoButtonsProviders', title: 'Three providers', stage: 'narrow' }],
      },
    ],
    propDocs: {
      providers: 'An id, a short label, and one monochrome icon path.',
      onProvider: 'Called with the id.',
    },
    related: ['SignIn', 'PasskeyButton'],
  },
  {
    component: 'MfaSetup',
    summary: 'Sets up an authenticator app: scan, confirm a code, save backup codes.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'MfaSetupAuthenticator',
            title: 'Two-step sign-in',
            note: 'The sample code is 123456. Finish waits for "I saved my backup codes".',
          },
        ],
      },
    ],
    propDocs: { open: 'Whether it shows. You own this state.', onDone: 'Called at the end.' },
    related: ['OtpField', 'OtpStep'],
  },
  {
    component: 'SignGate',
    summary: 'Blocks a page until an agreement is signed. The page stays visible but inert.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SignGateLiveKeys',
            title: 'Live keys behind an agreement',
            note: 'The segmented control stands in for your e-signature provider.',
            stage: 'fill',
            height: 420,
          },
        ],
      },
    ],
    a11yNotes: ['The blocker is a region with a heading, not a dialog, so it reads as the page.'],
    propDocs: {
      onResend: 'The button on expired and declined.',
      onRetry: 'The button on error.',
    },
    related: ['SignGateBadge', 'ApiKeys'],
  },
  {
    component: 'SignGateBadge',
    summary: 'The state of an agreement, as a badge.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [{ id: 'SignGateBadgeStates', title: 'Every state' }],
      },
    ],
    propDocs: { status: 'Where the agreement stands.' },
    related: ['SignGate'],
  },
]
