module.exports = {
    apps: [
      {
        name: 'Waapi',
        script: './app.js',
        watch: true,
        instances: "max",
        exec_mode: "cluster",
        env: {
          NODE_ENV: 'production',
        }
      },
    ],
  };