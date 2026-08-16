import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    // next lint scoped itself to the app source. The bare eslint CLI does not,
    // so keep build output and the Cloud Functions codebase (CommonJS, with its
    // own eslint.config.mjs) out of this config's reach.
    ignores: ["functions/**", ".next/**", "out/**", ".firebase/**", ".cache/**"],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": 'off',
      "@typescript-eslint/no-explicit-any": 'off',
    },
  },
];

export default config;
