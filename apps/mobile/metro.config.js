// Expo's default Metro config already understands npm workspaces (monorepo) since SDK 52.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
