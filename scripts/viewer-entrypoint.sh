#!/bin/bash

cd apps/viewer;
node  -e "const { configureRuntimeEnv } = require('next-runtime-env/build/configure'); configureRuntimeEnv();"
cd ../..;

# Keep idle HTTP keep-alive sockets open longer than any upstream client / LB
# idle pool. Next standalone reads KEEP_ALIVE_TIMEOUT and applies it to
# server.keepAliveTimeout; left unset, Node defaults to 5000ms, which makes the
# server the first party to close idle sockets, triggering "Server disconnected
# without sending a response" on the caller when it reuses a dead socket.
# Closing only happens between requests, never on an in-flight one.
KEEP_ALIVE_TIMEOUT=${KEEP_ALIVE_TIMEOUT:-65000} HOSTNAME=0.0.0.0 PORT=3001 node apps/viewer/server.js;
