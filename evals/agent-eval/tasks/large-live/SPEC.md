Build a small team message board at `/`. Everything is kept on the server. A restart may lose data.

- Sign-up at `/signup` and sign-in at `/signin`, with fields `Email` and `Password` and a submit button of the same name as the page's action, `Sign up` or `Sign in`. A session is kept in an httpOnly cookie. Passwords are never stored in plain text.
  - A wrong password shows `Invalid email or password`. A taken email shows `Email already in use`.
- `/` requires being signed in, and otherwise redirects to `/signin`. It shows `Signed in as <email>` and a `Sign out` button.
- A text input labelled `Message` and a `Post` button add a message. Blank is refused. Longer than 280 characters is refused by the server, with `Too long` shown to the user, even if the client's check is bypassed.
- Messages show in a list labelled `Messages`, newest first, each with its text and author's email.
- A new message appears within 2 seconds in every other signed-in browser, with no reload. A person's own post appears at once.
- Authors, and only authors, see `Delete <text>` on their messages. The server refuses to delete another user's message, whoever asks. A deletion also appears live everywhere.
- Text `N online` shows how many signed-in browsers are connected, and updates live.
- A `POST` to change data from another origin is refused.
