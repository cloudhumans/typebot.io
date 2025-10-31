const scope = process.env.SCOPE || 'app'

module.exports = {
  apps: [
    {
      name: scope,
      cwd: '/app',
      script: `apps/${scope}/server.js`,
      instances: 'max',
      exec_mode: 'cluster',
      env: { PORT: 3000 },
    },
  ],
}
