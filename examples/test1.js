const mc = require("minecraft-protocol");
const md = require('minecraft-data')
const {Vec3} = require('vec3')
const states = mc.states;

const LOCAL_PORT = 25566;
const REMOTE_PORT = 25565;
const REMOTE_HOST = "127.0.0.1";
const VERSION = "1.21.1";
const NAME = "testing";

const mcData = md(VERSION);

let mcClient = null;
let endedClient = false;
let endedTargetClient = false;
const storePackets = [];

function replicateLogin(client) {}

const botClient = mc.createClient({
  host: REMOTE_HOST,
  port: REMOTE_PORT,
  username: NAME,
  keepAlive: false,
  version: VERSION,
});

const targetWrite = botClient.write;
botClient.write = (name, params) => {
  targetWrite.call(botClient, name, params);
};

botClient.on("packet", function (data, meta) {
  if (meta.state === states.CONFIGURATION || meta.state === states.LOGIN) {
    storePackets.push({ data, meta });
    return;
  }

  if (meta.state === states.PLAY && mcClient?.state === states.PLAY) {
    if (!endedClient) {
      mcClient.write(meta.name, data);
      if (meta.name === "set_compression") {
        mcClient.compressionThreshold = data.threshold;
      }
    }
  }
});

botClient.on("end", function () {
  endedTargetClient = true;
  if (!endedClient) {
    mcClient?.end("End");
  }
});

botClient.on("error", function () {
  endedTargetClient = true;
  if (!endedClient) {
    mcClient.end("Error");
  }
});

const srv = mc.createServer({
  "online-mode": false,
  port: LOCAL_PORT,
  keepAlive: false,
  version: VERSION,
});

srv.on("connection", function (client) {
  const addr = client.socket.remoteAddress;
  if (!addr) return;

  client.on("end", function () {
    endedClient = true;
    if (!endedTargetClient) {
      botClient.end("End");
    }
  });

  client.on("error", function () {
    endedClient = true;
    if (!endedTargetClient) {
      botClient.end("Error");
    }
  });

  client.on("packet", function (data, meta) {
    if (botClient.state === states.PLAY && meta.state === states.PLAY) {
      if (!endedTargetClient) {
        botClient.write(meta.name, data);
      }
    }
  });

  client.on('state', (now) => {
    if (now === states.PLAY) {
      client.write('login', mcData.loginPacket);
      client.write("position", {
        ...new Vec3(0, 0, 0),
        yaw: 180 - (0 * 180) / Math.PI,
        pitch: -(0 * 180) / Math.PI,
        flags: 0,
        teleportId: 1,
      });
    }
  });
});
