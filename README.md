# Start the server:
1. Run `npm index`
2. Run `redis-server` (at _redis://127.0.0.1_)

# WebSocket API:
1. Setup websocket connection to _ws://localhost:3000/streaming_
2. Send subscribe/unsubscribe message with the following stucture:

```
{  
  "event": (subscribe_action),  
  "currency_pairs": [(currency_pair1), (currency_pair2), ...]  
}  
```

- Please replace the placeholder (subscribe_action) with either "subscribe" or "unsubscribe".
- Please replace the placeholder (currency_pair) with the currency pair to be subscribed or unsubscribed.
- Mutiple currency pairs are allowed.
- Currency pairs options are limited to the ones provided at "https://www.bitstamp.net/websocket/v2/".

For example:
```
{  
  "event": "subscribe",  
  "currency_pairs": ["btcusd", "btceur", "btcgbp"]  
}  
```
The User will get streaming data and OHLC data for each subscribed currency pair every minute.
 
