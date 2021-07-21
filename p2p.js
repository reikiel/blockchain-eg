// needs to find and connect peers, deploy servers that are used to discover other peers, and get an available TCP poty
// discovery-swarm: used to create a network swarm that uses discovery-channel to find and connect peers
// dat-swarm-defaults: deploys servers that used to discover other peers
// get-port: gets available TCP ports
const crypto = require("crypto");
const Swarm = require("discovery-swarm");
const defaults = require("dat-swarm-defaults");
const getPort = require("get-port");
const CronJob = require("cron").CronJob;
const express = require("express");
const bodyParser = require("body-parser");
const wallet = require("./wallet");
const chain = require("./chain");

const peers = {};
let connSeq = 0;
let channel = "myBlockchain";

// variables to keep track of registered miners as well as who mined the last block so we can assign next block to next miner
let registeredMiners = [];
let lastBlockMinedBy = null;

// figure out purpose of messages
// define a switch mechanism so diff message types will be used for diff functions
// request and receive blocks - allows you to sync new peers that enter the P2P network and sync for any additional blocks you generate after the genesis block creation
// before registering a peer as miner, request to receive all existing miners in the network, then add that peer in the registeredMiners object by running a timer to update your miners every 5s
let MessageType = {
  REQUEST_BLOCK: "requestBlock",
  RECEIVE_NEXT_BLOCK: "receiveNextBlock",
  RECEIVE_NEW_BLOCK: "receiveNewBlock",
  REQUEST_ALL_REGISTERED_MINERS: "requestAllRegisterMiners",
  REGISTER_MINER: "registerMiner",
};

const myPeerId = crypto.randomBytes(32);
console.log("myPeerId: " + myPeerId.toString("hex"));

chain.createDb(myPeerId.toString("hex"));

// for api
let initHttpServer = (port) => {
  let http_port = "80" + port.toString().slice(-2);
  let app = express();
  app.use(bodyParser.json());

  // retrieve all blocks
  app.get("/blocks", (req, res) => res.send(JSON.stringify(chain.blockchain)));

  // retrieve one block
  app.get("/getBlock", (req, res) => {
    let blockIndex = req.query.index;
    res.send(chain.blockchain[blockIndex]);
  });

  // retrieve LevelDB entry based on an index
  app.get("/getDBBock", (req, res) => {
    let blockIndex = req.query.index;
    chain.getDbBlock(blockIndex, res);
  });

  // utilise wallet.js file to generate keys
  app.get("/getWallet", (req, res) => {
    res.send(wallet.initWallet());
  });

  app.listen(http_port, () =>
    console.log("Listening http on port: " + http_port)
  );
};

const config = defaults({
  id: myPeerId,
});

const swarm = Swarm(config);

// async function to continuously monitor swarm.on event messages
(async () => {
  const port = await getPort();

  initHttpServer(port);

  swarm.listen(port);
  console.log("Listening port: " + port);

  swarm.join(channel);
  swarm.on("connection", (conn, info) => {
    const seq = connSeq;
    const peerId = info.id.toString("hex");
    console.log(`Connected #${seq} to peer: ${peerId}`);

    // ensure the network connection stays with peers
    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600);
      } catch (err) {
        console.log("err: ", err);
      }
    }

    conn.on("data", (data) => {
      let message = JSON.parse(data);
      console.log("----------- Received Message start -------------");
      console.log(
        "from: " + peerId.toString("hex"),
        "to: " + peerId.toString(message.to),
        "my: " + myPeerId.toString("hex"),
        "type: " + JSON.stringify(message.type)
      );
      console.log("----------- Received Message end -------------");

      // handle different types of messages
      switch (message.type) {
        case MessageType.REQUEST_BLOCK:
          console.log("-----------REQUEST_BLOCK START-------------");
          let requestedIndex = JSON.parse(JSON.stringify(message.data)).index;
          let requestedBlock = chain.getBlock(requestedIndex);
          if (requestedBlock)
            writeMessageToPeerToId(
              peerId.toString("hex"),
              MessageType.RECEIVE_NEXT_BLOCK,
              requestedBlock
            );
          else console.log("No block found @ index: " + requestedIndex);
          console.log("-----------REQUEST_BLOCK END-------------");
          break;
        case MessageType.RECEIVE_NEXT_BLOCK:
          console.log("-----------RECEIVE_NEXT_BLOCK START-------------");
          chain.addBlock(JSON.parse(JSON.stringify(message.data)));
          console.log(JSON.stringify(chain.blockchain));
          let nextBlockIndex = chain.getLatestBlock().index + 1;
          console.log("-- request next block @ index: " + nextBlockIndex);
          writeMessageToPeers(MessageType.REQUEST_BLOCK, {
            index: nextBlockIndex,
          });
          console.log("-----------RECEIVE_NEXT_BLOCK START-------------");
          break;
        case MessageType.RECEIVE_NEW_BLOCK:
          if (
            message.to === myPeerId.toString("hex") &&
            message.from !== myPeerId.toString("hex")
          ) {
            console.log(
              "-----------RECEIVE_NEW_BLOCK START------------- " + message.to
            );
            chain.addBlock(JSON.parse(JSON.stringify(message.data)));
            console.log("Blockchain: " + JSON.stringify(chain.blockchain));
            console.log(
              "-----------RECEIVE_NEW_BLOCK END------------- " + message.to
            );
          }
          break;
        case MessageType.REQUEST_ALL_REGISTERED_MINERS:
          console.log(
            "-----------REQUEST_ALL_REGISTER_MINERS START------------- " +
              message.to
          );
          writeMessageToPeers(MessageType.REGISTER_MINER, registeredMiners);
          registeredMiners = JSON.parse(JSON.stringify(message.data));
          console.log(
            "-----------REQUEST_ALL_REGISTER_MINERS END------------- " +
              message.to
          );
          break;
        case MessageType.REGISTER_MINER:
          console.log(
            "-----------REGISTER_MINER START------------- " + message.to
          );
          let miners = JSON.stringify(message.data);
          registeredMiners = JSON.parse(miners);
          console.log(registeredMiners);
          console.log(
            "-----------REGISTER_MINER END------------- " + message.to
          );
          break;
      }
    });

    // indicates you lost a connection with peers and delete from peers array
    // unregister a miner once connection with the miner is closed or lost
    conn.on("close", () => {
      console.log(`Connection ${seq} closed, peerId: ${peerId}`);
      if (peers[peerId].seq === seq) {
        delete peers[peerId];
        console.log(
          "--- registeredMiners before: " + JSON.stringify(registeredMiners)
        );
        let index = registeredMiners.indexOf(peerId);
        if (index > -1) registeredMiners.splice(index, 1);
        console.log(
          "--- registeredMiners after: " + JSON.stringify(registeredMiners)
        );
      }
    });

    // create new peer if doesnt exist in peers object
    if (!peers[peerId]) {
      peers[peerId] = {};
    }

    peers[peerId].conn = conn;
    peers[peerId].seq = seq;
    connSeq++;
  });
})();

