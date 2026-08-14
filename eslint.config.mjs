import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: ["tests/**", "playwright-report/**", "test-results/**"],
  },
];

export default config;
