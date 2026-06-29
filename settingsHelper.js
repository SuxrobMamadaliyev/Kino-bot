const Settings = require('./Settings');

let cachedSettingsId = null;

/**
 * Bazada bitta Settings hujjati bo'lishini ta'minlaydi (singleton)
 */
async function getSettings() {
  let settings;
  if (cachedSettingsId) {
    settings = await Settings.findById(cachedSettingsId);
  }
  if (!settings) {
    settings = await Settings.findOne();
  }
  if (!settings) {
    settings = await Settings.create({ channels: [] });
  }
  cachedSettingsId = settings._id;
  return settings;
}

module.exports = { getSettings };
