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

async () => {
  const port = await getPort();

  swarm.listen(port);
  console.log("Listening port: " + port);

  swarm.join(channel);
  swarm.on("connection", (conn, info) => {
    const seq = connSeq;
    const peerId = info.id.toString("hex");
    console.log(`Connected #${seq} to peer: ${peerId}`);

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
};
