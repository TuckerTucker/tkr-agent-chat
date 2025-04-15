import type { StorybookConfig } from '@storybook/react-vite';
import svgr from 'vite-plugin-svgr'; // Import the plugin

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-essentials",
    "@storybook/addon-onboarding",
    "@chromatic-com/storybook",
    "@storybook/experimental-addon-test"
  ],
  "framework": {
    "name": "@storybook/react-vite",
    "options": {}
  },
  // Add viteFinal to customize Vite configuration
  async viteFinal(config) {
    // Ensure config.plugins is an array
    config.plugins = config.plugins || [];

    // Add the svgr plugin
    config.plugins.push(
      svgr({
        // svgr options: https://react-svgr.com/docs/options/
        svgrOptions: {
          // Try replacing potential default black fills with currentColor
          replaceAttrValues: {
            '#000': 'currentColor',
            '#000000': 'currentColor',
            'black': 'currentColor',
          },
          // Remove dimensions to allow CSS control
          dimensions: false,
          // Apply common icon transformations (adds viewBox, sets fill="currentColor")
          icon: true,
        },
        // include: to specify which files should be processed by svgr
        // By default, it processes files ending in .svg?react
        // include: "**/*.svg?react",
      })
    );

    // Return the modified config
    return config;
  },
};
export default config;
