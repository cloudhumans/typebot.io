const hexColorPropSelector = (container) =>
  `JSXAttribute[name.name=/^(color|bg|background|backgroundColor|borderColor|fill|stroke)$/] > ${container}Literal[value=/^#([0-9a-fA-F]{3}){1,2}$/]`

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
          // color="#fff" (string literal directly on the attribute)
          { selector: hexColorPropSelector(''), message: hexColorPropMessage },
          // color={'#fff'} (string literal inside a JSX expression container)
          {
            selector: hexColorPropSelector('JSXExpressionContainer > '),
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
      ],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
  ],
}
