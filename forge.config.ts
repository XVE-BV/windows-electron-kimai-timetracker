import type { ForgeConfig } from '@electron-forge/shared-types';
import { execSync } from 'child_process';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';
import { preloadConfig } from './webpack.preload.config';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Kimai Time Tracker',
    executableName: 'kimai-timetracker',
    icon: './src/assets/favicon',
    extraResource: ['./src/assets'],
    // Note: macOS requires ad-hoc signing for Keychain access
    // Run after build: codesign -f -s - --deep "out/Kimai Time Tracker-darwin-arm64/Kimai Time Tracker.app"
  },
  rebuildConfig: {},
  hooks: {
    postPackage: async (config, options) => {
      // Ad-hoc sign macOS apps for Keychain access (safeStorage)
      if (options.platform === 'darwin') {
        const appPath = `${options.outputPaths[0]}/${config.packagerConfig.name}.app`;
        console.log(`Ad-hoc signing: ${appPath}`);
        try {
          execSync(`codesign -f -s - --deep "${appPath}"`, { stdio: 'inherit' });
          console.log('Ad-hoc signing complete');
        } catch (error) {
          console.error('Ad-hoc signing failed:', error);
        }
      }
    },
  },
  makers: [
    new MakerSquirrel({
      name: 'KimaiTimeTracker',
      setupIcon: './src/assets/favicon.ico',
      setupExe: 'KimaiTimeTracker-Windows-Setup.exe',
    }),
    new MakerDMG({
      name: 'KimaiTimeTracker-macOS',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({
      options: {
        name: 'kimai-timetracker',
        productName: 'Kimai Time Tracker',
        maintainer: 'XVE BV',
        homepage: 'https://github.com/XVE-BV/windows-electron-kimai-timetracker',
      },
    }),
    new MakerRpm({
      options: {
        name: 'kimai-timetracker',
        productName: 'Kimai Time Tracker',
        homepage: 'https://github.com/XVE-BV/windows-electron-kimai-timetracker',
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      port: 3847,
      loggerPort: 3848,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
              config: preloadConfig,
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    // NOTE: Disabled on macOS due to notification issues
    ...(process.platform !== 'darwin'
      ? [
          new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
          }),
        ]
      : []),
  ],
};

export default config;
