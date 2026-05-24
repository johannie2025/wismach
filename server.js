services:
  - type: web
    name: wismach-server
    env: node
    buildCommand: npm install
    startCommand: node server.js
    plan: free
    healthCheckPath: /ping
