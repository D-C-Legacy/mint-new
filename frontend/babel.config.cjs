module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-worklets must be last — it rewrites the functions Reanimated marks as
    // worklets, so any earlier plugin that still needs to see the original function body has to
    // run first.
    plugins: ["react-native-worklets/plugin"],
  };
};
