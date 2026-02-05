#!/bin/bash

cd apps/builder;
node  -e "const { configureRuntimeEnv } = require('next-runtime-env/build/configure'); configureRuntimeEnv();"
cd ../..;

if [ "$NODE_ENV" != "production" ]; then
    echo "Running migrations..."
    ./node_modules/.bin/prisma migrate deploy --schema=packages/prisma/postgresql/schema.prisma
fi

HOSTNAME=0.0.0.0 PORT=3000 node apps/builder/server.js;
