/**
 * Config plugin that patches react-native-openvpn/android/build.gradle.
 *
 * react-native-openvpn@1.0.15 ships with an outdated build.gradle that:
 *   1. Uses `apply plugin: 'maven'` — removed in Gradle 7+
 *   2. Does not declare `compileSdk` — required by AGP 8.x
 *
 * NOTE: import via 'expo/config-plugins' (not '@expo/config-plugins')
 * so pnpm resolves it through the already-installed `expo` package.
 */

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withOpenVpnFix = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      // Resolve the actual path through pnpm's symlink structure
      let openvpnDir;
      try {
        openvpnDir = path.dirname(
          require.resolve('react-native-openvpn/package.json', {
            paths: [config.modRequest.projectRoot],
          })
        );
      } catch (_) {
        console.warn('[withOpenVpnFix] react-native-openvpn not found — skipping patch');
        return config;
      }

      const buildGradlePath = path.join(openvpnDir, 'android', 'build.gradle');

      if (!fs.existsSync(buildGradlePath)) {
        console.warn('[withOpenVpnFix] build.gradle not found at', buildGradlePath);
        return config;
      }

      let content = fs.readFileSync(buildGradlePath, 'utf8');

      // Fix 1: Remove the 'maven' plugin (not available in Gradle 7+)
      content = content.replace(
        /^\s*apply\s+plugin:\s+['"]maven['"]\s*\n?/gm,
        ''
      );

      // Fix 2: Replace compileSdkVersion with compileSdk (required by AGP 8.x)
      content = content.replace(/\bcompileSdkVersion\s+/g, 'compileSdk ');

      // Fix 3: If neither exists, inject compileSdk 35 after `android {`
      if (!/\bcompileSdk\s/.test(content)) {
        content = content.replace(
          /\bandroid\s*\{/,
          'android {\n    compileSdk 35'
        );
      }

      fs.writeFileSync(buildGradlePath, content, 'utf8');
      console.log('[withOpenVpnFix] Patched react-native-openvpn/android/build.gradle ✓');

      return config;
    },
  ]);
};

module.exports = withOpenVpnFix;
