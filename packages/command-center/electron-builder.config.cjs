/**
 * electron-builder.config.cjs — Packaging configuration for Conitens Command Center
 *
 * Sub-AC 13b: Desktop deployment
 *
 * This file is intentionally CommonJS (.cjs) because electron-builder's Node.js
 * require() loading predates ESM and does not support ES modules.
 *
 * Packaging targets:
 *   Windows  → NSIS wizard installer (.exe) + portable (.exe)
 *   macOS    → DMG disk image + zip archive
 *   Linux    → AppImage + Debian package
 *
 * Usage:
 *   pnpm electron:dist           — package for current platform
 *   pnpm electron:dist:win       — Windows (requires wine on non-Windows)
 *   pnpm electron:dist:mac       — macOS (requires Xcode CLI tools on macOS)
 *   pnpm electron:dist:linux     — Linux
 *
 * Environment variables (optional, for code signing):
 *   WIN_CSC_LINK          — path or URL to Windows code-signing certificate (.pfx)
 *   WIN_CSC_KEY_PASSWORD  — certificate password
 *   CSC_LINK              — macOS Developer ID certificate (.p12)
 *   CSC_KEY_PASSWORD      — certificate password
 */

'use strict';

const { existsSync } = require('fs');
const { join } = require('path');

// Resolve icon paths only if the files actually exist.
// electron-builder uses the Electron default icon when icon files are absent,
// which is acceptable for development / CI builds.
const winIcon = existsSync(join(__dirname, 'build/icons/win/icon.ico'))
  ? 'build/icons/win/icon.ico'
  : undefined;

const macIcon = existsSync(join(__dirname, 'build/icons/mac/icon.icns'))
  ? 'build/icons/mac/icon.icns'
  : undefined;

const linuxIcon = existsSync(join(__dirname, 'build/icons/linux'))
  ? 'build/icons/linux'
  : undefined;

/** @type {import('electron-builder').Configuration} */
module.exports = {
  // ── App identity ───────────────────────────────────────────────────────────
  appId: 'com.conitens.command-center',
  productName: 'Conitens Command Center',
  copyright: 'Copyright © 2024-2025 Conitens Contributors',

  // ── Main process entry ─────────────────────────────────────────────────────
  // Points to the esbuild-compiled CommonJS output.
  // This overrides the `main` field in package.json for the packaged app.
  main: 'dist-electron/main.cjs',

  // ── Directories ────────────────────────────────────────────────────────────
  directories: {
    // Platform-specific assets (icons, NSIS scripts, entitlements).
    buildResources: 'build',
    // Packaged artifact output (installers, DMGs, AppImages).
    output: 'release',
  },

  // ── Files to include in the package ───────────────────────────────────────
  files: [
    // Web build output produced by: vite build --mode electron
    'dist/**/*',
    // Compiled Electron main + preload produced by: build:electron-main
    'dist-electron/**/*',
    // Package manifest — electron-builder reads version, description, etc.
    'package.json',
  ],

  // ── ASAR ──────────────────────────────────────────────────────────────────
  // Pack all app files into an ASAR archive (read-only, tamper-evident).
  // Improves startup time and prevents casual inspection of source files.
  asar: true,

  // ── Compression ───────────────────────────────────────────────────────────
  // 'normal' — good balance between build time and artifact size.
  // Use 'maximum' for release builds at the cost of longer build times.
  compression: 'normal',

  // ── Auto-update ────────────────────────────────────────────────────────────
  // Local-only deployment: auto-update is intentionally disabled.
  // To enable, configure `publish` with a GitHub releases URL or custom server,
  // and integrate electron-updater in the main process.
  publish: null,

  // ── Windows ───────────────────────────────────────────────────────────────
  win: {
    target: [
      // Full NSIS wizard installer (x64 + arm64).
      { target: 'nsis', arch: ['x64', 'arm64'] },
      // Portable single-file executable (x64 only) — no install required.
      { target: 'portable', arch: ['x64'] },
    ],
    // Request standard user execution level (no UAC prompt for regular use).
    requestedExecutionLevel: 'asInvoker',
    // Artifact naming: Conitens-Command-Center-Setup-1.0.0.exe
    artifactName: '${productName}-Setup-${version}-${arch}.${ext}',
    ...(winIcon ? { icon: winIcon } : {}),
  },

  // ── NSIS installer options ─────────────────────────────────────────────────
  nsis: {
    // Show the installation wizard (not one-click) so users can choose the directory.
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Conitens Command Center',
    // Keep user data (localStorage, config) when uninstalling.
    deleteAppDataOnUninstall: false,
    // License file (optional — uncomment if you want to show it in the wizard).
    // license: '../../LICENSE',
  },

  // ── macOS ──────────────────────────────────────────────────────────────────
  mac: {
    target: [
      // DMG for direct download distribution (x64 + Apple Silicon).
      { target: 'dmg', arch: ['x64', 'arm64'] },
      // ZIP for auto-update compatibility.
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
    category: 'public.app-category.developer-tools',
    // Hardened runtime is required for notarization.
    hardenedRuntime: true,
    // Skip Gatekeeper assessment (for local / dev builds).
    gatekeeperAssess: false,
    // Entitlements required for Electron + hardened runtime.
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    artifactName: '${productName}-${version}-${arch}.${ext}',
    ...(macIcon ? { icon: macIcon } : {}),
  },

  // ── DMG options ────────────────────────────────────────────────────────────
  dmg: {
    // Window dimensions for the DMG mount view.
    window: { width: 660, height: 400 },
    // Standard drag-to-Applications layout.
    contents: [
      { x: 180, y: 170, type: 'file' },
      { x: 480, y: 170, type: 'link', path: '/Applications' },
    ],
  },

  // ── Linux ──────────────────────────────────────────────────────────────────
  linux: {
    target: [
      // AppImage — portable, runs on any modern Linux distribution.
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      // Debian/Ubuntu .deb package.
      { target: 'deb', arch: ['x64'] },
    ],
    category: 'Development',
    description: 'Conitens AI Agent Orchestration Command Center — 3D control plane GUI',
    // Desktop integration metadata.
    desktop: {
      StartupNotify: 'false',
      Terminal: 'false',
    },
    artifactName: '${productName}-${version}-${arch}.${ext}',
    ...(linuxIcon ? { icon: linuxIcon } : {}),
  },
};
