import { Title } from "@solidjs/meta";

import { NotFound } from "~/components/states";

export default function Missing() {
  return (
    <>
      <Title>Page not found · Commonplace</Title>
      <NotFound what="Nothing on this shelf" />
    </>
  );
}
