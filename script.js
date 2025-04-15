let peer;
let conn;

// Auto-generate peer ID
peer = new Peer({
  host: "peerjs.com",
  port: 443,
  path: "/",
  secure: true
});

peer.on('open', (id) => {
  document.getElementById("my-id").innerText = id;
  console.log("✅ Your Peer ID:", id);
});

peer.on('connection', (connection) => {
  conn = connection;
  setupConnection();
});

function joinRoom() {
  const hostId = document.getElementById('room-id').value.trim();
  if (!hostId) return alert("Please enter a valid Room ID.");

  conn = peer.connect(hostId);
  conn.on("open", setupConnection);
}

function setupConnection() {
  document.getElementById("chat").classList.remove("hidden");

  conn.on("data", (data) => {
    appendMessage("Them", data);
  });
}

function sendMessage() {
  const input = document.getElementById("message-input");
  const msg = input.value.trim();
  if (msg && conn?.open) {
    conn.send(msg);
    appendMessage("You", msg);
    input.value = "";
  }
}

function appendMessage(sender, msg) {
  const messages = document.getElementById("messages");
  messages.innerHTML += `<div><b>${sender}:</b> ${msg}</div>`;
  messages.scrollTop = messages.scrollHeight;
}

function copyRoomId() {
  const id = document.getElementById("my-id").innerText;
  navigator.clipboard.writeText(id).then(() => {
    alert("Room ID copied!");
  });
}
