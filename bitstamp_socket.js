const { redisClient } = require('./redisdb');
const { WebSocket } = require('ws');

const socket = new WebSocket('wss://ws.bitstamp.net');
const theInterval = 1 * 60 * 1000;   // Send OHLC data per minutes
const noOhlcMsg = 'no transactions in the past 1 minute';
let ohlcSetDone = false;

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

  if (priceArr.length !== 0) {
    const openPrice = priceArr[0];
    const highestPrice = Math.max(...priceArr).toString();
    const lowestPrice =  Math.min(...priceArr).toString();
    const closePrice = priceArr[priceArr.length - 1];

    console.log('ohlc', openPrice, highestPrice, lowestPrice, closePrice);
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

module.exports = {
  socket,
  setSocket,
}