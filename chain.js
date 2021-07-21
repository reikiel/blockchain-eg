let Block = require("./block").Block;
let BlockHeader = require("./block").BlockHeader;
let moment = require("moment");
let CryptoJS = require("crypto-js");
let level = require("level");
let fs = require("fs");

let db;

// as running multiple instance on same machine, cannot use same path for each peer
// separate path location using the folder name as the name of your pID
let createDb = (peerId) => {
  let dir = __dirname + "/db/" + peerId;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    db = level(dir);
    storeBlock(getGenesisBlock());
  }
};

// returns genesis block
let getGenesisBlock = () => {
  let blockHeader = new BlockHeader(
    1,
    null,
    "0x1bc3300000000000000000000000000000000000000000000",
    moment().unix()
  );
  return new Block(blockHeader, 0, null);
};

let getLatestBlock = () => blockchain[blockchain.length - 1];

let addBlock = (newBlock) => {
  let prevBlock = getLatestBlock();
  if (
    prevBlock.index < newBlock.index &&
    newBlock.blockHeader.previousBlockHeader ===
      prevBlock.blockHeader.merkleRoot
  ) {
    blockchain.push(newBlock);
  }
};

// store new block in db
let storeBlock = (newBlock) => {
  db.put(newBlock.index, JSON.stringify(newBlock), (err) => {
    if (err) return console.log("Error while inserting block into db: ", err);
    console.log("--- Inserting block index: " + newBlock.index);
  });
};

// get block from db
let getDbBlock = (index, res) => {
  db.get(index, (err, value) => {
    if (err) return res.send(JSON.stringify(err));
    return res.send(value);
  });
};

let getBlock = (index) => {
  if (blockchain.length - 1 >= index) return blockchain[index];
  else return null;
};

const blockchain = [getGenesisBlock()];

const generateNextBlock = (txns) => {
  const prevBlock = getLatestBlock();
  const prevMerkleRoot = prevBlock.blockHeader.merkleRoot;
  const nextIndex = prevBlock.index + 1;
  const nextTime = moment().unix();
  const nextMerkleRoot = CryptoJS.SHA256(
    1,
    prevMerkleRoot,
    nextTime
  ).toString();

  const blockHeader = new BlockHeader(
    1,
    prevMerkleRoot,
    nextMerkleRoot,
    nextTime
  );
  const newBlock = new Block(blockHeader, nextIndex, txns);
  blockchain.push(newBlock);
  storeBlock(newBlock);
  return newBlock;
};

if (typeof exports != "undefined") {
  exports.addBlock = addBlock;
  exports.getBlock = getBlock;
  exports.blockchain = blockchain;
  exports.getLatestBlock = getLatestBlock;
  exports.generateNextBlock = generateNextBlock;
  exports.createDb = createDb;
  exports.getDbBlock = getDbBlock;
}
