import { createSignal, lazy, Show, Suspense } from "solid-js";

import { avatar } from "./button";

// The menu library is most of this page's script and most visits never open it, so it comes when someone reaches for the button.
const Panel = lazy(() => import("./account-panel"));

export function AccountMenu(props: { name: string; email: string }) {
  const [wanted, setWanted] = createSignal(false);
  const Trigger = () => (
    <button type="button" aria-label="Account" aria-haspopup="menu" class={avatar} onPointerEnter={() => Panel.preload()} onFocus={() => Panel.preload()} onClick={() => setWanted(true)}>
      {props.name.charAt(0).toUpperCase()}
    </button>
  );

  return (
    <Show when={wanted()} fallback={<Trigger />}>
      <Suspense fallback={<Trigger />}>
        <Panel name={props.name} email={props.email} />
      </Suspense>
    </Show>
  );
}
