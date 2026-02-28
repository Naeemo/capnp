#!/bin/bash
# NPM 发布脚本

echo "Building package..."
npm run build

echo "Running tests..."
npm test

echo "Publishing to NPM..."
npm publish --access public

echo "Done!"
