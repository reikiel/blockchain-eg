// needs to find and connect peers, deploy servers that are used to discover other peers, and get an available TCP poty
// discovery-swarm: used to create a network swarm that uses discovery-channel to find and connect peers
// dat-swarm-defaults: deploys servers that used to discover other peers
// get-port: gets available TCP ports
const crypto = require("crypto");
const Swarm = require("discovery-swarm");
const defaults = require("dat-swarm-defaults");
const getPort = require("get-port");

const peers = {};
let connSeq = 0;
let channel = "myBlockchain";

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

setTimeout(() => {
  writeMessageToPeers("hello", null);
}, 10000);

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
