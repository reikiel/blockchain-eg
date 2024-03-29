let logger = require("../logger");

// set two commands: get and all
function Block(options) {
  this.options = options;
}

Block.DETAILS = {
  alias: "b",
  description: "block",
  commands: ["get", "all"],
  options: {
    create: Boolean,
  },
  shorthands: {
    s: ["--get"],
    a: ["--all"],
  },
  payload: function (payload, options) {
    options.start = true;
  },
};

Block.prototype.run = () => {
  let instance = this,
    options = instance.options;

  if (options.get) {
    instance.runCmd(
      "curl http://localhost:" +
        options.argv.original[2] +
        "/getBlock?index=" +
        options.argv.original[3]
    );
  }

  if (options.all) {
    instance.runCmd(
      "curl http://localhost:" + options.argv.original[2] + "/blocks"
    );
  }
};

Block.prototype.runCmd = (cmd) => {
  const { exec } = require("child_process");
  logger.log(cmd);
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      logger.log(`err: ${err}`);
      return;
    }
    logger.log(`stdout: ${stdout}`);
  });
};

exports.Impl = Block;
