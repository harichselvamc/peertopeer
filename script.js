let peer;
let conn;

function joinRoom() {
  const roomId = document.getElementById('room-id').value.trim();
  if (!roomId) return alert("Enter a valid Room ID");

  peer = new Peer(roomId, {
    host: "peerjs.com", // Public PeerJS server
    port: 443,
    path: "/",
    secure: true
  });

  peer.on('open', (id) => {
    console.log("Your Peer ID:", id);
    document.getElementById("chat").classList.remove("hidden");
  });

  peer.on('connection', (connection) => {
    conn = connection;
    setupConnection();
  });

  // Try connecting to another peer (optional: you can use a room master idea for this)
  const targetId = prompt("Enter friend's ID (or leave blank to wait):");
  if (targetId) {
    conn = peer.connect(targetId);
    conn.on("open", setupConnection);
  }
}

function setupConnection() {
  conn.on("data", (data) => {
    const messages = document.getElementById("messages");
    messages.innerHTML += `<div><b>Them:</b> ${data}</div>`;
    messages.scrollTop = messages.scrollHeight;
  });
}

function sendMessage() {
  const input = document.getElementById("message-input");
  const msg = input.value;
  if (msg.trim() && conn && conn.open) {
    conn.send(msg);
    const messages = document.getElementById("messages");
    messages.innerHTML += `<div><b>You:</b> ${msg}</div>`;
    messages.scrollTop = messages.scrollHeight;
    input.value = "";
  }
}
