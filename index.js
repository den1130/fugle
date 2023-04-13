const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server:server, path: '/streaming' });
const { socket, setSocket } = require('./bitstamp_socket');
const { redisClient, connectToRedis } = require('./redisdb');

const { ipLimiter, userIdLimiter } = require('./middleware');

const url = 'https://hacker-news.firebaseio.com/v0/topstories.json?print=pretty';

connectToRedis();

// Middleware for rate limiting
app.use(ipLimiter);
app.use(userIdLimiter);

// Send data for part 1 & part 2
app.get('/data', (req, res) => {
  fetch(url)
  .then((response) => {
    return response.json();
  })
  .then((json) => {
    res.send({
      result: json,
    });
  })
  .catch(err => {
    res.status(500);
  })
});

/*
 * Receive subscription/unsubscription message from the client
 * and send live ticker data back
 * 
 * Client message example:
 * 
 * {
 *  "event": subscribe,
 *  "currency_pairs": ["btcusd", "btceur"],
 * }
 * 
 */
wss.on('connection', async (ws) => {
  console.log('A new client has connected');
  
  // Setup Bitstamp socket connection
  await setSocket(ws);

  // Send subscription requests to Bitstamp Websocket API
  ws.on('message', (msg) => {
    const msgList = processUserMsg(msg);
    
    msgList.forEach(msg => {
      socket.send(JSON.stringify(msg));
    });
  });
});

function processUserMsg(msg) {
  msg = JSON.parse(msg);
  
  const subscribeEvent = msg.event;
  const currencyPairs = msg.currency_pairs;
  const msgList = [];

  currencyPairs.forEach(currencyPair => {
    const channelName = 'live_trades_' + currencyPair;
    const subscribeMsg = {
      event: "bts:" + subscribeEvent,
      data: {
        "channel": channelName,
      }
    }
    
    if (subscribeEvent === 'unsubscribe') {
      redisClient.sRem('currency_pairs', currencyPair);
      console.log(`${currencyPair} unsubscribed`);
    }

    msgList.push(subscribeMsg);
  })

  return msgList;
}

server.listen(3000, () => {
  console.log('Listening on PORT:3000...');
});