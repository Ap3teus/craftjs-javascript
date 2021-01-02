#!/bin/bash
# Builds CraftJS Java and JS components
set -euo pipefail

echo "Compiling core TS to JS..."
npm run tsc --prefix=core
npm run tsc --prefix=internal

echo "Preparing production-only node_modules..."
cd core
mv node_modules ../core_modules.temp
npm ci --only=prod
cd ../internal
mv node_modules ../internal_modules.temp
npm ci --only=prod

echo "Compiling and generating jar..."
cd ../java
mvn clean package
cd ..

echo "Restoring original node_modules..."
rm -rf core/node_modules
mv core_modules.temp core/node_modules
rm -rf internal/node_modules
mv internal_modules.temp internal/node_modules

echo "DONE! craftjs.jar built at java/target"