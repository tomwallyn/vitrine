module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // reanimated 4 (SDK 54) : plugin worklets OBLIGATOIRE, en dernier.
    plugins: ['react-native-worklets/plugin'],
  };
};
