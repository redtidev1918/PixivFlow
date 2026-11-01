// Express 5 types route parameters as string | string[]. A repeated
// parameter is never a valid single identifier in this codebase: narrow it to
// an empty string so the existing validators (regex guards, parseInt, truthy
// checks) reject it through their normal 400 paths.
export function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? '' : (value ?? '');
}
