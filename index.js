const WebSocket = require('ws');
const axios = require('axios');

console.log("Starting...");
console.log("'npm start price market' to start the program--ex: npm start ethusd crypto");
// Search for a symbol based on query and category
async function search(query, category) {
    const url = `https://symbol-search.tradingview.com/symbol_search/?text=${query}&type=${category}`;
    try {
        const response = await axios.get(url);
        if (response.status === 200) {
            const data = response.data;
            if (data.length !== 0) {
                return data[0];
            } else {
                throw new Error("Nothing Found.");
            }
        }
    } catch (error) {
        console.error("Network Error!");
        process.exit(1);
    }
}

// Generate a random session ID
function generateSession() {
    const stringLength = 12;
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    let randomString = '';
    for (let i = 0; i < stringLength; i++) {
        randomString += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return "qs_" + randomString;
}

// Construct a JSON message
function constructMessage(func, paramList) {
    return JSON.stringify({"m": func, "p": paramList});
}

// Create a full message with header
function createMessage(func, paramList) {
    const content = constructMessage(func, paramList);
    return `~m~${content.length}~m~${content}`;
}

// Send a message over the WebSocket connection
function sendMessage(ws, func, args) {
    ws.send(createMessage(func, args));
}

// Send a ping packet
function sendPingPacket(ws, result) {
    const pingStr = result.match(/.......(.*)/);
    if (pingStr) {
        ws.send(`~m~${pingStr[1].length}~m~${pingStr[1]}`);
    }
}

// Handle WebSocket messages
function socketJob(ws) {
    let buffer = ''; // Buffer to store incomplete messages
    ws.onmessage = (message) => {
        const result = buffer + message.data.toString(); // Combine buffer with new data
        const messages = result.split('~m~'); // Split messages using separator
        for (const msg of messages) {
            if (msg.startsWith('{"')) { // Check if message starts with JSON
                try {
                    const jsonRes = JSON.parse(msg);
                    if (jsonRes.m === "qsd") {
                        const prefix = jsonRes.p[1];
                        const symbol = prefix.n;
                        const price = prefix.v.lp || null;
                        const volume = prefix.v.volume || null;
                        const change = prefix.v.ch || null;
                        const changePercentage = prefix.v.chp || null;
                        if (price !== null && !msg.includes('~h~')) {
                            console.log(`${symbol} -> price: ${price}, change: ${change}, changePercentage: ${changePercentage}, volume: ${volume}`);
                        }
                    }
                } catch (error) {
                    console.error("Error parsing JSON:", error);
                }
            }
        }
        buffer = ''; // Clear buffer after processing
    };
    ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
    };
    ws.onclose = () => {
        console.log("WebSocket Connection Closed");
    };
}




// Get symbol ID based on pair and market
async function getSymbolId(pair, market) {
    try {
        const data = await search(pair, market);
        const symbolName = data.symbol;
        const broker = data.prefix || data.exchange;
        const symbolId = `${broker.toUpperCase()}:${symbolName.toUpperCase()}`;
        console.log(symbolId + '\n');
        return symbolId;
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

// Main function to establish WebSocket connection and start job
async function main(pair="BTCUSD", market="crypto") {
    const symbolId = await getSymbolId(pair, market);

    const tradingViewSocket = "wss://data.tradingview.com/socket.io/websocket";
    const ws = new WebSocket(tradingViewSocket, {origin: "https://data.tradingview.com"});
    const session = generateSession();

    ws.on('open', () => {
        sendMessage(ws, "quote_create_session", [session]);
        sendMessage(ws, "quote_set_fields", [session, "lp", "volume", "ch", "chp"]);
        sendMessage(ws, "quote_add_symbols", [session, symbolId]);
    });

    socketJob(ws);
}



// Check if the main function is being called directly
if (require.main === module) {
  // Get the command line arguments
  const args = process.argv.slice(2);

  // Call the main function with the command line arguments
  main(args[0], args[1]);
}
