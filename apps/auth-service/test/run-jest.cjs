const { spawnSync } = require('node:child_process');

const jestArguments = process.argv.slice(2).filter((argument) => argument !== '--');
const result = spawnSync(
  process.execPath,
  [require.resolve('jest/bin/jest'), ...jestArguments],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
