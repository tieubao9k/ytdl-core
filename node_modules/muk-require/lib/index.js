const Module = require('module');
const path   = require('path');


/**
 * Mocks a call to `require()`
 *
 * @param {string} filename
 * @param {Object} deps
 */
module.exports = (filename, deps) => {
  filename = Module._resolveFilename(filename, module.parent);
  const m = require.cache[filename] = new Module(filename, module.parent);
  m.filename = filename;
  m.paths = Module._nodeModulePaths(path.dirname(filename));

  // Load children.
  const children = {};
  for (let key in deps) {
    const childpath = Module._resolveFilename(key, m);
    const child = children[childpath] = new Module(childpath, m);
    require.cache[childpath] = child;
    child.paths = Module._nodeModulePaths(path.dirname(childpath));
    child.loaded = true;
    child.exports = deps[key];
  }

  m.require = (path) => {
    const childpath = Module._resolveFilename(path, m);
    const child = children[childpath];
    if (child) {
      return child.exports;
    } else {
      return Module._load(path, m);
    }
  };

  // Load module.
  m.load(filename);

  // Clear so mocked modules can be required normally.
  delete require.cache[filename];
  for (let key in deps) {
    let childpath = Module._resolveFilename(key, m);
    delete require.cache[childpath];
  }

  return m.exports;
};

// Delete this module from the cache so that the next time it gets
// require()'d it will be aware of the new parent
// in case it gets require()'d from a different directory
delete require.cache[require.resolve(__filename)];
