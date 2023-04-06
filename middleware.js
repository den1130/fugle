const maxIpReqTimes = 3;     // per minute
const maxUserIdReqTimes = 5;  // per minute
const limitedTime = 60 * 1000;    // milliseconds

const ipLog = {};
const userIdLog = {};

const ipLimiter = (req, res, next) => {
  const ip = req.ip;
  const id = req.query.user;
  
  // Update ipLog
  if (!ipLog[ip]) {
    ipLog[ip] = [new Date()];
  } else {
    ipLog[ip].push(new Date());
  }

  // Update userIdLog
  if (!userIdLog[id]) {
    userIdLog[id] = [new Date()];
  } else {
    userIdLog[id].push(new Date());
  }

  if (ipLog[ip].length > maxIpReqTimes) {
    timeDiff = calculateTimeDiff(ip, maxIpReqTimes);
    if (timeDiff <= limitedTime) {
      sendCleanedLogs(ip, id, res);
    } else {
      next();
    }
  } else {
    next();
  }
};

const userIdLimiter = (req, res, next) => {
  const ip = req.ip;
  const id = req.query.user;

  if (userIdLog[id].length > maxUserIdReqTimes) {
    timeDiff = calculateTimeDiff(id, maxUserIdReqTimes);
    if (timeDiff <= limitedTime) {
      sendCleanedLogs(ip, id, res);
    } else {
      next();
    }
  } else {
    next();
  }
}

function calculateTimeDiff(target, maxTimes) {
  const lastReqTime = ipLog[target].at(-1);
  const comparedTime = ipLog[target].at(-maxTimes);
  return lastReqTime - comparedTime;
}

// Remove request times that are not within limited time
// and respond with status code 429
function sendCleanedLogs(ip, id, res) {
  const lastReqTime = ipLog[ip].at(-1);

  for (reqTime of ipLog[ip]) {
    const timeDiff = lastReqTime - reqTime;
    if (timeDiff > limitedTime) {
      ipLog[ip].shift();
    } else {
      break;
    }
  }

  for (reqTime of userIdLog[id]) {
    const timeDiff = lastReqTime - reqTime;
    if (timeDiff > limitedTime) {
      userIdLog[id].shift();
    } else {
      break;
    }
  }

  res.status(429).send({
    ip: ipLog[ip].length,
    id: userIdLog[id].length,
  });
}

module.exports = {
  ipLimiter,
  userIdLimiter,
}