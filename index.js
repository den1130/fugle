const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { createClient } = require('redis');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server:server, path: '/streaming' });
const socket = new WebSocket('wss://ws.bitstamp.net');
const redisClient = createClient({ url: 'redis://127.0.0.1'});

const { ipLimiter, userIdLimiter } = require('./middleware');

const url = 'https://hacker-news.firebaseio.com/v0/topstories.json?print=pretty';
const theInterval = 1 * 60 * 1000;   // Send OHLC data per minutes
let ohlcSetDone = false;
const noOhlcMsg = 'no transactions in the past 1 minute';

connectToRedis();

// Middleware for rate limiting
app.use(ipLimiter);
app.use(userIdLimiter);

app.get('/data', (req, res) => {
  fetch(url)
  .then((response) => {
    return response.json();
  })
  .then((json) => {
    res.send(json);
  })
  .catch(err => {
    res.status(500);
  })
});

wss.on('connection', async (ws) => {
  console.log('A new client has connected');
  
  // Setup socket connection
  await setSocket(ws);

  // Send subscription requests to Bitstamp Websocket API
  ws.on('message', (msg) => {
    const msgList = processUserMsg(msg);

    msgList.forEach(msg => {
      socket.send(JSON.stringify(msg));
    });
  });
});

async function connectToRedis() {
  await redisClient.connect();
}

function processUserMsg(msg) {
  msg = JSON.parse(msg);
  
  const subscribeEvent = msg.event;
  const currencyPairs = msg.currency_pairs;
  const msgList = [];

  for (let i = 0; i < currencyPairs.length; i++) {
    const channelName = 'live_trades_' + currencyPairs[i];
    const subscribeMsg = {
      event: "bts:" + subscribeEvent,
      data: {
        "channel": channelName,
      }
    }
    msgList.push(subscribeMsg);
  }

  return msgList;
}

async function sendOhlc(currencyPair, ws) {

  // Remove data over one minute
  while (true) {
    const oldestTimestamp = await redisClient.lIndex(`timestamps_${currencyPair}`, 0);

    if (oldestTimestamp) {
      if ((Math.floor(Date.now() / 1000) - oldestTimestamp) > (theInterval / 1000)) {
        await redisClient.lPop(`timestamps_${currencyPair}`);
        await redisClient.lPop(`prices_${currencyPair}`);
        console.log('Poped one price');
      } else {
        break;
      }
    } else {
      break;
    }
  }
  
  // Set updated o price
  const priceArr = await redisClient.lRange(`prices_${currencyPair}`, 0, -1);

  if (priceArr) {
    const openPrice = priceArr[0];
    const highestPrice = Math.max(...priceArr).toString();
    const lowestPrice =  Math.min(...priceArr).toString();
    const closePrice = priceArr[priceArr.length - 1];

    await redisClient.hSet(`ohlc_${currencyPair}`, {
      o: openPrice,
      h: highestPrice,
      l: lowestPrice,
      c: closePrice,
    })
  } else {
    await redisClient.hSet(`ohlc_${currencyPair}`, {
      o: noOhlcMsg,
      h: noOhlcMsg,
      l: noOhlcMsg,
      c: noOhlcMsg,
    })
  }

  // Logging results
  console.log('timestampArr', await redisClient.lRange(`timestamps_${currencyPair}`, 0, -1));
  console.log('pricesArr', await redisClient.lRange(`prices_${currencyPair}`, 0, -1));
  console.log('ohlc', await redisClient.hGetAll(`ohlc_${currencyPair}`));

  ws.send(JSON.stringify(await redisClient.hGetAll(`ohlc_${currencyPair}`)));
}


async function setSocket(ws) {
  socket.on('message', async (evt) => {
    const msg = JSON.parse(evt);
    const currencyPair = msg.channel.slice(12);

    if (msg.data.price !== undefined) {
      
      await writeToRedis(currencyPair, msg.data.price.toString(), msg.data.timestamp);
      
      ws.send(JSON.stringify({
        currency_pair: currencyPair,
        price: msg.data.price,
      }));
      
      // Send OHLC to the client every minute
      if (!ohlcSetDone) {
        setInterval(() => {
          console.log("I am doing my 1 minutes check");
          sendOhlc('btcusd', ws);
        }, theInterval);

        ohlcSetDone = true;
      }
    }
  });

  socket.on('close', () => {
    console.log('Bitstamp Socket has disconnected');
  });
};

/**
 * @param {string} currencyPair 
 * @param {string} price 
 * @param {string} timestamp 
 */
async function writeToRedis(currencyPair, price, timestamp) {
  await redisClient.rPush(`prices_${currencyPair}`, price);
  await redisClient.rPush(`timestamps_${currencyPair}`, timestamp);

  // Initialize OHLC of the currency pair in hash form
  if (await redisClient.exists(`ohlc_${currencyPair}`) === 0) {
    await redisClient.hSet(
      `ohlc_${currencyPair}`, {
        o: price,
        h: price,
        l: price,
        c: price
      }
    );
  }
}

server.listen(3000, () => {
  console.log('Listening on PORT:3000...');
});