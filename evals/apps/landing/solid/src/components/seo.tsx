import { Meta, Title } from "@solidjs/meta";

export function Seo(props: { title: string; description: string }) {
  return (
    <>
      <Title>{props.title}</Title>
      <Meta name="description" content={props.description} />
      <Meta property="og:title" content={props.title} />
      <Meta property="og:description" content={props.description} />
      <Meta property="og:type" content="website" />
    </>
  );
}
