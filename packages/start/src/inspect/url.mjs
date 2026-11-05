export const fillPath = (route, params) =>
  route.pattern.replace(/\$([\w$]*)/g, (_, n) => String(params[n || route.splat]))
