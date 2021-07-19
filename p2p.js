// needs to find and connect peers, deploy servers that are used to discover other peers, and get an available TCP poty
// discovery-swarm: used to create a network swarm that uses discovery-channel to find and connect peers
// dat-swarm-defaults: deploys servers that used to discover other peers
// get-port: gets available TCP ports
const crypto = require("crypto");
const Swarm = require("discovery-swarm");
const defaults = require("dat-swarm-defaults");
const getPort = require("get-port");
const chain = require("./chain");

const peers = {};
let connSeq = 0;
let channel = "myBlockchain";

// figure out purpose of messages
// define a switch mechanism so diff message types will be used for diff functions
// request and receive blocks - allows you to sync new peers that enter the P2P network and sync for any additional blocks you generate after the genesis block creation
let MessageType = {
  REQUEST_BLOCK: "requestBlock",
  RECEIVE_NEXT_BLOCK: "receiveNextBlock",
};

const myPeerId = crypto.randomBytes(32);
console.log("myPeerId: " + myPeerId.toString("hex"));

const config = defaults({
  id: myPeerId,
});

const swarm = Swarm(config);

// async function to continuously monitor swarm.on event messages
(async () => {
  const port = await getPort();

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
      }
    });

    // indicates you lost a connection with peers and delete from peers array
    conn.on("close", () => {
      console.log(`Connection ${seq} closed, peerId: ${peerId}`);
      if (peers[peerId].seq === seq) delete peers[peerId];
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

// setTimeout(() => {
//   writeMessageToPeers("hello", null);
// }, 10000);

//
setTimeout(() => {
  writeMessageToPeers(MessageType.REQUEST_BLOCK, {
    index: chain.getLatestBlock.index + 1,
  });
}, 5000);
