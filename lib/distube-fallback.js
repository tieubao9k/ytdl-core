/**
 * DisTube ytdl-core fallback wrapper
 * Uses @distube/ytdl-core when fast mode fails
 */

const fs = require('fs');
const path = require('path');

// Import @distube/ytdl-core modules
let distubeYtdl;
try {
  // Try to load @distube/ytdl-core from node_modules
  const distubePath = path.join(process.cwd(), 'node_modules', '@distube', 'ytdl-core');
  if (fs.existsSync(distubePath)) {
    distubeYtdl = require('@distube/ytdl-core');
  } else {
    // Fallback to copied modules
    const distubeIndex = require('./distube-fallback/index');
    distubeYtdl = distubeIndex;
  }
} catch (error) {
  console.warn('DisTube fallback not available:', error.message);
  distubeYtdl = null;
}

/**
 * DisTube fallback for getBasicInfo
 */
const getBasicInfoFallback = async (id, options = {}) => {
  if (!distubeYtdl) {
    throw new Error('DisTube fallback not available');
  }
  
  console.log('🔄 Using DisTube fallback for getBasicInfo');
  return await distubeYtdl.getBasicInfo(id, options);
};

/**
 * DisTube fallback for getInfo
 */
const getInfoFallback = async (id, options = {}) => {
  if (!distubeYtdl) {
    throw new Error('DisTube fallback not available');
  }
  
  console.log('🔄 Using DisTube fallback for getInfo');
  return await distubeYtdl.getInfo(id, options);
};

/**
 * DisTube fallback for download stream
 */
const downloadFallback = (url, options = {}) => {
  if (!distubeYtdl) {
    throw new Error('DisTube fallback not available');
  }
  
  console.log('🔄 Using DisTube fallback for download');
  return distubeYtdl(url, options);
};

/**
 * Check if DisTube fallback is available
 */
const isAvailable = () => {
  return distubeYtdl !== null;
};

module.exports = {
  getBasicInfo: getBasicInfoFallback,
  getInfo: getInfoFallback,
  download: downloadFallback,
  isAvailable,
  distube: distubeYtdl
};