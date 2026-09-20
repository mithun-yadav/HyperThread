const { pathToFileURL } = require('node:url');
const path = require('node:path');
const tsJestTransformer = require('ts-jest').default.createTransformer({
  tsconfig: path.join(__dirname, '..', 'tsconfig.spec.json'),
  useESM: false,
});

const nestPackagePath = '/node_modules/@nestjs/';

module.exports = {
  canInstrument: tsJestTransformer.canInstrument,

  getCacheKey(sourceText, sourcePath, transformOptions) {
    return tsJestTransformer.getCacheKey(
      sourceText,
      sourcePath,
      transformOptions,
    );
  },

  process(sourceText, sourcePath, transformOptions) {
    const compatibleSource = sourcePath.includes(nestPackagePath)
      ? sourceText
          .replace(
            'const require = createRequire(import.meta.url);',
            'const nestRequire = createRequire(import.meta.url);',
          )
          .replace(
            "swagger = require('@nestjs/swagger');",
            "swagger = nestRequire('@nestjs/swagger');",
          )
          .replaceAll(
            'import.meta.url',
            JSON.stringify(pathToFileURL(sourcePath).href),
          )
          .replaceAll('import.meta.resolve', 'require.resolve')
          .replaceAll('import.meta.dirname', JSON.stringify(path.dirname(sourcePath)))
      : sourceText;

    return tsJestTransformer.process(
      compatibleSource,
      sourcePath,
      transformOptions,
    );
  },
};
