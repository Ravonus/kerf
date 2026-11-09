import type { Doc } from '../../types.ts'
import { FORM_PROPS } from './shared.ts'

export const flowAuth: Doc[] = [
  {
    component: 'SignIn',
    summary: 'A sign-in form with passkey, single sign-on, email and password, and Forgot.',
    tile: 'SignInTile',
    use: {
      when: ['The screen where people come back'],
      instead: [
        { name: 'SignUp', why: 'they are new' },
        { name: 'ReauthDialog', why: 'they are already in and doing something sensitive' },
      ],
    },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SignInWeft',
            title: 'Signing in to Weft',
            note: 'Nothing is sent: `onSubmit` is a stub. Sample values only, never a real password.',
            stage: 'narrow',
            height: 600,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SignInFailed',
            title: 'Wrong details',
            note: 'A wrong password and an unknown email read the same.',
            stage: 'narrow',
            height: 420,
          },
        ],
      },
    ],
    propDocs: {
      ...FORM_PROPS,
      title: 'The heading.',
      lede: 'One line under it.',
      logo: 'Your logo.',
      name: "Your product's name, beside the logo.",
      submitLabel: "The main button's words.",
      providers: 'Single sign-on providers.',
      onProvider: "Called with the provider's id.",
      onForgot: 'Shows Forgot password.',
      onSignUp: 'Shows the link to sign up.',
      onInvite: 'Shows the link for people with an invite.',
      remember: 'Shows the "Keep me signed in" switch.',
    },
    related: ['AuthScreen', 'SignUp', 'ResetPassword', 'OtpStep'],
  },
  {
    component: 'AuthScreen',
    summary: 'The page around a sign-in form. On wide screens it adds a brand panel.',
    tile: 'SignInTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'AuthScreenSplit',
            title: 'Around a sign-in form',
            note: 'It follows its own width: full bleed under 600, a card to 999, split from 1000.',
            stage: 'fill',
            height: 700,
          },
        ],
      },
    ],
    a11yNotes: ['The brand panel is decorative, so it is hidden from assistive tech.'],
    propDocs: {
      logo: 'Your logo.',
      name: "Your product's name.",
      quote: 'A line on the brand panel.',
      cite: 'Who said it.',
      brand: 'Your own brand panel.',
    },
    related: ['SignIn', 'SignUp'],
  },
  {
    component: 'SignUp',
    summary: 'Creates an account: name, email, a checked password and the terms.',
    tile: 'SignUpTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SignUpWeft',
            title: 'A new workspace',
            note: 'Use sample values. `onSubmit` is a stub.',
            stage: 'narrow',
            height: 640,
          },
        ],
      },
    ],
    propDocs: {
      ...FORM_PROPS,
      title: 'The heading.',
      lede: 'One line under it.',
      submitLabel: "The main button's words.",
      terms: "The terms checkbox's words, links included.",
      providers: 'Single sign-on providers.',
      onProvider: "Called with the provider's id.",
      onSignIn: 'Shows the link to sign in.',
    },
    related: ['SignIn', 'PasswordMeter', 'AuthDone'],
  },
  {
    component: 'Flow',
    summary: 'Runs steps in one place, keeping what was typed and moving focus for you.',
    use: {
      when: ['A task that takes a few steps on one screen'],
      instead: [{ name: 'Tabs', why: 'people can go to any part in any order' }],
    },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'FlowNewProject',
            title: 'New project',
            note: 'Each step is built on first arrival and then kept, so Back never loses a value. The buttons are yours.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
    ],
    a11yNotes: [
      "The step is announced on arrival, and focus goes to `data-autofocus` or the step's title.",
    ],
    propDocs: {
      steps: 'An id, a label to announce, and `render`.',
      step: 'The current id: a state, or a value.',
      defaultStep: 'The first step, when you do not own it.',
      onStepChange: 'Called on each change.',
      history: 'Keeps the step in the URL. `true` uses `?step=`.',
      announce: 'Says "Step 2 of 4, Shipping" politely.',
    },
    related: ['Tour', 'Checkout'],
  },
  {
    component: 'PasswordMeter',
    summary: 'A strength meter and a list of rules under a new password field.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PasswordMeterLive',
            title: 'Under a password field',
            stage: 'narrow',
            height: 260,
          },
        ],
      },
    ],
    a11yNotes: ['Each rule says itself, so colour is never alone.'],
    propDocs: { value: 'The password so far.' },
    related: ['SignUp', 'ResetPassword'],
  },
  {
    component: 'OtpField',
    summary: 'A one-time code input, drawn as cells. One tab stop, and paste works.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'OtpFieldCheck',
            title: 'Checking a code',
            note: 'Type 123456 for the success cascade, anything else for the error.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'variants',
        title: 'Variants',
        examples: [{ id: 'OtpFieldFour', title: 'A masked PIN', stage: 'narrow' }],
      },
    ],
    a11yNotes: [
      'It is one real input painted into cells, so SMS autofill and native editing just work.',
    ],
    propDocs: {
      length: 'How many digits.',
      status: '`checking` while verifying, `success` for the cascade.',
      autoSubmit: 'Submits the form on the last digit.',
      onComplete: 'Called with the whole code.',
      onValueChange: 'Called on each change.',
      masked: 'Shows dots.',
    },
    related: ['OtpStep', 'MfaSetup'],
  },
  {
    component: 'OtpStep',
    summary:
      'The two-step sign-in screen: code, Verify, resend with a countdown, and another method.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'OtpStepAuthenticator',
            title: 'After the password',
            note: 'The sample code is 123456. A wrong one shows how many tries are left.',
            stage: 'narrow',
            height: 420,
          },
        ],
      },
    ],
    propDocs: {
      ...FORM_PROPS,
      title: 'The heading.',
      lede: 'Where the code went.',
      length: 'How many digits.',
      status: "Overrides the field's status.",
      hint: 'Help under the field.',
      resendIn: 'Seconds before Resend opens.',
      onResend: 'Shows Resend.',
      onOtherMethod: 'Shows "Use another method".',
      otherMethodLabel: 'Its words.',
      onBack: 'Shows Back.',
    },
    related: ['OtpField', 'SignIn'],
  },
]
