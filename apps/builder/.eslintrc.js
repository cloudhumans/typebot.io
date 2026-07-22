const hexRegex = '/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/'

// Descendant combinator (not direct-child `>`) on purpose: a hex literal can
// be nested arbitrarily deep in the attribute value — e.g.
// bg={isDark ? '#111' : '#222'} — not just a bare string or a single
// JSXExpressionContainer wrapper.
const hexColorPropSelector = `JSXAttribute[name.name=/^(color|bg|bgColor|background|backgroundColor|borderColor|fill|stroke)$/] Literal[value=${hexRegex}]`

// useColorModeValue('#fff', '#000') is caught separately, regardless of
// where its result is used — Chakra's light/dark helper is almost always
// assigned to an intermediate const (e.g. `const bg = useColorModeValue(...)`)
// and only the identifier ends up in the JSX attribute, so the selector
// above never sees the literal (see AlertInfo.tsx / RestApiCredentialsModal.tsx).
const hexUseColorModeValueSelector = `CallExpression[callee.name='useColorModeValue'] > Literal[value=${hexRegex}]`

const hexColorPropMessage =
  'Raw hex color in a UI color prop. Use a theme token (primary/brand/red/...) instead of hex — see apps/builder/src/lib/THEME.md.'

module.exports = {
  root: true,
  extends: ['custom'],
  overrides: [
    {
      // Issue #174: catch new raw hex in color props so the design-system
      // tokens in src/lib/theme.ts stay the single source of truth. `warn`
      // (not `error`) — there's legacy debt (see src/lib/THEME.md), this is
      // meant to stop it growing, not block everything at once.
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      rules: {
        'no-restricted-syntax': [
          'warn',
          { selector: hexColorPropSelector, message: hexColorPropMessage },
          {
            selector: hexUseColorModeValueSelector,
            message: hexColorPropMessage,
          },
        ],
      },
    },
    {
      // Intentionally off-token, do not "fix" with a blind hex->token
      // replace (see src/lib/THEME.md "What does NOT align" section):
      // - decorative illustrations (multi-color SVG art, not UI chrome)
      // - brand/third-party logos (must render the real brand color)
      // - the per-block-type accent palette in the flow editor, which is a
      //   separate semantic system by convention (currently expressed via
      //   theme color tokens rather than raw hex, but exempted here too in
      //   case a block-type accent is ever added as a literal hex)
      files: [
        'src/**/*Illustration.tsx',
        'src/**/logos/**/*.ts',
        'src/**/logos/**/*.tsx',
        'src/**/*Logo.tsx',
        'src/features/editor/components/BlockIcon.tsx',
        'src/features/forge/ForgedBlockIcon.tsx',
      ],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
  ],
}
