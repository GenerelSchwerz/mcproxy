const { rejects } = require("assert");
const mc = require("minecraft-protocol");
const { resolve } = require("path");
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

function replicateLogin(client) {
  // client.once('login_start', async (data, meta) => {
  //     let idx = 0;
  //     // compress, success
  //     for (; idx < 2; idx++) {
  //         client.write(storePackets[idx].meta.name, storePackets[idx].data);
  //     }
  //     // C2S login_acknowledged
  //     for (; idx < storePackets.length; idx++) {
  //         client.write(storePackets[idx].meta.name, storePackets[idx].data);
  //     }
  // });
}

const botClient = mc.createClient({
  host: REMOTE_HOST,
  port: REMOTE_PORT,
  username: NAME,
  keepAlive: false,
  version: VERSION,
});

const targetWrite = botClient.write;
botClient.write = (name, params) => {
  if (botClient.state !== states.PLAY) console.log("C2S (bot):", name, botClient.state, params);
  targetWrite.call(botClient, name, params);
};

botClient.on("packet", function (data, meta) {
  if (meta.state !== states.PLAY) console.log("S2C (bot):", meta.name, meta.state, meta.name.includes('reg') ? `${data.id}: ${data.entries.length}` : data);
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
    console.log("Connection closed by server");
    if (!endedClient) {
      mcClient?.end("End");
    }
  });

  botClient.on("error", function (err) {
    endedTargetClient = true;
    console.log("Connection error by server", err);
    console.log(err.stack);
    if (!endedClient) {
      mcClient.end("Error");
    }
  });

const srv = mc.createServer({
  "online-mode": false,
  port: LOCAL_PORT,
  keepAlive: false,
  version: VERSION,
  // beforeLogin: function (client) {
    
  //   client.write('feature_flags', { features: ['minecraft:vanilla'] });
  //   client.write('select_known_packs', { packs: [{
  //       namespace: 'minecraft', id: 'core', version: '1.21.1'
  //   }] });

  

  //   client.once('select_known_packs',   () => console.log('sup'));

  // }
});



srv.on("connection", function (client) {
  const addr = client.socket.remoteAddress;
  if (!addr) return;
  console.log("Incoming connection", "(" + addr + ")\n\n\n\n\n");


  client.on("end", function () {
    endedClient = true;
    console.log("Connection closed by client", "(" + addr + ")");
    if (!endedTargetClient) {
      botClient.end("End");
    }
  });

  client.on("error", function (err) {
    endedClient = true;
    console.log("Connection error by client", "(" + addr + ")");
    console.log(err.stack);
    if (!endedTargetClient) {
      botClient.end("Error");
    }
  });

  replicateLogin(botClient);

  const write = client.write;

  client.write = (name, params) => {
    console.log("S2C (client):", name, client.state, name.includes('reg') ? `${params.id}: ${params.entries.length}` : params);
    write.call(client, name, params);
  };

  client.on('state', (now) => {
    if (now === states.PLAY) {
      client.write('login', mcData.loginPacket)
      client.write("position",
      {
        ...new Vec3(0, 0, 0),
        yaw: 180 - (0 * 180) / Math.PI,
        pitch: -(0 * 180) / Math.PI,
        flags: 0,
        teleportId: 1,
      })
    }

  })

  client.on("packet", function (data, meta) {
     console.log("C2S (client):", meta.name, meta.state, data);
    if (botClient.state === states.PLAY && meta.state === states.PLAY) {
      if (!endedTargetClient) {
        botClient.write(meta.name, data);
      }
    }
  });
});
