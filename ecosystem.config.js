module.exports = {
  apps: [
    {
      name: 'viewer',
      cwd: '/app/apps/viewer',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      pre_start:
        'node -e "const { configureRuntimeEnv } = require(\'next-runtime-env/build/configure\'); configureRuntimeEnv();"',
      env: {
        PORT: 3000,
      },
    },
    {
      name: 'builder',
      cwd: '/app/apps/builder',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      pre_start:
        'node -e "const { configureRuntimeEnv } = require(\'next-runtime-env/build/configure\'); configureRuntimeEnv();"',
      env: {
        PORT: 3000,
      },
    },
  ],
}
