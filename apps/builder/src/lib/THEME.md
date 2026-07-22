# Theme & design-system alignment

`apps/builder/src/lib/theme.ts` is the single place where Typebot's Chakra
theme is overridden to align with Claudia's design system (`claudia-app`).
This doc captures the conventions so new code (human or agent) doesn't
reintroduce raw hex or accidentally "fix" something that's intentionally off-token.

## `blue` is an alias of `primary`, not a separate color

Typebot's upstream hardcodes `colorScheme="blue"` (and `blue.NNN` literals) as
the de-facto primary color across roughly 82 files in the builder. Renaming
`blue` fork-wide would conflict with every upstream merge, so instead
`theme.ts` aliases it centrally:

```ts
const primary = { 50: '#fff0e9', ..., 500: '#ff8638', 600: '#e1580e', ... }

export const colors = {
  primary,
  brand: primary,
  blue: primary, // back-compat alias — upstream hardcodes colorScheme="blue"
  ...
}
```

**For direct color/bg props (`bg="..."`, `color="..."`, `borderColor="..."`),
reference `primary` or `brand`, never `blue`.** `blue` only exists so
old/upstream call sites keep working without a rename.

**For Chakra's `colorScheme` prop, keep `colorScheme="blue"`.** Do not switch
it to `colorScheme="primary"` — the `Button`/`Alert` variant overrides in
`theme.ts` match on `colorScheme === 'blue'` literally (it's how the alias is
wired for Chakra's variant system), so `colorScheme="primary"` would miss
those overrides and fall back to Chakra's generic/default styling instead of
Claudia's primary color. `blue` as a `colorScheme` value _is_ the alias in
practice; only the `colors.blue` object underneath is what got remapped.

## Never hardcode hex in color props — extend the theme instead

Don't write `color="#ff8638"` or `bg="#e1580e"` in a component. Always go
through a theme token (`primary`, `brand`, `red`, `gray`, ...) so the color
lives in one place and stays in sync with Claudia. If you need a color that
doesn't exist yet in `theme.ts`, add it there (with the same
hex → `--color-ca-*` mapping comment convention shown below), not inline at
the call site.

An ESLint rule (`apps/builder/.eslintrc.js`, issue #174) flags raw hex in JSX
color props as a warning to catch new instances of this.

## Mapping a new color to Claudia

Claudia's design tokens live in
`claudia-app/src/modules/ui/styles/_colors.css` (88 `--color-ca-*` tokens).
When you add or change a color in `theme.ts`:

1. Find the closest `--color-ca-*` token in `_colors.css` (Claudia is the
   source of truth for the palette).
2. Copy its hex value into `theme.ts`.
3. Leave a comment citing the source token, the same way the existing
   mappings do, e.g.:

```ts
// Maps to Claudia's `--destructive` design token (_shadCn.css). 500 is the
// light-mode `--destructive`, 400 is the dark-mode `--destructive-foreground`.
red: { 50: '#ffe0e2', ..., 500: '#e7000b', ... }
```

```ts
// dark bg: rgba(11,118,183,.2) -> --color-ca-cyan-dark @ 20% (dark:/20)
// light bg: #d0f0fd -> --color-ca-cyan-light-3
```

If the closest Claudia token lives in a different stylesheet than
`_colors.css` (e.g. `_shadCn.css` for semantic tokens like `--destructive`),
cite that file instead — the point is every hex value in `theme.ts` should
be traceable back to a named source token, not invented.

## Alert `info` = Claudia cyan

`status="info"` on Chakra's `Alert` maps to `colorScheme="blue"` upstream,
but info callouts are intentionally kept on Claudia's cyan rather than
following the `primary`/`blue` remap — see the `Alert` style override in
`theme.ts` and `AlertInfo.tsx` (which sets the same colors explicitly so it
doesn't depend on the Chakra-level override).

## Validate inside CloudChat, not just standalone

Typebot builder runs embedded inside CloudChat (the micro-frontend host).
Always check theme/color changes rendered inside CloudChat, not only at
`localhost:3002` standalone — CSS cascade and host styles can differ. See the
`uat` agent or ask `cloudchat` to confirm the MF wrapper looks right.

## What does NOT align with Claudia (on purpose)

These are intentionally off-token. Don't "fix" them with a blind
hex → token replace:

- **Illustrations** (`**/*Illustration.tsx`, e.g. embed type illustrations
  under `features/publish/components/embeds/EmbedTypeMenu/illustrations/`) —
  decorative, multi-color SVG art, not UI chrome.
- **Brand/third-party logos** (`**/logos/**`, `TypebotLogo.tsx`,
  `GoogleLogo.tsx`, e.g. `ShopifyLogo.tsx`) — must render the real brand
  color, not Claudia's palette.
- **Block-type semantic colors** — the per-block-type accent colors in the
  editor (`BlockIcon.tsx`, `ForgedBlockIcon.tsx` and friends) are a separate
  semantic system used to visually distinguish block types in the flow
  graph; they intentionally don't map 1:1 onto the primary/brand palette.

## Known legacy debt: Claudia hex in `useColorModeValue`

`AlertInfo.tsx` and `RestApiCredentialsModal.tsx` (from #266) call
`useColorModeValue('#d0f0fd', 'rgba(11,118,183,.2)')`-style pairs with the
Claudia-sourced hex values inlined directly, instead of going through a named
token. This is real drift from the "always a token" rule above — it exists
because there's no shared TS token module to import from yet, only the CSS
custom properties in `claudia-app`. The ESLint rule (issue #174) flags these
as `warn`, on purpose: don't add them to the allowlist. They're debt to burn
by extracting a `claudia-tokens.ts` (or similar) that both files import from,
not an intentional exception like illustrations/logos/block colors above.
