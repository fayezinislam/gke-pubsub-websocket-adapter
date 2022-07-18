
import WebSocket from 'ws';

const clArgs = process.argv.slice(2);
var wsUrl = clArgs[0];
wsUrl = "wss://" + wsUrl;

var ws = new WebSocket(wsUrl);

ws.onmessage = function(event) {
  console.log(event.data);
};