// send message to all connected peers
writeMessageToPeers = (type, data) => {
  for (let id in peers) {
    console.log("-------- writeMessageToPeers start -------- ");
    console.log("type: " + type + ", to: " + id);
    console.log("-------- writeMessageToPeers end ----------- ");
    sendMessage(id, type, data);
  }
};

// send message to specific peer via id
writeMessageToPeerToId = (toId, type, data) => {
  for (let id in peers) {
    if (id === toId) {
      console.log("-------- writeMessageToPeerToId start -------- ");
      console.log("type: " + type + ", to: " + toId);
      console.log("-------- writeMessageToPeerToId end ----------- ");
      sendMessage(id, type, data);
    }
  }
};

// message needs to be a string and not an object
// share message over p2p network
sendMessage = (id, type, data) => {
  peers[id].conn.write(
    JSON.stringify({
      to: id,
      from: myPeerId,
      type: type,
      data: data,
    })
  );
};

// Request to receive all existing miners
setTimeout(() => {
  writeMessageToPeers(MessageType.REQUEST_ALL_REGISTERED_MINERS, null);
}, 5000);

// setTimeout(() => {
//   writeMessageToPeers("hello", null);
// }, 10000);

//
setTimeout(() => {
  writeMessageToPeers(MessageType.REQUEST_BLOCK, {
    index: chain.getLatestBlock.index + 1,
  });
}, 5000);

// Register peer as miner
setTimeout(() => {
  registeredMiners.push(myPeerId.toString("hex"));
  console.log("----------Register my miner Start --------------");
  console.log(registeredMiners);
  writeMessageToPeers(MessageType.REGISTER_MINER, registeredMiners);
  console.log("----------Register my miner End --------------");
}, 7000);

// Cronjob to mine a new block every 30s
const job = new CronJob("30 * * * * *", () => {
  let index = 0; // first block
  if (lastBlockMinedBy) {
    let newIndex = registeredMiners[index];
    index = newIndex + 1 > registeredMiners.length - 1 ? 0 : newIndex + 1;
  }
  lastBlockMinedBy = registeredMiners[index]; // reassign
  console.log(
    "-- REQUESTING NEW BLOCK FROM: " +
      registeredMiners[index] +
      ", index: " +
      index
  );
  console.log("Current registered miners: " + JSON.stringify(registeredMiners));
  if (registeredMiners[index] === myPeerId.toString("hex")) {
    console.log("-----------Mining Next Block Start -----------------");
    let newBlock = chain.generateNextBlock(null);
    chain.addBlock(newBlock);
    console.log("New block generated: " + JSON.stringify(newBlock));
    writeMessageToPeers(MessageType.RECEIVE_NEW_BLOCK, newBlock); // broadcast new block to all peers
    console.log("Blockchain: " + JSON.stringify(chain.blockchain));
    console.log("-----------Mining Next Block End -----------------");
  }
});
job.start();
