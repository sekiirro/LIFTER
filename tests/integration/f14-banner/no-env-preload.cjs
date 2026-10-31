/* eslint-disable @typescript-eslint/no-require-imports -- Node's --require preload must be CommonJS. */
const fs = require('node:fs');
const path = require('node:path');

function isBlocked(file) {
  if (typeof file !== 'string' && !Buffer.isBuffer(file)) return false;
  const name = path.basename(String(file)).toLowerCase();
  return name.startsWith('.env') || name === 'opencode.json';
}

function blockedError() {
  const error = new Error('Access blocked by F14 capture guard');
  error.code = 'ENOENT';
  return error;
}

function blockedValue(file, options) {
  const name = path.basename(String(file)).toLowerCase();
  if (name === 'opencode.json') throw blockedError();
  const encoding = typeof options === 'string' ? options : options?.encoding;
  return encoding ? '' : Buffer.alloc(0);
}

const readFileSync = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  if (isBlocked(file)) return blockedValue(file, args[0]);
  return readFileSync.call(this, file, ...args);
};

const readFile = fs.readFile;
fs.readFile = function (file, ...args) {
  if (!isBlocked(file)) return readFile.call(this, file, ...args);
  const callback = args.findLast((value) => typeof value === 'function');
  if (path.basename(String(file)).toLowerCase() === 'opencode.json') {
    process.nextTick(() => callback?.(blockedError()));
    return;
  }
  const options = args.find(
    (value) => typeof value === 'string' || typeof value === 'object',
  );
  process.nextTick(() => callback?.(null, blockedValue(file, options)));
};

const promiseReadFile = fs.promises.readFile;
fs.promises.readFile = function (file, ...args) {
  if (isBlocked(file)) {
    if (path.basename(String(file)).toLowerCase() === 'opencode.json')
      return Promise.reject(blockedError());
    return Promise.resolve(blockedValue(file, args[0]));
  }
  return promiseReadFile.call(this, file, ...args);
};
