const { config } = require('./config');
const { readJson, writeJson } = require('./helpers');

function getHourKey(date = new Date()) {
  return date.toISOString().slice(0, 13);
}

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function loadRateLimits() {
  return readJson(config.paths.rateLimits, {
    hourly: {},
    daily: {},
  });
}

function saveRateLimits(data) {
  writeJson(config.paths.rateLimits, data);
}

function getCurrentCounts(now = new Date()) {
  const data = loadRateLimits();
  const hourKey = getHourKey(now);
  const dayKey = getDayKey(now);

  return {
    hourCount: data.hourly[hourKey] || 0,
    dayCount: data.daily[dayKey] || 0,
    hourKey,
    dayKey,
  };
}

function canSendMore(now = new Date()) {
  const { hourCount, dayCount } = getCurrentCounts(now);

  if (dayCount >= config.maxWalletsPerDay) {
    return {
      allowed: false,
      reason: `Daily limit reached (${config.maxWalletsPerDay}/day)`,
      hourCount,
      dayCount,
    };
  }

  if (hourCount >= config.maxWalletsPerHour) {
    return {
      allowed: false,
      reason: `Hourly limit reached (${config.maxWalletsPerHour}/hour)`,
      hourCount,
      dayCount,
    };
  }

  return {
    allowed: true,
    reason: null,
    hourCount,
    dayCount,
    remainingHour: config.maxWalletsPerHour - hourCount,
    remainingDay: config.maxWalletsPerDay - dayCount,
  };
}

function recordSend(now = new Date()) {
  const data = loadRateLimits();
  const hourKey = getHourKey(now);
  const dayKey = getDayKey(now);

  data.hourly[hourKey] = (data.hourly[hourKey] || 0) + 1;
  data.daily[dayKey] = (data.daily[dayKey] || 0) + 1;

  saveRateLimits(data);

  return getCurrentCounts(now);
}

function getRateLimitReport() {
  const check = canSendMore();
  return {
    ...check,
    limits: {
      perHour: config.maxWalletsPerHour,
      perDay: config.maxWalletsPerDay,
    },
  };
}

module.exports = {
  canSendMore,
  recordSend,
  getRateLimitReport,
  getCurrentCounts,
};
